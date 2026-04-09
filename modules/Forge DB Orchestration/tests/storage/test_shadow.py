"""Tests for the Forge Shadow Writer."""

import uuid

import pytest
from datetime import datetime, timezone

from forge.core.models.contextual_record import (
    ContextualRecord,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.config import StorageConfig
from forge.storage.pool import PoolManager
from forge.storage.registry import SchemaEntry, SchemaRegistry, StorageEngine
from forge.storage.router import DataRouter
from forge.storage.shadow import ShadowWriter


def _make_record(
    system: str = "whk-wms",
    tag_path: str = "wms.barrel.create.123",
    record_id: uuid.UUID | None = None,
) -> ContextualRecord:
    return ContextualRecord(
        record_id=record_id or uuid.uuid4(),
        source=RecordSource(
            adapter_id=system,
            system=system,
            tag_path=tag_path,
            connection_id="conn-001",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
            server_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
        ),
        value=RecordValue(raw='{"id": "BBL-001"}', data_type="json"),
        context=RecordContext(
            equipment_id="EQ-001",
            area="Warehouse-A",
            extra={"entity_type": "Barrel"},
        ),
        lineage=RecordLineage(
            adapter_id=system,
            adapter_version="1.0.0",
            schema_ref=f"forge://schemas/{system}/v1.0.0",
        ),
    )


def _make_writer() -> ShadowWriter:
    registry = SchemaRegistry()
    router = DataRouter(registry=registry)
    pools = PoolManager(config=StorageConfig())
    return ShadowWriter(router=router, pools=pools)


class TestShadowWriter:
    """Verify shadow write operations and metrics tracking."""

    @pytest.mark.asyncio
    async def test_write_single_record(self):
        writer = _make_writer()
        record = _make_record()
        result = await writer.write(record)
        assert result.success is True
        assert result.record_id == str(record.record_id)
        assert result.engine == StorageEngine.POSTGRESQL

    @pytest.mark.asyncio
    async def test_write_tracks_metrics(self):
        writer = _make_writer()
        await writer.write(_make_record())
        await writer.write(_make_record())
        assert writer.metrics.records_written == 2
        assert writer.metrics.records_failed == 0
        assert writer.metrics.success_rate == 1.0

    @pytest.mark.asyncio
    async def test_write_tracks_by_spoke(self):
        writer = _make_writer()
        await writer.write(_make_record(system="whk-wms"))
        await writer.write(_make_record(system="whk-mes"))
        await writer.write(_make_record(system="whk-wms"))
        assert writer.metrics.by_spoke["whk-wms"] == 2
        assert writer.metrics.by_spoke["whk-mes"] == 1

    @pytest.mark.asyncio
    async def test_write_tracks_by_engine(self):
        writer = _make_writer()
        await writer.write(_make_record())
        assert "postgresql" in writer.metrics.by_engine

    @pytest.mark.asyncio
    async def test_disabled_writer_skips(self):
        writer = _make_writer()
        writer.disable()
        result = await writer.write(_make_record())
        assert result.success is False
        assert "disabled" in result.error
        assert writer.metrics.records_skipped == 1

    @pytest.mark.asyncio
    async def test_enable_disable_toggle(self):
        writer = _make_writer()
        writer.disable()
        assert writer._enabled is False
        writer.enable()
        assert writer._enabled is True

    @pytest.mark.asyncio
    async def test_write_batch(self):
        writer = _make_writer()
        records = [_make_record() for _ in range(3)]
        results = await writer.write_batch(records)
        assert len(results) == 3
        assert all(r.success for r in results)
        assert writer.metrics.records_written == 3

    @pytest.mark.asyncio
    async def test_buffer_accumulates(self):
        writer = _make_writer()
        await writer.write(_make_record())
        await writer.write(_make_record())
        assert writer.buffer_size == 2

    @pytest.mark.asyncio
    async def test_flush_buffer_drains(self):
        writer = _make_writer()
        await writer.write(_make_record())
        items = writer.flush_buffer()
        assert len(items) == 1
        assert writer.buffer_size == 0

    @pytest.mark.asyncio
    async def test_last_write_at_updated(self):
        writer = _make_writer()
        assert writer.metrics.last_write_at is None
        await writer.write(_make_record())
        assert writer.metrics.last_write_at is not None

    @pytest.mark.asyncio
    async def test_total_processed(self):
        writer = _make_writer()
        await writer.write(_make_record())
        writer.disable()
        await writer.write(_make_record())
        assert writer.metrics.total_processed == 2
        assert writer.metrics.records_written == 1
        assert writer.metrics.records_skipped == 1


class TestShadowWriterMetrics:
    """Verify metrics edge cases."""

    def test_success_rate_with_no_writes(self):
        writer = _make_writer()
        assert writer.metrics.success_rate == 1.0

    def test_total_processed_zero(self):
        writer = _make_writer()
        assert writer.metrics.total_processed == 0
