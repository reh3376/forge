"""Tests for StorageFactory."""

from __future__ import annotations

from unittest.mock import MagicMock, PropertyMock

from forge.context.equipment import InMemoryEquipmentStore, PostgresEquipmentStore
from forge.curation.lineage import InMemoryLineageStore
from forge.curation.registry import InMemoryProductStore
from forge.registry.postgres_store import PostgresSchemaStore
from forge.registry.store import InMemorySchemaStore
from forge.storage.access import (
    InMemoryPermissionStore,
    PersistentAccessController,
    PostgresPermissionStore,
)
from forge.storage.engines.neo4j_engine import Neo4jGraphWriter, Neo4jLineageWriter
from forge.storage.engines.postgres import (
    PostgresAccessController,
    PostgresLineageStore,
    PostgresProductStore,
)
from forge.storage.engines.redis_engine import RedisSchemaCache, RedisStateCache
from forge.storage.engines.timescale import TimescaleRecordReader, TimescaleRecordWriter
from forge.storage.factory import StorageFactory
from forge.storage.pool import PoolManager


def _make_pool_manager(
    postgres=None,
    timescale=None,
    neo4j=None,
    redis=None,
) -> PoolManager:
    """Create a PoolManager with specific pools pre-set."""
    pm = MagicMock(spec=PoolManager)
    type(pm).postgres = PropertyMock(return_value=postgres)
    type(pm).timescale = PropertyMock(return_value=timescale)
    type(pm).neo4j = PropertyMock(return_value=neo4j)
    type(pm).redis = PropertyMock(return_value=redis)
    return pm


class TestProductStore:
    """StorageFactory.product_store() selection."""

    def test_returns_postgres_when_pool_available(self):
        pools = _make_pool_manager(postgres=MagicMock())
        factory = StorageFactory(pools)
        store = factory.product_store()
        assert isinstance(store, PostgresProductStore)

    def test_returns_in_memory_when_no_pool(self):
        pools = _make_pool_manager(postgres=None)
        factory = StorageFactory(pools)
        store = factory.product_store()
        assert isinstance(store, InMemoryProductStore)


class TestLineageStore:
    """StorageFactory.lineage_store() selection."""

    def test_returns_postgres_when_pool_available(self):
        pools = _make_pool_manager(postgres=MagicMock())
        factory = StorageFactory(pools)
        store = factory.lineage_store()
        assert isinstance(store, PostgresLineageStore)

    def test_returns_in_memory_when_no_pool(self):
        pools = _make_pool_manager(postgres=None)
        factory = StorageFactory(pools)
        store = factory.lineage_store()
        assert isinstance(store, InMemoryLineageStore)


class TestSchemaStore:
    """StorageFactory.schema_store() selection (FB-005)."""

    def test_returns_postgres_when_pool_available(self):
        factory = StorageFactory(_make_pool_manager(postgres=MagicMock()))
        assert isinstance(factory.schema_store(), PostgresSchemaStore)

    def test_returns_in_memory_when_no_pool(self):
        factory = StorageFactory(_make_pool_manager(postgres=None))
        assert isinstance(factory.schema_store(), InMemorySchemaStore)


class TestEquipmentStore:
    """StorageFactory.equipment_store() selection (FB-005)."""

    def test_returns_postgres_when_pool_available(self):
        factory = StorageFactory(_make_pool_manager(postgres=MagicMock()))
        assert isinstance(factory.equipment_store(), PostgresEquipmentStore)

    def test_returns_in_memory_when_no_pool(self):
        factory = StorageFactory(_make_pool_manager(postgres=None))
        assert isinstance(factory.equipment_store(), InMemoryEquipmentStore)


class TestAccessController:
    """FB-003: the module-grant controller persists in forge_core when a pool exists."""

    def test_returns_postgres_when_pool_available(self):
        factory = StorageFactory(_make_pool_manager(postgres=MagicMock()))
        controller = factory.access_controller()
        assert isinstance(controller, PostgresAccessController)
        assert isinstance(controller.store, PostgresPermissionStore)
        assert factory.summary()["access_controller"] == "postgres"

    def test_returns_in_memory_when_no_pool(self):
        factory = StorageFactory(_make_pool_manager(postgres=None))
        controller = factory.access_controller()
        assert isinstance(controller, PersistentAccessController)
        assert isinstance(controller.store, InMemoryPermissionStore)
        assert factory.summary()["access_controller"] == "in_memory"


