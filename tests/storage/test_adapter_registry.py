"""Adapter registry stores: in-memory and asyncpg-backed (FB-060)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.storage.adapter_registry import (
    _INSERT_BATCH,
    _SELECT_ADAPTERS,
    _SELECT_BATCHES,
    _UPSERT_ADAPTER,
    AdapterRow,
    IngestBatchRow,
    InMemoryAdapterRegistryStore,
    PostgresAdapterRegistryStore,
)

T0 = datetime(2026, 6, 1, 12, tzinfo=UTC)


def row(adapter_id: str = "forge-mes", **kw) -> AdapterRow:
    kw.setdefault("name", "Forge MES")
    kw.setdefault("manifest", {"adapter_id": adapter_id, "name": kw["name"]})
    kw.setdefault("registered_at", T0)
    return AdapterRow(adapter_id=adapter_id, **kw)


def batch(adapter_id: str = "forge-mes", **kw) -> IngestBatchRow:
    kw.setdefault("session_id", "session-1")
    kw.setdefault("batch_size", 3)
    kw.setdefault("ingested_at", T0)
    return IngestBatchRow(adapter_id=adapter_id, **kw)


async def test_in_memory_store_round_trip() -> None:
    store = InMemoryAdapterRegistryStore(max_batches=3)
    await store.save_adapter(row(state="HEALTHY"))
    await store.save_adapter(row("whk-wms", name="WMS"))
    later = row(state="DEGRADED", registered_at=datetime(2026, 7, 1, tzinfo=UTC))
    await store.save_adapter(later)  # re-registration keeps the first registered_at
    adapters = await store.list_adapters()
    assert [a.adapter_id for a in adapters] == ["forge-mes", "whk-wms"]
    assert adapters[0].state == "DEGRADED" and adapters[0].registered_at == T0
    assert len(store) == 2
    assert adapters[0].to_dict()["registered_at"] == T0.isoformat()

    for i in range(5):
        await store.log_batch(batch(adapter_id="forge-mes" if i % 2 else "whk-wms", persisted=i))
    rows = await store.list_batches()
    assert [r.id for r in rows] == [5, 4, 3]  # bounded, newest first
    assert [r.id for r in await store.list_batches("forge-mes")] == [4]
    assert await store.list_batches(limit=1) == rows[:1]
    assert rows[0].to_dict()["ingested_at"] == T0.isoformat()


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


async def test_postgres_store_upserts_and_logs(mock_pool) -> None:
    pool, conn = mock_pool
    store = PostgresAdapterRegistryStore(pool)
    health = {"adapter_id": "forge-mes", "state": "HEALTHY", "records_collected": 7}
    await store.save_adapter(
        row(state="HEALTHY", health=health, last_health_at=T0, tier="MES_MOM", protocol="grpc")
    )
    sql, *params = conn.execute.call_args_list[0].args
    assert sql is _UPSERT_ADAPTER
    assert params[0] == "forge-mes" and params[6] == "HEALTHY"
    assert json.loads(params[7]) == {"adapter_id": "forge-mes", "name": "Forge MES"}
    assert json.loads(params[8]) == health and params[10] == T0

    await store.log_batch(batch(accepted=3, persisted=2, failed=1, errors=["sink down"]))
    sql, *params = conn.execute.call_args_list[1].args
    assert sql is _INSERT_BATCH
    assert params[:7] == ["forge-mes", "session-1", 3, 3, 0, 2, 1]
    assert json.loads(params[7]) == ["sink down"] and params[8] == T0
    assert store.write_failures == 0


async def test_postgres_store_reads_rows_and_parses_json_text(mock_pool) -> None:
    pool, conn = mock_pool
    store = PostgresAdapterRegistryStore(pool)
    conn.fetch = AsyncMock(
        side_effect=[
            [
                {
                    "adapter_id": "forge-mes",
                    "name": "Forge MES",
                    "version": "0.1.0",
                    "type": "INGESTION",
                    "tier": "MES_MOM",
                    "protocol": "grpc",
                    "state": "HEALTHY",
                    "manifest": json.dumps({"adapter_id": "forge-mes"}),  # json column as text
                    "health": None,
                    "registered_at": T0,
                    "last_health_at": None,
                }
            ],
            [
                {
                    "id": 9,
                    "adapter_id": "forge-mes",
                    "session_id": None,
                    "batch_size": 2,
                    "accepted": 2,
                    "rejected": 0,
                    "persisted": 2,
                    "failed": 0,
                    "errors": '["x"]',
                    "ingested_at": T0,
                }
            ],
        ]
    )
    adapters = await store.list_adapters()
    assert conn.fetch.call_args_list[0].args[0] is _SELECT_ADAPTERS
    assert adapters[0].manifest == {"adapter_id": "forge-mes"} and adapters[0].health is None

    batches = await store.list_batches("forge-mes", limit=5)
    assert conn.fetch.call_args_list[1].args == (_SELECT_BATCHES, "forge-mes", 5)
    assert batches[0].id == 9 and batches[0].session_id == "" and batches[0].errors == ["x"]


async def test_postgres_store_failures_are_counted_not_raised(mock_pool) -> None:
    pool, conn = mock_pool
    conn.execute = AsyncMock(side_effect=RuntimeError("db down"))
    conn.fetch = AsyncMock(side_effect=RuntimeError("db down"))
    store = PostgresAdapterRegistryStore(pool)
    await store.save_adapter(row())
    await store.log_batch(batch())
    assert await store.list_adapters() == [] and await store.list_batches() == []
    assert store.write_failures == 2 and store.read_failures == 2

    without_pool = PostgresAdapterRegistryStore(None)
    await without_pool.save_adapter(row())
    assert await without_pool.list_adapters() == []
    assert without_pool.write_failures == 0
