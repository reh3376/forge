"""Tests for TimescaleDB storage engine (using mock asyncpg pool)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.engines.timescale import TimescaleRecordReader, TimescaleRecordWriter


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


@pytest.fixture
def sample_record() -> ContextualRecord:
    return ContextualRecord(
        record_id=uuid4(),
        source=RecordSource(
            adapter_id="opcua-generic",
            system="ignition-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 12, 14, 30, 0, tzinfo=UTC),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            area="Area1",
            batch_id="B2026-0412-003",
            operating_mode="PRODUCTION",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/opcua-generic/v1",
            adapter_id="opcua-generic",
            adapter_version="0.1.0",
        ),
    )


class TestTimescaleRecordWriter:
    """Tests for TimescaleRecordWriter."""

    def test_pool_ok_with_pool(self, mock_pool):
        pool, _ = mock_pool
        writer = TimescaleRecordWriter(pool)
        assert writer._pool_ok()

    def test_pool_ok_without_pool(self):
        writer = TimescaleRecordWriter(None)
        assert not writer._pool_ok()

    @pytest.mark.asyncio
    async def test_write_record_no_pool_returns_false(self, sample_record):
        writer = TimescaleRecordWriter(None)
        result = await writer.write_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_record_success(self, mock_pool, sample_record):
        pool, conn = mock_pool
        writer = TimescaleRecordWriter(pool)
        result = await writer.write_record(sample_record)
        assert result is True
        conn.execute.assert_called_once()
        call_args = conn.execute.call_args
        assert "INSERT INTO forge_ts.contextual_records" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_write_record_handles_error(self, mock_pool, sample_record):
        pool, conn = mock_pool
        conn.execute.side_effect = Exception("connection lost")
        writer = TimescaleRecordWriter(pool)
        result = await writer.write_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_batch_no_pool(self, sample_record):
        writer = TimescaleRecordWriter(None)
        result = await writer.write_batch([sample_record])
        assert result == 0

    @pytest.mark.asyncio
    async def test_write_batch_empty(self, mock_pool):
        pool, _ = mock_pool
        writer = TimescaleRecordWriter(pool)
        result = await writer.write_batch([])
        assert result == 0

    @pytest.mark.asyncio
    async def test_write_batch_success(self, mock_pool, sample_record):
        pool, conn = mock_pool
        writer = TimescaleRecordWriter(pool)
        result = await writer.write_batch([sample_record, sample_record])
        assert result == 2
        conn.executemany.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_batch_handles_error(self, mock_pool, sample_record):
        pool, conn = mock_pool
        conn.executemany.side_effect = Exception("batch failed")
        writer = TimescaleRecordWriter(pool)
        result = await writer.write_batch([sample_record])
        assert result == 0

    def test_record_to_row_extracts_fields(self, sample_record):
        row = TimescaleRecordWriter._record_to_row(sample_record)
        assert len(row) == 16
        # Check key fields
        assert row[0] == sample_record.timestamp.source_time  # time
        assert row[1] == sample_record.record_id  # record_id
        assert row[2] == "opcua-generic"  # adapter_id
        assert row[3] == "ignition-prod"  # system
        assert row[4] == "Area1/Fermenter3/Temperature"  # tag_path
        assert row[7] == "GOOD"  # quality
        assert row[8] == "float64"  # data_type
        assert row[9] == "FERM-003"  # equipment_id
        assert row[10] == "Area1"  # area


class TestTimescaleRecordReader:
    """Tests for TimescaleRecordReader."""

    def test_pool_ok(self, mock_pool):
        pool, _ = mock_pool
        reader = TimescaleRecordReader(pool)
        assert reader._pool_ok()

    @pytest.mark.asyncio
    async def test_query_time_range_no_pool(self):
        reader = TimescaleRecordReader(None)
        result = await reader.query_time_range(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 12, 31, tzinfo=UTC),
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_query_time_range_success(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = [
            {"time": datetime.now(UTC), "record_id": "r1", "adapter_id": "a1"},
        ]
        reader = TimescaleRecordReader(pool)
        result = await reader.query_time_range(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 12, 31, tzinfo=UTC),
        )
        assert len(result) == 1
        assert result[0]["record_id"] == "r1"

    @pytest.mark.asyncio
    async def test_query_time_range_with_filters(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = []
        reader = TimescaleRecordReader(pool)
        await reader.query_time_range(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 12, 31, tzinfo=UTC),
            equipment_id="FERM-003",
            adapter_id="opcua-generic",
        )
        call_args = conn.fetch.call_args
        sql = call_args[0][0]
        assert "equipment_id = $3" in sql
        assert "adapter_id = $4" in sql

    @pytest.mark.asyncio
    async def test_query_by_equipment_no_pool(self):
        reader = TimescaleRecordReader(None)
        result = await reader.query_by_equipment("FERM-003")
        assert result == []

    @pytest.mark.asyncio
    async def test_query_by_equipment_success(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = [
            {"equipment_id": "FERM-003", "time": datetime.now(UTC)},
        ]
        reader = TimescaleRecordReader(pool)
        result = await reader.query_by_equipment("FERM-003")
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_count_records_no_pool(self):
        reader = TimescaleRecordReader(None)
        assert await reader.count_records() == 0

    @pytest.mark.asyncio
    async def test_count_records_with_range(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchval.return_value = 42
        reader = TimescaleRecordReader(pool)
        result = await reader.count_records(
            start=datetime(2026, 1, 1, tzinfo=UTC),
            end=datetime(2026, 12, 31, tzinfo=UTC),
        )
        assert result == 42

    @pytest.mark.asyncio
    async def test_count_records_no_range(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchval.return_value = 100
        reader = TimescaleRecordReader(pool)
        result = await reader.count_records()
        assert result == 100

    @pytest.mark.asyncio
    async def test_query_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.side_effect = Exception("query error")
        reader = TimescaleRecordReader(pool)
        result = await reader.query_time_range(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 12, 31, tzinfo=UTC),
        )
        assert result == []
