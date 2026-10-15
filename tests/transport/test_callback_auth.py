"""Callback hardening: per-spoke token in metadata and TLS to the spoke port (FB-063)."""

from __future__ import annotations

import asyncio
import datetime as dt
from pathlib import Path  # noqa: TC003 — used for real files below

import grpc
import grpc.aio
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from forge.proto_gen.forge.v1 import adapter_service_pb2 as service_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2_grpc as service_grpc
from forge.transport.grpc_channel import GrpcChannel
from forge.transport.spoke_callback import (
    CALLBACK_PARAM,
    CALLBACK_TOKEN_HEADER,
    CALLBACK_TOKEN_PARAM,
    WriteDispatcher,
    WriteDispatchError,
)
from forge.transport.spoke_client import ChannelTls, InMemoryChannel


class FakeSpoke:
    async def write(self, adapter_id, session_id, tag_path, value, confirm):
        return {"success": True, "message": "ok", "readback": None}

    async def discover(self, adapter_id, session_id):
        return {"tags": []}


# ---------------------------------------------------------------------------
# Token travels from Configure to every callback as metadata
# ---------------------------------------------------------------------------


async def test_token_is_registered_masked_and_sent_as_metadata() -> None:
    channels: list[InMemoryChannel] = []

    async def factory(url: str):
        channels.append(InMemoryChannel(FakeSpoke()))
        return channels[-1]

    dispatcher = WriteDispatcher(channel_factory=factory)
    target = dispatcher.register_callback(
        "forge-mes",
        "sess-1",
        {CALLBACK_PARAM: "mes-backend:50052", CALLBACK_TOKEN_PARAM: " tok-1 "},
    )
    assert target is not None and target.token == "tok-1"
    assert target.to_dict()["token_set"] is True and "token" not in target.to_dict()
    assert dispatcher.snapshot()["token_param"] == CALLBACK_TOKEN_PARAM
    assert dispatcher.snapshot()["tls"] is None

    assert (await dispatcher.write("forge-mes", "t", 1)).success
    assert channels[0].metadata == [(CALLBACK_TOKEN_HEADER, "tok-1")]

    # Re-Configure on the same URL rotates the token on the live channel.
    dispatcher.register_callback(
        "forge-mes", "sess-2", {CALLBACK_PARAM: "mes-backend:50052", CALLBACK_TOKEN_PARAM: "tok-2"}
    )
    assert channels[0].metadata == [(CALLBACK_TOKEN_HEADER, "tok-2")]
    dispatcher.register_callback("forge-mes", "sess-3", {CALLBACK_PARAM: "mes-backend:50052"})
    assert channels[0].metadata == [] and dispatcher.target_for("forge-mes").token is None
    await dispatcher.close()


# ---------------------------------------------------------------------------
# Live: a spoke that checks the token, over plaintext and over TLS
# ---------------------------------------------------------------------------


class TokenStub(service_grpc.AdapterServiceServicer):
    def __init__(self, token: str) -> None:
        self.token = token
        self.seen: list[str | None] = []

    async def Write(self, request, context):  # noqa: N802
        presented = dict(context.invocation_metadata()).get(CALLBACK_TOKEN_HEADER)
        self.seen.append(presented)
        if presented != self.token:
            await context.abort(
                grpc.StatusCode.PERMISSION_DENIED, "callback token missing or invalid"
            )
        return service_msg.WriteResponse(success=True, message="ok")


