"""The hub app serves its gRPC port with TLS from the environment (FB-072)."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from forge.api.main import create_app
from forge.core.models.adapter import AdapterManifest
from forge.storage.config import StorageConfig
from forge.transport.grpc_channel import GrpcChannel
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


def _register_over_tls(port: int, ca_path: Path) -> str:
    async def run() -> str:
        channel = GrpcChannel(f"localhost:{port}", tls=ChannelTls(ca_path=str(ca_path)))
        await channel.connect()
        try:
            spoke = SpokeClient(channel=channel)
            manifest = AdapterManifest.model_validate(json.loads(MANIFEST_PATH.read_text()))
            return await spoke.register(manifest)
        finally:
            await channel.close()

    return asyncio.run(run())


def test_hub_grpc_port_serves_tls_from_env(tmp_path: Path) -> None:
    cert_path, key_path = self_signed(tmp_path)
    env = {
        "FORGE_GRPC_ENABLED": "true",
        "FORGE_GRPC_PORT": "0",
        "FORGE_GRPC_TLS_CERT": str(cert_path),
        "FORGE_GRPC_TLS_KEY": str(key_path),
        "FORGE_GRPC_REQUIRE_TLS": "true",
        "FORGE_OT_CONTROL_CONFIG": "",
    }
    with patch.dict(os.environ, env):
        app = create_app(storage_config=StorageConfig())
        assert app.state.grpc_server is None
        with TestClient(app) as client:
            server = app.state.grpc_server
            assert server is not None and server.port > 0
            info = client.get("/v1/info").json()
            assert info["grpc_tls"] == {
                "enabled": True,
                "mtls": False,
                "ca": False,
                "required": True,
            }

            sid = _register_over_tls(server.port, cert_path)
            assert sid.startswith("session-forge-mes")
            assert "forge-mes" in {a["adapter_id"] for a in client.get("/v1/adapters").json()}


def test_required_tls_without_material_fails_startup() -> None:
    env = {
        "FORGE_GRPC_ENABLED": "true",
        "FORGE_GRPC_PORT": "0",
        "FORGE_GRPC_TLS_CERT": "",
        "FORGE_GRPC_TLS_KEY": "",
        "FORGE_GRPC_REQUIRE_TLS": "true",
        "FORGE_OT_CONTROL_CONFIG": "",
    }
    with patch.dict(os.environ, env):
        app = create_app(storage_config=StorageConfig())
        assert client_info(app)["grpc_tls"] == {"enabled": False, "required": True}
        with pytest.raises(RuntimeError, match="FORGE_GRPC_REQUIRE_TLS"), TestClient(app):
            pass


def client_info(app) -> dict:
    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        # /v1/info needs no lifespan; read it without starting the servers.
        from httpx import ASGITransport, AsyncClient

        async def run() -> dict:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
                return (await ac.get("/v1/info")).json()

        return asyncio.run(run())
