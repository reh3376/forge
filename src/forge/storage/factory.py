"""Storage Factory — returns concrete engine stores, falls back to InMemory.

The factory inspects the PoolManager to determine which backends are
available and returns the appropriate store implementation. If a pool
is ``None`` (engine unreachable), the factory returns the InMemory
variant so the application can degrade gracefully.

Usage::

    factory = StorageFactory(pool_manager)
    product_store = factory.product_store()    # Postgres or InMemory
    lineage_store = factory.lineage_store()    # Postgres or InMemory
    ts_writer     = factory.timescale_writer() # Timescale or None
    graph_writer  = factory.graph_writer()     # Neo4j or None
    state_cache   = factory.state_cache()      # Redis or None
"""

from __future__ import annotations

import logging

from forge.curation.lineage import InMemoryLineageStore, LineageStore
from forge.curation.registry import InMemoryProductStore, ProductStore
from forge.storage.engines.neo4j_engine import Neo4jGraphWriter, Neo4jLineageWriter
from forge.storage.engines.postgres import PostgresLineageStore, PostgresProductStore
from forge.storage.engines.redis_engine import RedisSchemaCache, RedisStateCache
from forge.storage.engines.timescale import TimescaleRecordReader, TimescaleRecordWriter
from forge.storage.pool import PoolManager  # noqa: TC001

logger = logging.getLogger(__name__)


class StorageFactory:
    """Creates storage backends based on available connection pools.

    Each method checks whether the relevant pool is healthy and returns
    the real backend or an InMemory fallback.
    """

    def __init__(self, pools: PoolManager) -> None:
        self._pools = pools

    # ------------------------------------------------------------------
    # PostgreSQL-backed stores
    # ------------------------------------------------------------------

    def product_store(self) -> ProductStore:
        """Return PostgresProductStore if PG pool available, else InMemory."""
        pool = self._pools.postgres
        if pool is not None:
            logger.info("Using PostgresProductStore")
            return PostgresProductStore(pool)
        logger.info("PostgreSQL unavailable — using InMemoryProductStore")
        return InMemoryProductStore()

    def lineage_store(self) -> LineageStore:
        """Return PostgresLineageStore if PG pool available, else InMemory."""
        pool = self._pools.postgres
        if pool is not None:
            logger.info("Using PostgresLineageStore")
            return PostgresLineageStore(pool)
        logger.info("PostgreSQL unavailable — using InMemoryLineageStore")
        return InMemoryLineageStore()

    # ------------------------------------------------------------------
    # TimescaleDB
    # ------------------------------------------------------------------

    def timescale_writer(self) -> TimescaleRecordWriter | None:
        """Return TimescaleRecordWriter if pool available, else None."""
        pool = self._pools.timescale
        if pool is not None:
            logger.info("Using TimescaleRecordWriter")
            return TimescaleRecordWriter(pool)
        logger.info("TimescaleDB unavailable — no time-series writer")
        return None

    def timescale_reader(self) -> TimescaleRecordReader | None:
        """Return TimescaleRecordReader if pool available, else None."""
        pool = self._pools.timescale
        if pool is not None:
            return TimescaleRecordReader(pool)
        return None

    # ------------------------------------------------------------------
    # Neo4j
    # ------------------------------------------------------------------

    def graph_writer(self) -> Neo4jGraphWriter | None:
        """Return Neo4jGraphWriter if driver available, else None."""
        driver = self._pools.neo4j
        if driver is not None:
            logger.info("Using Neo4jGraphWriter")
            return Neo4jGraphWriter(driver)
        logger.info("Neo4j unavailable — no graph writer")
        return None

    def lineage_graph_writer(self) -> Neo4jLineageWriter | None:
        """Return Neo4jLineageWriter if driver available, else None."""
        driver = self._pools.neo4j
        if driver is not None:
            return Neo4jLineageWriter(driver)
        return None

    # ------------------------------------------------------------------
    # Redis
    # ------------------------------------------------------------------

    def state_cache(self) -> RedisStateCache | None:
        """Return RedisStateCache if client available, else None."""
        client = self._pools.redis
        if client is not None:
            logger.info("Using RedisStateCache")
            return RedisStateCache(client)
        logger.info("Redis unavailable — no state cache")
        return None

    def schema_cache(self) -> RedisSchemaCache | None:
        """Return RedisSchemaCache if client available, else None."""
        client = self._pools.redis
        if client is not None:
            return RedisSchemaCache(client)
        return None

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def summary(self) -> dict[str, str]:
        """Return a summary of which backends are available."""
        return {
            "product_store": "postgres" if self._pools.postgres else "in_memory",
            "lineage_store": "postgres" if self._pools.postgres else "in_memory",
            "timescale_writer": "timescale" if self._pools.timescale else "unavailable",
            "graph_writer": "neo4j" if self._pools.neo4j else "unavailable",
            "state_cache": "redis" if self._pools.redis else "unavailable",
            "schema_cache": "redis" if self._pools.redis else "unavailable",
        }
