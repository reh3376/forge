"""Tests for PostgresSchemaStore (using mock asyncpg pool)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.registry.models import (
    CompatibilityMode,
    SchemaMetadata,
    SchemaType,
)
from forge.registry.postgres_store import PostgresSchemaStore


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    # conn.transaction() is a sync call returning an async context manager.
    # Override it with a MagicMock so it doesn't become a coroutine.
    tx_cm = MagicMock()
    tx_cm.__aenter__ = AsyncMock(return_value=None)
    tx_cm.__aexit__ = AsyncMock(return_value=False)
    conn.transaction = MagicMock(return_value=tx_cm)
    return pool, conn


@pytest.fixture
def sample_metadata() -> SchemaMetadata:
    m = SchemaMetadata(
        schema_id="forge://schemas/whk-wms/Barrel",
        name="Barrel Schema",
        schema_type=SchemaType.ADAPTER_OUTPUT,
        compatibility=CompatibilityMode.BACKWARD,
        owner="alice",
        description="WMS barrel entity schema",
        tags=["wms", "barrel"],
    )
    m.add_version(
        {"type": "object", "properties": {"barrel_id": {"type": "string"}}},
        description="Initial version",
    )
    return m


def _make_schema_row(m: SchemaMetadata) -> dict:
    return {
        "schema_id": m.schema_id,
        "name": m.name,
        "schema_type": m.schema_type.value,
        "compatibility": m.compatibility.value,
        "latest_version": m.latest_version,
        "owner": m.owner,
        "description": m.description,
        "tags": m.tags,
        "status": m.status,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
    }


def _make_version_rows(m: SchemaMetadata) -> list[dict]:
    return [
        {
            "version": v.version,
            "schema_json": json.dumps(v.schema_json),
            "integrity_hash": v.integrity_hash,
            "description": v.description,
            "previous_version": v.previous_version,
            "created_at": v.created_at,
        }
        for v in m.versions
    ]


class TestPostgresSchemaStore:
    def test_pool_ok_with_pool(self, mock_pool):
        pool, _ = mock_pool
        store = PostgresSchemaStore(pool)
        assert store._pool_ok()

    def test_pool_ok_without_pool(self):
        store = PostgresSchemaStore(None)
        assert not store._pool_ok()

    # -- save ----------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_save_no_pool(self, sample_metadata):
        store = PostgresSchemaStore(None)
        await store.save(sample_metadata)
        # no-op, no error

    @pytest.mark.asyncio
    async def test_save_success(self, mock_pool, sample_metadata):
        pool, conn = mock_pool
        store = PostgresSchemaStore(pool)
        await store.save(sample_metadata)
        # 1 upsert for schema + 1 upsert per version
        assert conn.execute.call_count == 2
        first_call = conn.execute.call_args_list[0]
        assert "INSERT INTO forge_core.registry_schemas" in first_call[0][0]

    @pytest.mark.asyncio
    async def test_save_handles_error(self, mock_pool, sample_metadata):
        pool, conn = mock_pool
        conn.execute.side_effect = Exception("db down")
        store = PostgresSchemaStore(pool)
        # should not raise
        await store.save(sample_metadata)

    # -- get -----------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_get_no_pool(self):
        store = PostgresSchemaStore(None)
        assert await store.get("s1") is None

    @pytest.mark.asyncio
    async def test_get_not_found(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = None
        store = PostgresSchemaStore(pool)
        assert await store.get("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_success(self, mock_pool, sample_metadata):
        pool, conn = mock_pool
        conn.fetchrow.return_value = _make_schema_row(sample_metadata)
        conn.fetch.return_value = _make_version_rows(sample_metadata)
        store = PostgresSchemaStore(pool)
        result = await store.get(sample_metadata.schema_id)
        assert result is not None
        assert result.schema_id == sample_metadata.schema_id
        assert result.name == "Barrel Schema"
        assert len(result.versions) == 1
        assert result.versions[0].version == 1

    @pytest.mark.asyncio
    async def test_get_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.side_effect = Exception("query error")
        store = PostgresSchemaStore(pool)
        assert await store.get("s1") is None

    # -- list_all ------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_list_all_no_pool(self):
        store = PostgresSchemaStore(None)
        assert await store.list_all() == []

    @pytest.mark.asyncio
    async def test_list_all_empty(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = []
        store = PostgresSchemaStore(pool)
        result = await store.list_all()
        assert result == []

    @pytest.mark.asyncio
    async def test_list_all_with_results(self, mock_pool, sample_metadata):
        pool, conn = mock_pool
        # First fetch call returns list of schema rows
        # Subsequent fetch calls return version rows for each schema
        conn.fetch.side_effect = [
            [_make_schema_row(sample_metadata)],
            _make_version_rows(sample_metadata),
        ]
        store = PostgresSchemaStore(pool)
        result = await store.list_all()
        assert len(result) == 1
        assert result[0].schema_id == sample_metadata.schema_id

    @pytest.mark.asyncio
    async def test_list_all_with_filters(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = []
        store = PostgresSchemaStore(pool)
        await store.list_all(schema_type="adapter_output", owner="alice")
        sql = conn.fetch.call_args[0][0]
        assert "schema_type = $1" in sql
        assert "owner = $2" in sql

    @pytest.mark.asyncio
    async def test_list_all_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.side_effect = Exception("query error")
        store = PostgresSchemaStore(pool)
        assert await store.list_all() == []

    # -- delete --------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_delete_no_pool(self):
        store = PostgresSchemaStore(None)
        assert await store.delete("s1") is False

    @pytest.mark.asyncio
    async def test_delete_success(self, mock_pool):
        pool, conn = mock_pool
        conn.execute.return_value = "DELETE 1"
        store = PostgresSchemaStore(pool)
        assert await store.delete("s1") is True
        assert conn.execute.call_count == 2  # versions + schema

    @pytest.mark.asyncio
    async def test_delete_not_found(self, mock_pool):
        pool, conn = mock_pool
        conn.execute.return_value = "DELETE 0"
        store = PostgresSchemaStore(pool)
        assert await store.delete("nonexistent") is False

    @pytest.mark.asyncio
    async def test_delete_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.execute.side_effect = Exception("db error")
        store = PostgresSchemaStore(pool)
        assert await store.delete("s1") is False

    # -- count ---------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_count_no_pool(self):
        store = PostgresSchemaStore(None)
        assert await store.count() == 0

    @pytest.mark.asyncio
    async def test_count_success(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchval.return_value = 42
        store = PostgresSchemaStore(pool)
        assert await store.count() == 42

    @pytest.mark.asyncio
    async def test_count_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchval.side_effect = Exception("db error")
        store = PostgresSchemaStore(pool)
        assert await store.count() == 0

    # -- row conversion ------------------------------------------------------

    def test_row_to_metadata_parses_json_string(self, sample_metadata):
        row = _make_schema_row(sample_metadata)
        v_rows = _make_version_rows(sample_metadata)
        result = PostgresSchemaStore._row_to_metadata(row, v_rows)
        assert result.schema_type == SchemaType.ADAPTER_OUTPUT
        assert result.compatibility == CompatibilityMode.BACKWARD
        assert isinstance(result.versions[0].schema_json, dict)

    def test_row_to_metadata_handles_dict_schema(self, sample_metadata):
        row = _make_schema_row(sample_metadata)
        v_rows = _make_version_rows(sample_metadata)
        # Simulate asyncpg returning a dict directly (jsonb column)
        v_rows[0]["schema_json"] = sample_metadata.versions[0].schema_json
        result = PostgresSchemaStore._row_to_metadata(row, v_rows)
        assert isinstance(result.versions[0].schema_json, dict)

    def test_row_to_metadata_handles_nulls(self):
        row = {
            "schema_id": "s1",
            "name": "Test",
            "schema_type": "api",
            "compatibility": "NONE",
            "latest_version": 0,
            "owner": None,
            "description": None,
            "tags": None,
            "status": None,
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
            "updated_at": datetime(2026, 1, 1, tzinfo=UTC),
        }
        result = PostgresSchemaStore._row_to_metadata(row, [])
        assert result.owner == ""
        assert result.description == ""
        assert result.tags == []
        assert result.status == "active"
