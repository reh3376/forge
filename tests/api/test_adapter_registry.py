"""The hub remembers its spokes across restarts and logs every ingested batch (FB-060)."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from forge.api.main import create_app
from forge.api.registry import AdapterRegistry
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    DataContract,
)
from forge.ingest.pipeline import IngestOutcome
from forge.storage.adapter_registry import AdapterRow, InMemoryAdapterRegistryStore
from forge.storage.config import StorageConfig


def manifest(adapter_id: str = "forge-mes") -> AdapterManifest:
    return AdapterManifest(
        adapter_id=adapter_id,
        name=f"Test {adapter_id}",
        version="1.0.0",
        type="INGESTION",
        tier="MES_MOM",
        protocol="grpc",
        capabilities=AdapterCapabilities(read=True, subscribe=True),
        data_contract=DataContract(
            schema_ref=f"forge://schemas/{adapter_id}/v1",
            output_format="contextual_record",
            context_fields=["event_type"],
        ),
    )


def health(adapter_id: str, state: AdapterState, at: datetime, collected: int = 0) -> AdapterHealth:
    return AdapterHealth(
        adapter_id=adapter_id, state=state, last_check=at, records_collected=collected
    )


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 6, 1, 12, tzinfo=UTC)

    def now(self) -> datetime:
        return self.t


class FailingStore(InMemoryAdapterRegistryStore):
    async def save_adapter(self, row: AdapterRow) -> None:
        raise RuntimeError("db down")


# ---------------------------------------------------------------------------
# AdapterRegistry
# ---------------------------------------------------------------------------


async def test_registered_persists_and_load_restores() -> None:
    store = InMemoryAdapterRegistryStore()
    clock = Clock()
    first = AdapterRegistry(store, now=clock.now)
    await first.registered(manifest("forge-mes"))
    await first.health_reported("forge-mes", health("forge-mes", AdapterState.HEALTHY, clock.t, 42))
    assert first.describe()["persisted"] == 2 and first.describe()["pending"] == 0
    stored = (await store.list_adapters())[0]
    assert stored.state == "HEALTHY" and stored.health["records_collected"] == 42
    assert stored.manifest["data_contract"]["schema_ref"] == "forge://schemas/forge-mes/v1"

    # A fresh hub process: the cache is empty until load().
    second = AdapterRegistry(store, now=clock.now)
    assert second.list_all() == []
    assert await second.load() == 1
    assert second.get_manifest("forge-mes").name == "Test forge-mes"
    assert second.list_all()[0].state == "HEALTHY"
    assert second.get_health("forge-mes").records_collected == 42
    assert second.describe()["restored"] == 1
    # Loading again does not clobber what the running hub already knows.
    second.register(manifest("whk-wms"))
    assert await second.load() == 0 and second.describe()["pending"] == 1
    assert await second.flush() == 1 and len(store) == 2


async def test_heartbeats_are_throttled_unless_the_state_changes() -> None:
    store = InMemoryAdapterRegistryStore()
    clock = Clock()
    registry = AdapterRegistry(store, health_persist_interval=30, now=clock.now)
    await registry.registered(manifest())
    assert registry.persisted == 1

    await registry.health_reported("forge-mes", health("forge-mes", AdapterState.HEALTHY, clock.t))
    assert registry.persisted == 2  # REGISTERED -> HEALTHY: state changed
    clock.t += timedelta(seconds=5)
    await registry.health_reported(
        "forge-mes", health("forge-mes", AdapterState.HEALTHY, clock.t, 5)
    )
    assert registry.persisted == 2  # same state, inside the interval: cache only
    assert registry.get_health("forge-mes").records_collected == 5
    clock.t += timedelta(seconds=30)
    await registry.health_reported(
        "forge-mes", health("forge-mes", AdapterState.HEALTHY, clock.t, 9)
    )
    assert registry.persisted == 3  # interval elapsed
    assert (await store.list_adapters())[0].health["records_collected"] == 9
    await registry.health_reported("ghost", health("ghost", AdapterState.HEALTHY, clock.t))
    assert registry.persisted == 3  # unknown adapter: nothing to persist


async def test_log_batch_and_store_failures() -> None:
    store = InMemoryAdapterRegistryStore()
    registry = AdapterRegistry(store)
    outcome = IngestOutcome(received=4, accepted=3, rejected=1, persisted=3, errors=["bad record"])
    await registry.log_batch("forge-mes", "session-1", outcome)
    rows = await registry.ingest_log("forge-mes")
    assert (
        rows[0]["batch_size"] == 4
        and rows[0]["persisted"] == 3
        and rows[0]["errors"] == ["bad record"]
    )
    assert registry.batches_logged == 1

    broken = AdapterRegistry(FailingStore())
    await broken.registered(manifest())
    assert broken.persist_failures == 1 and broken.describe()["pending"] == 1
    assert broken.get_manifest("forge-mes") is not None  # the cache still serves


# ---------------------------------------------------------------------------
# Hub API
# ---------------------------------------------------------------------------


def _app(store: Any) -> Any:
    with patch.dict(os.environ, {"FORGE_GRPC_ENABLED": "false"}):
        return create_app(storage_config=StorageConfig(), adapter_registry_store=store)


def test_hub_restart_remembers_registered_spokes_and_logs_rest_batches() -> None:
    store = InMemoryAdapterRegistryStore()
    with TestClient(_app(store)) as client:
        assert (
            client.post(
                "/v1/adapters/register", json=manifest().model_dump(mode="json")
            ).status_code
            == 200
        )
        info = client.get("/v1/info").json()["adapter_registry"]
        assert info["store"] == "InMemoryAdapterRegistryStore" and info["persisted"] == 1
        record = {
            "source": {"adapter_id": "forge-mes", "system": "forge-mes", "tag_path": "x"},
            "timestamp": {"source_time": "2026-06-01T12:00:00Z"},
            "value": {"raw": 1, "quality": "GOOD", "data_type": "number"},
            "context": {"extra": {"event_type": "t"}},
            "lineage": {
                "schema_ref": "forge://schemas/forge-mes/v1",
                "adapter_id": "forge-mes",
                "adapter_version": "1.0.0",
            },
        }
        r = client.post(
            "/v1/records", json={"adapter_id": "forge-mes", "records": [record, record]}
        )
        assert r.status_code == 200 and r.json()["accepted"] == 2
        log = client.get("/v1/adapters/forge-mes/ingest-log").json()
        assert len(log) == 1 and log[0]["session_id"] == "rest" and log[0]["batch_size"] == 2
        assert (
            client.get("/v1/ingest/log", params={"limit": 5}).json()[0]["adapter_id"] == "forge-mes"
        )
        assert client.get("/v1/adapters/nope/ingest-log").status_code == 404

    # Same store, new process: the spoke is still known.
    with TestClient(_app(store)) as client:
        adapters = client.get("/v1/adapters").json()
        assert [a["adapter_id"] for a in adapters] == ["forge-mes"]
        assert client.get("/v1/info").json()["adapter_registry"]["restored"] == 1
        assert client.get("/v1/adapters/forge-mes/health").status_code == 200
        assert len(client.get("/v1/ingest/log").json()) == 1