class TestTimescaleWriter:
    """StorageFactory.timescale_writer() selection."""

    def test_returns_writer_when_pool_available(self):
        pools = _make_pool_manager(timescale=MagicMock())
        factory = StorageFactory(pools)
        writer = factory.timescale_writer()
        assert isinstance(writer, TimescaleRecordWriter)

    def test_returns_none_when_no_pool(self):
        pools = _make_pool_manager(timescale=None)
        factory = StorageFactory(pools)
        assert factory.timescale_writer() is None


class TestTimescaleReader:
    def test_returns_reader_when_pool_available(self):
        pools = _make_pool_manager(timescale=MagicMock())
        factory = StorageFactory(pools)
        reader = factory.timescale_reader()
        assert isinstance(reader, TimescaleRecordReader)

    def test_returns_none_when_no_pool(self):
        pools = _make_pool_manager(timescale=None)
        factory = StorageFactory(pools)
        assert factory.timescale_reader() is None


class TestGraphWriter:
    """StorageFactory.graph_writer() selection."""

    def test_returns_writer_when_driver_available(self):
        pools = _make_pool_manager(neo4j=MagicMock())
        factory = StorageFactory(pools)
        writer = factory.graph_writer()
        assert isinstance(writer, Neo4jGraphWriter)

    def test_returns_none_when_no_driver(self):
        pools = _make_pool_manager(neo4j=None)
        factory = StorageFactory(pools)
        assert factory.graph_writer() is None


class TestLineageGraphWriter:
    def test_returns_writer_when_driver_available(self):
        pools = _make_pool_manager(neo4j=MagicMock())
        factory = StorageFactory(pools)
        writer = factory.lineage_graph_writer()
        assert isinstance(writer, Neo4jLineageWriter)

    def test_returns_none_when_no_driver(self):
        pools = _make_pool_manager(neo4j=None)
        factory = StorageFactory(pools)
        assert factory.lineage_graph_writer() is None


class TestStateCache:
    """StorageFactory.state_cache() selection."""

    def test_returns_cache_when_client_available(self):
        pools = _make_pool_manager(redis=MagicMock())
        factory = StorageFactory(pools)
        cache = factory.state_cache()
        assert isinstance(cache, RedisStateCache)

    def test_returns_none_when_no_client(self):
        pools = _make_pool_manager(redis=None)
        factory = StorageFactory(pools)
        assert factory.state_cache() is None


class TestSchemaCache:
    def test_returns_cache_when_client_available(self):
        pools = _make_pool_manager(redis=MagicMock())
        factory = StorageFactory(pools)
        cache = factory.schema_cache()
        assert isinstance(cache, RedisSchemaCache)

    def test_returns_none_when_no_client(self):
        pools = _make_pool_manager(redis=None)
        factory = StorageFactory(pools)
        assert factory.schema_cache() is None


class TestSummary:
    """StorageFactory.summary() reports backend availability."""

    def test_all_available(self):
        pools = _make_pool_manager(
            postgres=MagicMock(),
            timescale=MagicMock(),
            neo4j=MagicMock(),
            redis=MagicMock(),
        )
        factory = StorageFactory(pools)
        summary = factory.summary()
        assert summary["product_store"] == "postgres"
        assert summary["lineage_store"] == "postgres"
        assert summary["schema_store"] == "postgres"
        assert summary["equipment_store"] == "postgres"
        assert summary["access_controller"] == "postgres"
        assert summary["timescale_writer"] == "timescale"
        assert summary["graph_writer"] == "neo4j"
        assert summary["state_cache"] == "redis"
        assert summary["schema_cache"] == "redis"

    def test_none_available(self):
        pools = _make_pool_manager()
        factory = StorageFactory(pools)
        summary = factory.summary()
        assert summary["product_store"] == "in_memory"
        assert summary["lineage_store"] == "in_memory"
        assert summary["schema_store"] == "in_memory"
        assert summary["equipment_store"] == "in_memory"
        assert summary["access_controller"] == "in_memory"
        assert summary["timescale_writer"] == "unavailable"
        assert summary["graph_writer"] == "unavailable"
        assert summary["state_cache"] == "unavailable"
        assert summary["schema_cache"] == "unavailable"

    def test_partial_availability(self):
        pools = _make_pool_manager(postgres=MagicMock(), redis=MagicMock())
        factory = StorageFactory(pools)
        summary = factory.summary()
        assert summary["product_store"] == "postgres"
        assert summary["timescale_writer"] == "unavailable"
        assert summary["graph_writer"] == "unavailable"
        assert summary["state_cache"] == "redis"
