"""Tests for PostgreSQL storage engine (using mock asyncpg pool)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.core.models.data_product import (
    DataProduct,
    DataProductSchema,
    DataProductStatus,
)
from forge.curation.lineage import LineageEntry, TransformationStep
from forge.storage.engines.postgres import PostgresLineageStore, PostgresProductStore

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_pool():
    """Create a mock asyncpg pool with acquire context manager."""
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


@pytest.fixture
def sample_product() -> DataProduct:
    return DataProduct(
        product_id="dp-test-001",
        name="Test Product",
        description="A test data product",
        owner="test-owner",
        status=DataProductStatus.DRAFT,
        schema=DataProductSchema(
            schema_ref="forge://schemas/test/v1",
            version="1.0.0",
        ),
        source_adapters=["whk-wms"],
        tags=["test"],
    )


@pytest.fixture
def sample_lineage() -> LineageEntry:
    return LineageEntry(
        lineage_id="lin-001",
        source_record_ids=["src-1", "src-2"],
        output_record_id="out-1",
        product_id="dp-test-001",
        adapter_ids=["whk-wms"],
        steps=[
            TransformationStep(
                step_name="normalize",
                component="NormalizationStep",
                description="Unit normalization",
            ),
        ],
    )


# ---------------------------------------------------------------------------
# PostgresProductStore tests
# ---------------------------------------------------------------------------


class TestPostgresProductStore:
    """Tests for PostgresProductStore with mocked pool."""

    def test_init_with_pool(self, mock_pool):
        pool, _ = mock_pool
        store = PostgresProductStore(pool)
        assert store._pool_ok()

    def test_init_with_none(self):
        store = PostgresProductStore(None)
        assert not store._pool_ok()

    def test_save_no_pool_is_noop(self, sample_product: DataProduct):
        store = PostgresProductStore(None)
        # Should not raise
        store.save(sample_product)

    def test_get_no_pool_returns_none(self):
        store = PostgresProductStore(None)
        assert store.get("dp-test-001") is None

    def test_list_all_no_pool_returns_empty(self):
        store = PostgresProductStore(None)
        assert store.list_all() == []

    def test_delete_no_pool_returns_false(self):
        store = PostgresProductStore(None)
        assert store.delete("dp-test-001") is False

    @pytest.mark.asyncio
    async def test_save_async_executes_upsert(
        self, mock_pool, sample_product: DataProduct,
    ):
        pool, conn = mock_pool
        store = PostgresProductStore(pool)
        await store._save_async(sample_product)
        conn.execute.assert_called_once()
        call_args = conn.execute.call_args
        assert "INSERT INTO forge_canonical.data_products" in call_args[0][0]
        assert call_args[0][1] == "dp-test-001"

    @pytest.mark.asyncio
    async def test_get_async_returns_product(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = {
            "product_id": "dp-test-001",
            "name": "Test Product",
            "description": "desc",
            "owner": "owner",
            "status": "DRAFT",
            "schema_ref": "forge://schemas/test/v1",
            "schema_version": "1.0.0",
            "source_adapters": json.dumps(["whk-wms"]),
            "quality_slos": json.dumps([]),
            "tags": json.dumps(["test"]),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "metadata": json.dumps({}),
        }
        store = PostgresProductStore(pool)
        product = await store._get_async("dp-test-001")
        assert product is not None
        assert product.product_id == "dp-test-001"
        assert product.status == DataProductStatus.DRAFT

    @pytest.mark.asyncio
    async def test_get_async_returns_none_for_missing(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = None
        store = PostgresProductStore(pool)
        product = await store._get_async("nonexistent")
        assert product is None

    @pytest.mark.asyncio
    async def test_list_all_async(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = [
            {
                "product_id": "dp-001",
                "name": "Product A",
                "description": "desc",
                "owner": "owner",
                "status": "PUBLISHED",
                "schema_ref": "ref",
                "schema_version": "1.0.0",
                "source_adapters": json.dumps([]),
                "quality_slos": json.dumps([]),
                "tags": json.dumps([]),
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC),
                "metadata": json.dumps({}),
            },
        ]
        store = PostgresProductStore(pool)
        products = await store._list_all_async()
        assert len(products) == 1
        assert products[0].product_id == "dp-001"

    @pytest.mark.asyncio
    async def test_list_all_async_with_status_filter(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = []
        store = PostgresProductStore(pool)
        products = await store._list_all_async(DataProductStatus.PUBLISHED)
        assert products == []
        call_args = conn.fetch.call_args
        assert "WHERE status = $1" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_delete_async(self, mock_pool):
        pool, conn = mock_pool
        conn.execute.return_value = "DELETE 1"
        store = PostgresProductStore(pool)
        result = await store._delete_async("dp-001")
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_async_not_found(self, mock_pool):
        pool, conn = mock_pool
        conn.execute.return_value = "DELETE 0"
        store = PostgresProductStore(pool)
        result = await store._delete_async("dp-nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_save_async_handles_error(self, mock_pool, sample_product):
        pool, conn = mock_pool
        conn.execute.side_effect = Exception("connection refused")
        store = PostgresProductStore(pool)
        # Should not raise — logs the error
        await store._save_async(sample_product)


# ---------------------------------------------------------------------------
# PostgresLineageStore tests
# ---------------------------------------------------------------------------


class TestPostgresLineageStore:
    """Tests for PostgresLineageStore with mocked pool."""

    def test_init_with_pool(self, mock_pool):
        pool, _ = mock_pool
        store = PostgresLineageStore(pool)
        assert store._pool_ok()

    def test_init_with_none(self):
        store = PostgresLineageStore(None)
        assert not store._pool_ok()

    def test_save_no_pool_is_noop(self, sample_lineage):
        store = PostgresLineageStore(None)
        store.save(sample_lineage)  # no error

    def test_get_no_pool_returns_none(self):
        store = PostgresLineageStore(None)
        assert store.get("lin-001") is None

    def test_get_by_output_no_pool(self):
        store = PostgresLineageStore(None)
        assert store.get_by_output("out-1") == []

    def test_get_by_source_no_pool(self):
        store = PostgresLineageStore(None)
        assert store.get_by_source("src-1") == []

    def test_get_by_product_no_pool(self):
        store = PostgresLineageStore(None)
        assert store.get_by_product("dp-001") == []

    def test_list_all_no_pool(self):
        store = PostgresLineageStore(None)
        assert store.list_all() == []

    @pytest.mark.asyncio
    async def test_save_async_executes_upsert(self, mock_pool, sample_lineage):
        pool, conn = mock_pool
        store = PostgresLineageStore(pool)
        await store._save_async(sample_lineage)
        conn.execute.assert_called_once()
        call_args = conn.execute.call_args
        assert "INSERT INTO forge_core.lineage_entries" in call_args[0][0]
        assert call_args[0][1] == "lin-001"

    @pytest.mark.asyncio
    async def test_get_async_returns_entry(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = {
            "lineage_id": "lin-001",
            "source_record_ids": json.dumps(["src-1"]),
            "output_record_id": "out-1",
            "product_id": "dp-001",
            "adapter_ids": json.dumps(["whk-wms"]),
            "steps": json.dumps([{
                "step_name": "normalize",
                "component": "NormalizationStep",
                "description": "",
                "parameters": {},
                "timestamp": datetime.now(UTC).isoformat(),
            }]),
            "created_at": datetime.now(UTC),
        }
        store = PostgresLineageStore(pool)
        entry = await store._get_async("lin-001")
        assert entry is not None
        assert entry.lineage_id == "lin-001"
        assert len(entry.steps) == 1

    @pytest.mark.asyncio
    async def test_get_async_returns_none_for_missing(self, mock_pool):
        pool, conn = mock_pool
        conn.fetchrow.return_value = None
        store = PostgresLineageStore(pool)
        entry = await store._get_async("nonexistent")
        assert entry is None

    @pytest.mark.asyncio
    async def test_async_query_returns_entries(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.return_value = [
            {
                "lineage_id": "lin-002",
                "source_record_ids": json.dumps(["src-2"]),
                "output_record_id": "out-2",
                "product_id": "dp-002",
                "adapter_ids": json.dumps([]),
                "steps": json.dumps([]),
                "created_at": datetime.now(UTC),
            },
        ]
        store = PostgresLineageStore(pool)
        entries = await store._async_query(
            "SELECT * FROM forge_core.lineage_entries WHERE product_id = $1",
            "dp-002",
        )
        assert len(entries) == 1
        assert entries[0].lineage_id == "lin-002"

    @pytest.mark.asyncio
    async def test_async_query_handles_error(self, mock_pool):
        pool, conn = mock_pool
        conn.fetch.side_effect = Exception("query failed")
        store = PostgresLineageStore(pool)
        entries = await store._async_query("SELECT 1")
        assert entries == []
