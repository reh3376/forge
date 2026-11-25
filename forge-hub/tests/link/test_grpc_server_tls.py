"""Hub gRPC server TLS/mTLS — the spoke → hub direction encrypted (FB-072)."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

import pytest
from tests.samples import module_manifest_path
from tests.tls import self_signed

from forge_core.coerce import AmbiguousValueError
from forge_core.link.grpc_channel import GrpcChannel
from forge_core.link.spoke_client import ChannelTls, SpokeClient
from forge_core.models.adapter import AdapterManifest
from forge_hub.ingest.pipeline import IngestPipeline, InMemoryRecordSink
from forge_hub.link.grpc_server import GrpcServer, ServerTls
from forge_hub.link.hub_ingest import HubIngestServicer
from forge_hub.link.hub_server import is_unguessable_session_id

if TYPE_CHECKING:
    from pathlib import Path

MANIFEST_PATH = module_manifest_path("forge-mes")


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

    with pytest.raises(ValueError, match="no CA"):
        ServerTls(cert_path="c", key_path="k", require_client_cert=True)


def _tls_env(monkeypatch, tmp_path: Path, *, ca: bool, require: str | None) -> None:
    for key in ("CERT", "KEY", "CA", "REQUIRE_CLIENT_CERT"):
        monkeypatch.delenv(f"FORGE_GRPC_TLS_{key}", raising=False)
    monkeypatch.setenv("FORGE_GRPC_TLS_CERT", str(tmp_path / "hub.pem"))
    monkeypatch.setenv("FORGE_GRPC_TLS_KEY", str(tmp_path / "hub.key"))
    if ca:
        monkeypatch.setenv("FORGE_GRPC_TLS_CA", str(tmp_path / "ca.pem"))
    if require is not None:
        monkeypatch.setenv("FORGE_GRPC_TLS_REQUIRE_CLIENT_CERT", require)


@pytest.mark.parametrize(
    ("word", "mtls"),
    [
        ("1", True),
        ("true", True),
        ("Yes", True),
        (" on ", True),
        ("0", False),
        ("false", False),
        ("NO", False),
        ("off", False),
        ("", True),
        ("  ", True),
    ],
)
def test_require_client_cert_is_read_by_the_one_boolean_rule(
    monkeypatch, tmp_path: Path, word: str, mtls: bool
) -> None:
    """FB-296: the words of ``forge_core.coerce``; unset or empty follows the CA."""
    _tls_env(monkeypatch, tmp_path, ca=True, require=word)
    assert ServerTls.from_env().mtls is mtls


@pytest.mark.parametrize("word", ["enabled", "required", "ture", "2", "y"])
def test_an_unclear_word_stops_the_hub_instead_of_turning_mtls_off(
    monkeypatch, tmp_path: Path, word: str
) -> None:
    """FB-296, proved on the old code: with a CA set, ``enabled`` read as "no" and the hub
    stopped requiring client certificates without a word. Now it is refused by name."""
    _tls_env(monkeypatch, tmp_path, ca=True, require=word)
    with pytest.raises(AmbiguousValueError, match="FORGE_GRPC_TLS_REQUIRE_CLIENT_CERT"):
        ServerTls.from_env()


def test_required_with_no_ca_is_refused_at_start(monkeypatch, tmp_path: Path) -> None:
    """It used to reach the server's start, where it was logged and swallowed (FB-300)."""
    _tls_env(monkeypatch, tmp_path, ca=False, require="true")
    with pytest.raises(ValueError, match="no CA"):
        ServerTls.from_env()


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
        assert is_unguessable_session_id(sid, "forge-mes")

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
        assert is_unguessable_session_id((await handshake(hub.port, client_tls)), "forge-mes")
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
