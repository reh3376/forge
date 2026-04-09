"""Connection pool manager for all Forge storage engines.

Manages lifecycle (init, health check, shutdown) for every database
connection pool. Each engine is lazily initialized on first access.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.storage.config import StorageConfig

logger = logging.getLogger(__name__)


@dataclass
class EngineHealth:
    """Health snapshot for a single storage engine."""

    engine: str
    healthy: bool
    latency_ms: float | None = None
    last_check: datetime | None = None
    error: str | None = None


@dataclass
class PoolManager:
    """Manages connection pools for all Forge storage engines.

    Usage::

        pool = PoolManager(config)
        await pool.init()          # open all pools
        pg = pool.postgres         # access individual pools
        await pool.health_check()  # check all engines
        await pool.close()         # shutdown gracefully
    """

    config: StorageConfig
    _pools: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _initialized: bool = field(default=False, init=False)

    async def init(self) -> None:
        """Initialize all connection pools.

        Pools are created but connections are lazy — the first query
        opens the actual connection. This keeps startup fast even if
        some engines are unavailable.
        """
        if self._initialized:
            return

        # PostgreSQL (asyncpg)
        try:
            import asyncpg

            self._pools["postgres"] = await asyncpg.create_pool(
                dsn=self.config.postgres.dsn,
                min_size=self.config.postgres.min_pool_size,
                max_size=self.config.postgres.max_pool_size,
            )
            logger.info("PostgreSQL pool initialized (%s)", self.config.postgres.host)
        except Exception as exc:
            logger.warning("PostgreSQL pool unavailable: %s", exc)
            self._pools["postgres"] = None

        # TimescaleDB (asyncpg — same driver, different instance)
        try:
            import asyncpg

            self._pools["timescale"] = await asyncpg.create_pool(
                dsn=self.config.timescale.dsn,
                min_size=self.config.timescale.min_pool_size,
                max_size=self.config.timescale.max_pool_size,
            )
            logger.info("TimescaleDB pool initialized (%s)", self.config.timescale.host)
        except Exception as exc:
            logger.warning("TimescaleDB pool unavailable: %s", exc)
            self._pools["timescale"] = None

        # Neo4j
        try:
            from neo4j import AsyncGraphDatabase

            self._pools["neo4j"] = AsyncGraphDatabase.driver(
                self.config.neo4j.uri,
                auth=(self.config.neo4j.user, self.config.neo4j.password),
                max_connection_pool_size=self.config.neo4j.max_connection_pool_size,
            )
            logger.info("Neo4j driver initialized (%s)", self.config.neo4j.uri)
        except Exception as exc:
            logger.warning("Neo4j driver unavailable: %s", exc)
            self._pools["neo4j"] = None

        # Redis
        try:
            import redis.asyncio as aioredis

            self._pools["redis"] = aioredis.from_url(
                self.config.redis.url,
                max_connections=self.config.redis.max_connections,
            )
            logger.info("Redis pool initialized (%s)", self.config.redis.url)
        except Exception as exc:
            logger.warning("Redis pool unavailable: %s", exc)
            self._pools["redis"] = None

        self._initialized = True
        logger.info(
            "PoolManager ready — %d/%d engines available",
            sum(1 for v in self._pools.values() if v is not None),
            len(self._pools),
        )

    @property
    def postgres(self) -> Any:
        """asyncpg connection pool for Forge PostgreSQL."""
        return self._pools.get("postgres")

    @property
    def timescale(self) -> Any:
        """asyncpg connection pool for Forge TimescaleDB."""
        return self._pools.get("timescale")

    @property
    def neo4j(self) -> Any:
        """Neo4j async driver."""
        return self._pools.get("neo4j")

    @property
    def redis(self) -> Any:
        """Redis async client."""
        return self._pools.get("redis")

    async def health_check(self) -> list[EngineHealth]:
        """Run health checks against all storage engines."""
        results: list[EngineHealth] = []

        for engine_name, pool in self._pools.items():
            if pool is None:
                results.append(
                    EngineHealth(
                        engine=engine_name,
                        healthy=False,
                        error="Pool not initialized",
                        last_check=datetime.now(tz=timezone.utc),
                    )
                )
                continue

            start = datetime.now(tz=timezone.utc)
            try:
                if engine_name in ("postgres", "timescale"):
                    async with pool.acquire() as conn:
                        await conn.fetchval("SELECT 1")
                elif engine_name == "neo4j":
                    async with pool.session() as session:
                        await session.run("RETURN 1")
                elif engine_name == "redis":
                    await pool.ping()

                elapsed = (
                    datetime.now(tz=timezone.utc) - start
                ).total_seconds() * 1000
                results.append(
                    EngineHealth(
                        engine=engine_name,
                        healthy=True,
                        latency_ms=round(elapsed, 2),
                        last_check=datetime.now(tz=timezone.utc),
                    )
                )
            except Exception as exc:
                results.append(
                    EngineHealth(
                        engine=engine_name,
                        healthy=False,
                        error=str(exc),
                        last_check=datetime.now(tz=timezone.utc),
                    )
                )

        return results

    async def close(self) -> None:
        """Gracefully shut down all connection pools."""
        for engine_name, pool in self._pools.items():
            if pool is None:
                continue
            try:
                if engine_name in ("postgres", "timescale"):
                    await pool.close()
                elif engine_name == "neo4j":
                    await pool.close()
                elif engine_name == "redis":
                    await pool.close()
                logger.info("Closed %s pool", engine_name)
            except Exception as exc:
                logger.warning("Error closing %s pool: %s", engine_name, exc)

        self._pools.clear()
        self._initialized = False
