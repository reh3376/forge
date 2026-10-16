"""Hub gRPC server TLS/mTLS — the spoke → hub direction encrypted (FB-072)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from forge.core.models.adapter import AdapterManifest
from forge.ingest.pipeline import IngestPipeline, InMemoryRecordSink
from forge.transport.grpc_channel import GrpcChannel
from forge.transport.grpc_server import GrpcServer, ServerTls
from forge.transport.hub_ingest import HubIngestServicer
from forge.transport.spoke_client import ChannelTls, SpokeClient
from tests.transport.test_callback_auth import self_signed

MANIFEST_PATH = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "forge"
    / "adapters"
    / "forge_mes"
    / "manifest.json"
)


def mes_manifest() -> AdapterManifest:
    return AdapterManifest.model_validate(json.loads(MANIFEST_PATH.read_text()))


async def handshake(port: int, tls: ChannelTls | None) -> str:
    channel = GrpcChannel(f"localhost:{port}", tls=tls)
    await channel.connect()
    try:
        spoke = SpokeClient(channel=channel)
        sid = await spoke.register(mes_manifest())
        await spoke.configure({"graphql_url": "http://mes/graphql"})
        await spoke.start()
        health = await spoke.health()
        assert health["adapter_id"] == "forge-mes"
        return sid
    finally:
        await channel.close()


def test_server_tls_from_env(monkeypatch, tmp_path: Path) -> None:
    for key in ("CERT", "KEY", "CA", "REQUIRE_CLIENT_CERT"):
        monkeypatch.delenv(f"FORGE_GRPC_TLS_{key}", raising=False)
    assert ServerTls.from_env() is None

    monkeypatch.setenv("FORGE_GRPC_TLS_CERT", str(tmp_path / "hub.pem"))
    with pytest.raises(ValueError, match="both"):
        ServerTls.from_env()

    monkeypatch.setenv("FORGE_GRPC_TLS_KEY", str(tmp_path / "hub.key"))
    tls = ServerTls.from_env()
    assert tls == ServerTls(cert_path=str(tmp_path / "hub.pem"), key_path=str(tmp_path / "hub.key"))
    assert tls.mtls is False and tls.describe() == {"enabled": True, "mtls": False, "ca": False}

    monkeypatch.setenv("FORGE_GRPC_TLS_CA", str(tmp_path / "ca.pem"))
    assert ServerTls.from_env().mtls is True  # a CA implies client certificates
    monkeypatch.setenv("FORGE_GRPC_TLS_REQUIRE_CLIENT_CERT", "false")
    assert ServerTls.from_env().mtls is False  # unless switched off explicitly

    with pytest.raises(ValueError, match="ca_path"):
        ServerTls(cert_path="c", key_path="k", require_client_cert=True).credentials()


async def test_spoke_handshake_over_tls_and_plaintext_refused(tmp_path: Path) -> None:
    cert_path, key_path = self_signed(tmp_path)
    sink = InMemoryRecordSink()
    servicer = HubIngestServicer(IngestPipeline(fallback_sink=sink))
    hub = GrpcServer(
        servicer, port=0, host="localhost", tls=ServerTls(str(cert_path), str(key_path))
    )
    assert hub.describe()["tls"] == {"enabled": True, "mtls": False, "ca": False}
    await hub.start()
    try:
        sid = await handshake(hub.port, ChannelTls(ca_path=str(cert_path)))
        assert sid.startswith("session-forge-mes")

        # A plaintext client cannot talk to the TLS port.
        with pytest.raises(Exception):  # noqa: B017 — grpc raises AioRpcError(UNAVAILABLE)
            await asyncio.wait_for(handshake(hub.port, None), timeout=15)
    finally:
        await hub.stop(grace=0.5)


async def test_mtls_requires_a_trusted_client_certificate(tmp_path: Path) -> None:
    cert_path, key_path = self_signed(tmp_path)
    servicer = HubIngestServicer(IngestPipeline(fallback_sink=InMemoryRecordSink()))
    tls = ServerTls(str(cert_path), str(key_path), ca_path=str(cert_path))
    assert tls.mtls is True
    hub = GrpcServer(servicer, port=0, host="localhost", tls=tls)
    await hub.start()
    try:
        client_tls = ChannelTls(
            ca_path=str(cert_path), cert_path=str(cert_path), key_path=str(key_path)
        )
        assert (await handshake(hub.port, client_tls)).startswith("session-forge-mes")
        with pytest.raises(Exception):  # noqa: B017 — handshake fails without a client cert
            await asyncio.wait_for(
                handshake(hub.port, ChannelTls(ca_path=str(cert_path))), timeout=15
            )
    finally:
        await hub.stop(grace=0.5)


async def test_require_tls_refuses_plaintext_start() -> None:
    servicer = HubIngestServicer(IngestPipeline(fallback_sink=InMemoryRecordSink()))
    hub = GrpcServer(servicer, port=0, host="localhost", require_tls=True)
    assert hub.describe() == {
        "address": "localhost:0",
        "require_tls": True,
        "tls": {"enabled": False},
    }
    with pytest.raises(RuntimeError, match="FORGE_GRPC_REQUIRE_TLS"):
        await hub.start()
    await hub.stop()  # nothing to stop; must not raise
