"""The endpoints that drive a spoke sit behind the hub's auth once it is enabled (FB-063)."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.main import create_app
from forge.core.models.adapter import AdapterCapabilities, AdapterManifest, DataContract
from forge.gateway.auth import configure_auth
from forge.gateway.models import AuthConfig
from forge.storage.config import StorageConfig
from forge.transport.spoke_callback import CALLBACK_PARAM, WriteDispatcher
from forge.transport.spoke_client import InMemoryChannel

OPS = {"X-API-Key": "ops-key"}
VIEW = {"X-API-Key": "view-key"}


class FakeSpoke:
    async def write(self, adapter_id, session_id, tag_path, value, confirm):
        return {"success": True, "message": "ok", "readback": None}

    async def discover(self, adapter_id, session_id):
        return {"tags": [{"tag_path": "mes.changeover.cooker.request", "data_type": "object"}]}

    async def subscribe(self, adapter_id, session_id, tags):
        yield {"subscription_id": "sub-1"}

    async def unsubscribe(self, adapter_id, session_id, subscription_id):
        return {"success": True, "message": "ended"}


@pytest.fixture()
def app():
    env = {
        "FORGE_GRPC_ENABLED": "false",
        "FORGE_AUTH_ENABLED": "true",
        "FORGE_API_KEYS": "ops-key:ops:operator,view-key:viewer:viewer",
    }
    with patch.dict(os.environ, env):
        application = create_app(storage_config=StorageConfig())
    dispatcher: WriteDispatcher = application.state.write_dispatcher

    async def factory(url: str):
        return InMemoryChannel(FakeSpoke())

    dispatcher._channel_factory = factory
    manifest = AdapterManifest(
        adapter_id="forge-mes",
        name="MES",
        version="0.1.0",
        tier="MES_MOM",
        protocol="grpc",
        capabilities=AdapterCapabilities(read=True, write=True),
        data_contract=DataContract(schema_ref="forge://schemas/forge-mes/v0.1.0"),
    )
    application.state.adapter_registry.register(manifest)
    dispatcher.register_callback("forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"})
    yield application
    # The gateway config is process-global: put the kill-switch back for other tests.
    configure_auth(AuthConfig(enabled=False))


@pytest.fixture()
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    await app.state.subscriptions.close()


async def test_write_path_requires_the_adapters_write_scope(client) -> None:
    body = {"tag_path": "mes.changeover.cooker.request", "value": {"requestedBy": "ot"}}
    assert (await client.post("/v1/adapters/forge-mes/write", json=body)).status_code == 401
    denied = await client.post("/v1/adapters/forge-mes/write", json=body, headers=VIEW)
    assert denied.status_code == 403 and "adapters:write" in denied.json()["detail"]
    allowed = await client.post("/v1/adapters/forge-mes/write", json=body, headers=OPS)
    assert allowed.status_code == 200 and allowed.json()["success"] is True

    backfill = {"start_time": "2026-06-01T00:00:00Z", "end_time": "2026-06-02T00:00:00Z"}
    assert (await client.post("/v1/adapters/forge-mes/backfill", json=backfill)).status_code == 401
    assert (
        await client.post("/v1/adapters/forge-mes/backfill", json=backfill, headers=VIEW)
    ).status_code == 403

    assert (await client.post("/v1/adapters/forge-mes/subscriptions", json={})).status_code == 401
    opened = await client.post("/v1/adapters/forge-mes/subscriptions", json={}, headers=OPS)
    assert opened.status_code == 200
    sid = opened.json()["subscription_id"]
    assert (await client.delete(f"/v1/adapters/forge-mes/subscriptions/{sid}")).status_code == 401
    assert (
        await client.delete(f"/v1/adapters/forge-mes/subscriptions/{sid}", headers=VIEW)
    ).status_code == 403
    assert (
        await client.delete(f"/v1/adapters/forge-mes/subscriptions/{sid}", headers=OPS)
    ).status_code == 200


async def test_reads_stay_open(client) -> None:
    # Read endpoints keep the behaviour they had (FB-007 tracks protecting the rest of the API).
    assert (await client.get("/v1/adapters")).status_code == 200
    assert (await client.get("/v1/adapters/forge-mes/tags")).status_code == 200
    assert (await client.get("/v1/writes")).json()["token_param"] == "grpc_callback_token"
    assert (await client.get("/v1/adapters/forge-mes/subscriptions")).status_code == 200
