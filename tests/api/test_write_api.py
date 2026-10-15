"""REST write-back: POST /v1/adapters/{id}/write, /tags, /v1/writes (FB-054)."""

from __future__ import annotations

import os
from typing import Any
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.main import create_app
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    DataContract,
)
from forge.storage.config import StorageConfig
from forge.transport.spoke_callback import CALLBACK_PARAM, WriteDispatcher
from forge.transport.spoke_client import InMemoryChannel


def _manifest(adapter_id: str = "forge-mes", *, write: bool = True) -> dict:
    return AdapterManifest(
        adapter_id=adapter_id,
        name=f"Test {adapter_id}",
        version="0.1.0",
        tier="MES_MOM",
        protocol="grpc",
        capabilities=AdapterCapabilities(read=True, write=write),
        data_contract=DataContract(schema_ref=f"forge://schemas/{adapter_id}/v0.1.0"),
    ).model_dump(mode="json")


class FakeSpoke:
    def __init__(self) -> None:
        self.writes: list[dict[str, Any]] = []
        self.down = False

    async def write(self, adapter_id, session_id, tag_path, value, confirm):
        if self.down:
            raise ConnectionError("unreachable")
        self.writes.append({"tag_path": tag_path, "value": value, "confirm": confirm})
        return {"success": value != "bad", "message": "ok" if value != "bad" else "refused"}

    async def discover(self, adapter_id, session_id):
        return {"tags": [{"tag_path": "mes.changeover.cooker.request", "data_type": "object"}]}


@pytest.fixture()
def spoke() -> FakeSpoke:
    return FakeSpoke()


@pytest.fixture()
def app(spoke: FakeSpoke):
    async def factory(url: str):
        return InMemoryChannel(spoke)

    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        application = create_app(storage_config=StorageConfig())
        # Use the app's own capability gate but an in-memory channel.
        default: WriteDispatcher = application.state.write_dispatcher
        default._channel_factory = factory
        return application


@pytest.fixture()
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _register_with_callback(client, app, adapter_id="forge-mes", *, write=True) -> None:
    await client.post("/v1/adapters/register", json=_manifest(adapter_id, write=write))
    app.state.write_dispatcher.register_callback(
        adapter_id, "sess-1", {CALLBACK_PARAM: "mes-backend:50052"}
    )


async def test_write_round_trip_and_stats(client, app, spoke: FakeSpoke) -> None:
    await _register_with_callback(client, app)
    resp = await client.post(
        "/v1/adapters/forge-mes/write",
        json={"tag_path": "mes.changeover.cooker.request", "value": {"requestedBy": "ot"}},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True and body["message"] == "ok"
    assert body["readback"] is None
    assert spoke.writes == [
        {
            "tag_path": "mes.changeover.cooker.request",
            "value": {"requestedBy": "ot"},
            "confirm": False,
        }
    ]

    resp = await client.post(
        "/v1/adapters/forge-mes/write", json={"tag_path": "mes.x", "value": "bad", "confirm": True}
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is False and resp.json()["message"] == "refused"

    stats = (await client.get("/v1/writes")).json()
    target = stats["targets"][0]
    assert target["adapter_id"] == "forge-mes"
    assert (target["writes"], target["succeeded"], target["failed"]) == (2, 1, 1)

    tags = (await client.get("/v1/adapters/forge-mes/tags")).json()
    assert tags["tags"][0]["tag_path"] == "mes.changeover.cooker.request"


async def test_error_mapping(client, app, spoke: FakeSpoke) -> None:
    # unknown adapter
    resp = await client.post("/v1/adapters/ghost/write", json={"tag_path": "t", "value": 1})
    assert resp.status_code == 404

    # registered but never advertised a callback
    await client.post("/v1/adapters/register", json=_manifest("forge-mes"))
    resp = await client.post("/v1/adapters/forge-mes/write", json={"tag_path": "t", "value": 1})
    assert resp.status_code == 409
    assert CALLBACK_PARAM in resp.json()["detail"]

    # read-only adapter with a callback
    await _register_with_callback(client, app, "whk-wms", write=False)
    resp = await client.post("/v1/adapters/whk-wms/write", json={"tag_path": "t", "value": 1})
    assert resp.status_code == 403

    # spoke unreachable
    await _register_with_callback(client, app)
    spoke.down = True
    resp = await client.post("/v1/adapters/forge-mes/write", json={"tag_path": "t", "value": 1})
    assert resp.status_code == 502
    assert "unreachable" in resp.json()["detail"]