def self_signed(tmp_path: Path) -> tuple[Path, Path]:
    """A localhost certificate usable as server cert, trust root and client cert."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = dt.datetime.now(dt.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=1))
        .not_valid_after(now + dt.timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(__import__("ipaddress").ip_address("127.0.0.1")),
                ]
            ),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    cert_path = tmp_path / "spoke.pem"
    key_path = tmp_path / "spoke.key"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    return cert_path, key_path


async def test_live_plaintext_spoke_rejects_a_missing_or_wrong_token() -> None:
    stub = TokenStub("secret-7")
    server = grpc.aio.server()
    service_grpc.add_AdapterServiceServicer_to_server(stub, server)
    port = server.add_insecure_port("localhost:0")
    await server.start()
    try:
        dispatcher = WriteDispatcher()
        dispatcher.register_callback("forge-mes", "s", {CALLBACK_PARAM: f"localhost:{port}"})
        with pytest.raises(WriteDispatchError) as info:
            await dispatcher.write("forge-mes", "t", 1)
        assert info.value.code == "transport" and "callback token" in info.value.message
        assert stub.seen == [None]

        dispatcher.register_callback(
            "forge-mes",
            "s",
            {CALLBACK_PARAM: f"localhost:{port}", CALLBACK_TOKEN_PARAM: "secret-7"},
        )
        assert (await dispatcher.write("forge-mes", "t", 1)).success
        assert stub.seen[-1] == "secret-7"
        await dispatcher.close()
    finally:
        await server.stop(grace=0.5)


async def test_live_tls_and_mtls_to_the_spoke(tmp_path: Path) -> None:
    cert_path, key_path = self_signed(tmp_path)
    cert_pem, key_pem = cert_path.read_bytes(), key_path.read_bytes()

    # Server-only TLS.
    stub = TokenStub("tok")
    server = grpc.aio.server()
    service_grpc.add_AdapterServiceServicer_to_server(stub, server)
    port = server.add_secure_port("localhost:0", grpc.ssl_server_credentials([(key_pem, cert_pem)]))
    await server.start()
    try:
        tls = ChannelTls(ca_path=str(cert_path))
        assert tls.describe() == {"ca": True, "client_certificate": False}
        dispatcher = WriteDispatcher(tls=tls)
        assert dispatcher.snapshot()["tls"] == {"ca": True, "client_certificate": False}
        dispatcher.register_callback(
            "forge-mes", "s", {CALLBACK_PARAM: f"localhost:{port}", CALLBACK_TOKEN_PARAM: "tok"}
        )
        assert (await dispatcher.write("forge-mes", "t", 1)).success
        channel = dispatcher._channels["forge-mes"]
        assert isinstance(channel, GrpcChannel) and channel.tls is tls
        await dispatcher.close()

        # Plaintext to the TLS port fails as a transport error, never hangs.
        plain = WriteDispatcher()
        plain.register_callback(
            "forge-mes", "s", {CALLBACK_PARAM: f"localhost:{port}", CALLBACK_TOKEN_PARAM: "tok"}
        )
        with pytest.raises(WriteDispatchError) as info:
            await asyncio.wait_for(plain.write("forge-mes", "t", 1), timeout=15)
        assert info.value.code == "transport"
        await plain.close()
    finally:
        await server.stop(grace=0.5)

    # mTLS: the server requires a client certificate it trusts.
    stub = TokenStub("tok")
    server = grpc.aio.server()
    service_grpc.add_AdapterServiceServicer_to_server(stub, server)
    port = server.add_secure_port(
        "localhost:0",
        grpc.ssl_server_credentials(
            [(key_pem, cert_pem)], root_certificates=cert_pem, require_client_auth=True
        ),
    )
    await server.start()
    try:
        mtls = ChannelTls(ca_path=str(cert_path), cert_path=str(cert_path), key_path=str(key_path))
        dispatcher = WriteDispatcher(tls=mtls)
        dispatcher.register_callback(
            "forge-mes", "s", {CALLBACK_PARAM: f"localhost:{port}", CALLBACK_TOKEN_PARAM: "tok"}
        )
        assert (await dispatcher.write("forge-mes", "t", 1)).success
        await dispatcher.close()

        no_client_cert = WriteDispatcher(tls=ChannelTls(ca_path=str(cert_path)))
        no_client_cert.register_callback(
            "forge-mes", "s", {CALLBACK_PARAM: f"localhost:{port}", CALLBACK_TOKEN_PARAM: "tok"}
        )
        with pytest.raises(WriteDispatchError):
            await asyncio.wait_for(no_client_cert.write("forge-mes", "t", 1), timeout=15)
        await no_client_cert.close()
    finally:
        await server.stop(grace=0.5)


def test_channel_tls_from_env_and_validation(monkeypatch, tmp_path: Path) -> None:
    for key in ("FORGE_SPOKE_TLS_CA", "FORGE_SPOKE_TLS_CERT", "FORGE_SPOKE_TLS_KEY"):
        monkeypatch.delenv(key, raising=False)
    assert ChannelTls.from_env() is None
    monkeypatch.setenv("FORGE_SPOKE_TLS_CA", str(tmp_path / "ca.pem"))
    tls = ChannelTls.from_env()
    assert tls == ChannelTls(ca_path=str(tmp_path / "ca.pem"))
    with pytest.raises(ValueError, match="both cert_path and key_path"):
        ChannelTls(ca_path=None, cert_path="c.pem").credentials()
