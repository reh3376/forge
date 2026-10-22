"""REST ingest goes through the shared IngestPipeline (FB-053)."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from forge.api.main import create_app
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    DataContract,
)
from forge.ingest.pipeline import IngestPipeline, InMemoryRecordSink
from forge.storage.config import StorageConfig


def _manifest(adapter_id: str = "whk-wms") -> dict:
    return AdapterManifest(
        adapter_id=adapter_id,
        name=f"Test {adapter_id}",
        version="1.0.0",
        tier="MES_MOM",
        protocol="grpc",
        capabilities=AdapterCapabilities(read=True, subscribe=True),
        data_contract=DataContract(
            schema_ref=f"forge://schemas/{adapter_id}/v1",
            context_fields=["event_type", "equipment_id"],
        ),
    ).model_dump(mode="json")


@pytest.fixture()
def sink() -> InMemoryRecordSink:
    return InMemoryRecordSink()


@pytest.fixture()
def app(sink: InMemoryRecordSink):
    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        return create_app(
            storage_config=StorageConfig(),
            ingest_pipeline=IngestPipeline(fallback_sink=sink),
        )


@pytest.fixture()
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_raw_readings_are_wrapped_and_persisted(client, sink: InMemoryRecordSink) -> None:
    await client.post("/v1/adapters/register", json=_manifest())
    resp = await client.post(
        "/v1/records",
        json={"adapter_id": "whk-wms", "records": [{"tag": "temp", "value": 72.5}, {"value": 1}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "accepted": 2,
        "rejected": 0,
        "persisted": 2,
        "errors": [],
        # curation on ingest (FB-009): no product feeds on whk-wms here
        "curated": {},
        "curation_errors": [],
    }
    assert len(sink) == 2
    assert sink.records[0].source.adapter_id == "whk-wms"
    assert sink.records[0].lineage.schema_ref == "forge://schemas/whk-wms/v1"


@pytest.mark.asyncio
async def test_full_records_are_validated_against_the_manifest(
    client, sink: InMemoryRecordSink
) -> None:
    await client.post("/v1/adapters/register", json=_manifest())
    good = {
        "source": {"adapter_id": "whk-wms", "system": "whk-wms-prod", "tag_path": "a.b"},
        "timestamp": {"source_time": "2026-06-01T12:00:00Z"},
        "value": {"raw": 1, "data_type": "int64"},
        "context": {"equipment_id": "E1", "extra": {"event_type": "x"}},
        "lineage": {
            "schema_ref": "forge://schemas/whk-wms/v1",
            "adapter_id": "whk-wms",
            "adapter_version": "1.0.0",
        },
    }
    wrong_schema = {**good, "lineage": {**good["lineage"], "schema_ref": "forge://schemas/old/v0"}}
    resp = await client.post(
        "/v1/records", json={"adapter_id": "whk-wms", "records": [good, wrong_schema]}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] == 1 and body["rejected"] == 1 and body["persisted"] == 1
    assert any("schema_ref" in e for e in body["errors"])
    assert len(sink) == 1


@pytest.mark.asyncio
async def test_hub_stamps_receipt_on_rest_records(client, sink: InMemoryRecordSink) -> None:
    """ingestion_time is the hub's clock on receipt; what the client sent is kept as sent_time."""
    await client.post("/v1/adapters/register", json=_manifest())
    full = {
        "source": {"adapter_id": "whk-wms", "system": "whk-wms-prod", "tag_path": "a.b"},
        "timestamp": {
            "source_time": "2026-06-01T12:00:00Z",
            "ingestion_time": "2026-06-01T12:00:02Z",
        },
        "value": {"raw": 1, "data_type": "int64"},
        "context": {"equipment_id": "E1", "extra": {"event_type": "x"}},
        "lineage": {
            "schema_ref": "forge://schemas/whk-wms/v1",
            "adapter_id": "whk-wms",
            "adapter_version": "1.0.0",
        },
    }
    before = datetime.now(UTC)
    resp = await client.post(
        "/v1/records", json={"adapter_id": "whk-wms", "records": [full, {"tag": "t", "value": 1}]}
    )
    assert resp.status_code == 200 and resp.json()["persisted"] == 2
    stamped, bare = sink.records[0].timestamp, sink.records[1].timestamp
    assert stamped.sent_time == datetime(2026, 6, 1, 12, 0, 2, tzinfo=UTC)
    assert before <= stamped.ingestion_time <= datetime.now(UTC)
    assert bare.sent_time is None and bare.ingestion_time == stamped.ingestion_time


@pytest.mark.asyncio
async def test_ingest_stats_expose_the_measured_clock_offsets(
    client, sink: InMemoryRecordSink
) -> None:
    """/v1/ingest/stats carries the clock offsets the hub measured per adapter and link (FB-089)."""
    await client.post("/v1/adapters/register", json=_manifest())
    record = {
        "source": {"adapter_id": "whk-wms", "system": "whk-wms-prod", "tag_path": "a.b"},
        "timestamp": {
            "source_time": "2026-06-01T12:00:00Z",
            "server_time": "2026-06-01T12:00:01Z",
            "ingestion_time": "2026-06-01T12:00:02Z",
        },
        "value": {"raw": 1, "data_type": "int64"},
        "context": {"equipment_id": "E1", "extra": {"event_type": "x"}},
        "lineage": {
            "schema_ref": "forge://schemas/whk-wms/v1",
            "adapter_id": "whk-wms",
            "adapter_version": "1.0.0",
        },
    }
    await client.post("/v1/records", json={"adapter_id": "whk-wms", "records": [record]})
    offsets = (await client.get("/v1/ingest/stats")).json()["pipeline"]["clock_offsets"]
    links = offsets["adapters"]["whk-wms"]
    assert set(links) == {"spoke", "server", "source"}
    assert links["source"]["last_seconds"] == -1.0 and links["source"]["within_tolerance"] is True
    # a stamp from June against today's hub clock: far outside any tolerance
    assert links["spoke"]["within_tolerance"] is False and offsets["breaches"] >= 2
    assert offsets["tolerance_seconds"] > 0


@pytest.mark.asyncio
async def test_unknown_adapter_still_404(client) -> None:
    resp = await client.post("/v1/records", json={"adapter_id": "nope", "records": [{"value": 1}]})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_ingest_stats_endpoint(client, sink: InMemoryRecordSink) -> None:
    await client.post("/v1/adapters/register", json=_manifest())
    await client.post("/v1/records", json={"adapter_id": "whk-wms", "records": [{"value": 1}]})
    resp = await client.get("/v1/ingest/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["grpc"] is None  # gRPC disabled in this app
    assert body["pipeline"]["fallback_sink"] == "InMemoryRecordSink"
    assert body["pipeline"]["stats"]["persisted"] == 1
    assert body["pipeline"]["stats"]["batches"] == 1
