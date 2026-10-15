"""REST pull from a spoke: POST /v1/adapters/{id}/backfill and /subscriptions (FB-061)."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.main import create_app
from forge.core.models.adapter import AdapterManifest
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.config import StorageConfig
from forge.transport.serialization import pydantic_to_proto
from forge.transport.spoke_callback import CALLBACK_PARAM, WriteDispatcher
from forge.transport.spoke_client import InMemoryChannel

MANIFEST_PATH = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "forge"
    / "adapters"
    / "forge_mes"
    / "manifest.json"
)
MANIFEST = json.loads(MANIFEST_PATH.read_text())
SCHEMA_REF = MANIFEST["data_contract"]["schema_ref"]
T0 = datetime(2026, 6, 1, 12, tzinfo=UTC)


def record(i: int) -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(
            adapter_id="forge-mes", system="forge-mes", tag_path="mes.backend.batch"
        ),
        timestamp=RecordTimestamp(source_time=T0 + timedelta(seconds=i)),
        value=RecordValue(raw={"i": i}, quality=QualityCode.GOOD, data_type="object"),
        context=RecordContext(area="distillery01", extra={"event_type": "audit.update"}),
        lineage=RecordLineage(
            schema_ref=SCHEMA_REF, adapter_id="forge-mes", adapter_version="0.1.0"
        ),
    )


class FakeSpoke:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.queues: dict[str, asyncio.Queue[ContextualRecord | None]] = {}
        self.seq = 0

    async def backfill(self, adapter_id, session_id, tags, start, end, max_records):
        self.calls.append({"tags": tags, "start": start, "end": end, "max_records": max_records})
        for i in range(max_records or 7):
            yield pydantic_to_proto(record(i))

    async def subscribe(self, adapter_id, session_id, tags):
        self.seq += 1
        sid = f"sub-{self.seq}"
        queue: asyncio.Queue[ContextualRecord | None] = asyncio.Queue()
        self.queues[sid] = queue
        yield {"subscription_id": sid}
        while (item := await queue.get()) is not None:
            yield pydantic_to_proto(item)

    async def unsubscribe(self, adapter_id, session_id, subscription_id):
        queue = self.queues.pop(subscription_id, None)
        if queue is None:
            return {"success": False, "message": "unknown"}
        queue.put_nowait(None)
        return {"success": True, "message": "ended"}


@pytest.fixture()
def spoke() -> FakeSpoke:
    return FakeSpoke()


@pytest.fixture()
def app(spoke: FakeSpoke):
    async def factory(url: str):
        return InMemoryChannel(spoke)

    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        application = create_app(storage_config=StorageConfig())
        dispatcher: WriteDispatcher = application.state.write_dispatcher
        dispatcher._channel_factory = factory
        return application


@pytest.fixture()
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    await app.state.subscriptions.close()


async def _register(client: AsyncClient, app) -> None:
    manifest = AdapterManifest.model_validate(MANIFEST).model_dump(mode="json")
    assert (await client.post("/v1/adapters/register", json=manifest)).status_code == 200
    app.state.write_dispatcher.register_callback(
        "forge-mes", "sess-1", {CALLBACK_PARAM: "mes-backend:50052"}
    )


async def wait_for(predicate, *, timeout: float = 3.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.01)


async def test_backfill_endpoint_replays_and_logs(client, app, spoke) -> None:
    body = {
        "start_time": T0.isoformat(),
        "end_time": (T0 + timedelta(hours=1)).isoformat(),
        "tags": ["mes.backend"],
        "max_records": 7,
        "batch_size": 3,
    }
    resp = await client.post("/v1/adapters/forge-mes/backfill", json=body)
    assert resp.status_code == 404  # not registered yet

    await _register(client, app)
    resp = await client.post("/v1/adapters/forge-mes/backfill", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert (data["received"], data["persisted"], data["batches"]) == (7, 7, 3)
    assert data["mode"] == "backfill" and data["completed_at"]
    assert spoke.calls[0]["tags"] == ["mes.backend"] and spoke.calls[0]["start"] == T0
    assert len(app.state.ingest_pipeline.fallback_sink) == 7

    log = (await client.get("/v1/adapters/forge-mes/ingest-log")).json()
    assert [row["session_id"] for row in log] == ["backfill"] * 3
    assert sum(row["persisted"] for row in log) == 7

    bad = await client.post(
        "/v1/adapters/forge-mes/backfill",
        json={**body, "end_time": (T0 - timedelta(hours=1)).isoformat()},
    )
    assert bad.status_code == 422

    app.state.write_dispatcher.forget("sess-1")
    resp = await client.post("/v1/adapters/forge-mes/backfill", json=body)
    assert resp.status_code == 409 and CALLBACK_PARAM in resp.json()["detail"]


async def test_subscription_endpoints_stream_into_the_pipeline(client, app, spoke) -> None:
    assert (await client.post("/v1/adapters/forge-mes/subscriptions", json={})).status_code == 404
    await _register(client, app)

    opened = await client.post(
        "/v1/adapters/forge-mes/subscriptions", json={"tags": ["mes.backend"]}
    )
    assert opened.status_code == 200, opened.text
    sid = opened.json()["subscription_id"]
    assert sid == "sub-1" and opened.json()["active"] is True

    listed = (await client.get("/v1/adapters/forge-mes/subscriptions")).json()
    assert [s["subscription_id"] for s in listed] == [sid]
    assert (await client.get("/v1/subscriptions")).json()["active"] == 1

    spoke.queues[sid].put_nowait(record(1))
    spoke.queues[sid].put_nowait(record(2))
    sink = app.state.ingest_pipeline.fallback_sink
    await wait_for(lambda: len(sink) == 2)

    closed = await client.delete(f"/v1/adapters/forge-mes/subscriptions/{sid}")
    assert closed.status_code == 200, closed.text
    assert closed.json()["active"] is False and closed.json()["persisted"] == 2
    assert sid not in spoke.queues
    assert (await client.get("/v1/adapters/forge-mes/subscriptions")).json() == []
    assert (await client.delete(f"/v1/adapters/forge-mes/subscriptions/{sid}")).status_code == 404

    log = (await client.get("/v1/ingest/log")).json()
    assert log[0]["session_id"] == f"subscription:{sid}" and log[0]["persisted"] == 2
