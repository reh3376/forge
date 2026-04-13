"""Tests for Redis storage engine (using mock redis client)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock
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
from forge.storage.engines.redis_engine import RedisSchemaCache, RedisStateCache


@pytest.fixture
def mock_client():
    """Create a mock redis.asyncio client."""
    return AsyncMock()


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
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/opcua-generic/v1",
            adapter_id="opcua-generic",
            adapter_version="0.1.0",
        ),
    )


class TestRedisStateCache:
    """Tests for RedisStateCache."""

    def test_client_ok(self, mock_client):
        cache = RedisStateCache(mock_client)
        assert cache._client_ok()

    def test_client_ok_none(self):
        cache = RedisStateCache(None)
        assert not cache._client_ok()

    @pytest.mark.asyncio
    async def test_cache_record_no_client(self, sample_record):
        cache = RedisStateCache(None)
        result = await cache.cache_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_cache_record_success(self, mock_client, sample_record):
        cache = RedisStateCache(mock_client, ttl=60)
        result = await cache.cache_record(sample_record)
        assert result is True
        # Should SET the record key
        mock_client.set.assert_called()
        key = mock_client.set.call_args_list[0][0][0]
        assert key == f"forge:record:{sample_record.record_id}"
        # Should HSET the equipment key
        mock_client.hset.assert_called_once()
        eq_key = mock_client.hset.call_args[0][0]
        assert eq_key == "forge:state:equipment:FERM-003"

    @pytest.mark.asyncio
    async def test_cache_record_handles_error(self, mock_client, sample_record):
        mock_client.set.side_effect = Exception("redis down")
        cache = RedisStateCache(mock_client)
        result = await cache.cache_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_get_record_no_client(self):
        cache = RedisStateCache(None)
        result = await cache.get_record("r1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_record_found(self, mock_client):
        data = {"record_id": "r1", "raw": 42}
        mock_client.get.return_value = json.dumps(data)
        cache = RedisStateCache(mock_client)
        result = await cache.get_record("r1")
        assert result is not None
        assert result["record_id"] == "r1"

    @pytest.mark.asyncio
    async def test_get_record_not_found(self, mock_client):
        mock_client.get.return_value = None
        cache = RedisStateCache(mock_client)
        result = await cache.get_record("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_equipment_state_no_client(self):
        cache = RedisStateCache(None)
        result = await cache.get_equipment_state("FERM-003")
        assert result == {}

    @pytest.mark.asyncio
    async def test_get_equipment_state_success(self, mock_client):
        mock_client.hgetall.return_value = {
            b"Area1/Temp": json.dumps({"raw": 78.4}).encode(),
            b"Area1/Pressure": json.dumps({"raw": 14.7}).encode(),
        }
        cache = RedisStateCache(mock_client)
        result = await cache.get_equipment_state("FERM-003")
        assert len(result) == 2
        assert result["Area1/Temp"]["raw"] == 78.4

    @pytest.mark.asyncio
    async def test_set_adapter_health(self, mock_client):
        cache = RedisStateCache(mock_client, ttl=120)
        result = await cache.set_adapter_health("whk-wms", {"status": "healthy"})
        assert result is True
        mock_client.set.assert_called_once()
        key = mock_client.set.call_args[0][0]
        assert key == "forge:state:adapter:whk-wms"

    @pytest.mark.asyncio
    async def test_set_adapter_health_no_client(self):
        cache = RedisStateCache(None)
        result = await cache.set_adapter_health("whk-wms", {})
        assert result is False

    @pytest.mark.asyncio
    async def test_get_adapter_health(self, mock_client):
        mock_client.get.return_value = json.dumps({"status": "healthy"})
        cache = RedisStateCache(mock_client)
        result = await cache.get_adapter_health("whk-wms")
        assert result == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_get_adapter_health_not_found(self, mock_client):
        mock_client.get.return_value = None
        cache = RedisStateCache(mock_client)
        result = await cache.get_adapter_health("missing")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, mock_client):
        cache = RedisStateCache(mock_client)
        result = await cache.delete("forge:record:r1")
        assert result is True
        mock_client.delete.assert_called_once_with("forge:record:r1")

    @pytest.mark.asyncio
    async def test_delete_no_client(self):
        cache = RedisStateCache(None)
        result = await cache.delete("forge:record:r1")
        assert result is False


class TestRedisSchemaCache:
    """Tests for RedisSchemaCache."""

    def test_client_ok(self, mock_client):
        cache = RedisSchemaCache(mock_client)
        assert cache._client_ok()

    def test_client_ok_none(self):
        cache = RedisSchemaCache(None)
        assert not cache._client_ok()

    @pytest.mark.asyncio
    async def test_get_no_client(self):
        cache = RedisSchemaCache(None)
        assert await cache.get("forge://schemas/test") is None

    @pytest.mark.asyncio
    async def test_get_found(self, mock_client):
        mock_client.get.return_value = json.dumps({"schema_id": "s1"})
        cache = RedisSchemaCache(mock_client)
        result = await cache.get("s1")
        assert result is not None
        assert result["schema_id"] == "s1"

    @pytest.mark.asyncio
    async def test_get_not_found(self, mock_client):
        mock_client.get.return_value = None
        cache = RedisSchemaCache(mock_client)
        result = await cache.get("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_set(self, mock_client):
        cache = RedisSchemaCache(mock_client, ttl=600)
        result = await cache.set("s1", {"schema_id": "s1"})
        assert result is True
        mock_client.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_no_client(self):
        cache = RedisSchemaCache(None)
        assert await cache.set("s1", {}) is False

    @pytest.mark.asyncio
    async def test_invalidate(self, mock_client):
        cache = RedisSchemaCache(mock_client)
        result = await cache.invalidate("s1")
        assert result is True
        mock_client.delete.assert_called_once_with("forge:schema:s1")

    @pytest.mark.asyncio
    async def test_invalidate_no_client(self):
        cache = RedisSchemaCache(None)
        assert await cache.invalidate("s1") is False

    @pytest.mark.asyncio
    async def test_invalidate_all(self, mock_client):
        async def _scan_iter(**kwargs):
            for key in [b"forge:schema:s1", b"forge:schema:s2"]:
                yield key

        mock_client.scan_iter = _scan_iter
        cache = RedisSchemaCache(mock_client)
        result = await cache.invalidate_all()
        assert result == 2

    @pytest.mark.asyncio
    async def test_invalidate_all_no_client(self):
        cache = RedisSchemaCache(None)
        assert await cache.invalidate_all() == 0


class AsyncIterator:
    """Helper to make a list behave as an async iterator."""

    def __init__(self, items):
        self._items = iter(items)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._items)
        except StopIteration:
            raise StopAsyncIteration  # noqa: B904
