"""Health check orchestration for all Forge infrastructure components.

Each check runs with an independent timeout so one slow component
doesn't block the entire health endpoint.  Results are aggregated
into a top-level ``status`` field:

    healthy   — every component reachable
    degraded  — at least one component unhealthy
    unhealthy — no components reachable
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

# Default per-component timeout (seconds)
_CHECK_TIMEOUT = 3.0


class ComponentStatus(str, Enum):
    OK = "ok"
    DEGRADED = "degraded"
    UNREACHABLE = "unreachable"
    DISABLED = "disabled"


@dataclass
class ComponentHealth:
    """Result of a single component health probe."""

    name: str
    status: ComponentStatus = ComponentStatus.UNREACHABLE
    latency_ms: float = 0.0
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformHealth:
    """Aggregated platform health."""

    status: str  # "healthy" | "degraded" | "unhealthy"
    components: dict[str, dict[str, Any]] = field(default_factory=dict)
    uptime_seconds: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "uptime_seconds": round(self.uptime_seconds, 1),
            "components": self.components,
        }


class HealthOrchestrator:
    """Probes all Forge infrastructure components concurrently.

    Storage config drives which components to check.  All checks
    run in parallel with per-component timeouts.
    """

    def __init__(self, start_time: float | None = None) -> None:
        self._start_time = start_time or time.monotonic()
        self._checks: list[tuple[str, Any]] = []

    def register(self, name: str, check_fn: Any) -> None:
        """Register a health check coroutine factory.

        ``check_fn`` must be an async callable returning ComponentHealth.
        """
        self._checks.append((name, check_fn))

    async def check_all(self) -> PlatformHealth:
        """Run all registered checks concurrently."""
        tasks = []
        for name, fn in self._checks:
            tasks.append(self._run_check(name, fn))

        results = await asyncio.gather(*tasks)

        components: dict[str, dict[str, Any]] = {}
        ok_count = 0
        total = len(results)

        for result in results:
            components[result.name] = {
                "status": result.status.value,
                "latency_ms": round(result.latency_ms, 1),
                "message": result.message,
                **result.details,
            }
            if result.status == ComponentStatus.OK:
                ok_count += 1

        if ok_count == total:
            status = "healthy"
        elif ok_count > 0:
            status = "degraded"
        else:
            status = "unhealthy"

        return PlatformHealth(
            status=status,
            components=components,
            uptime_seconds=time.monotonic() - self._start_time,
        )

    async def _run_check(self, name: str, fn: Any) -> ComponentHealth:
        """Execute a single check with timeout protection."""
        t0 = time.monotonic()
        try:
            result = await asyncio.wait_for(fn(), timeout=_CHECK_TIMEOUT)
            result.latency_ms = (time.monotonic() - t0) * 1000
            return result
        except asyncio.TimeoutError:
            return ComponentHealth(
                name=name,
                status=ComponentStatus.UNREACHABLE,
                latency_ms=(time.monotonic() - t0) * 1000,
                message=f"Timeout after {_CHECK_TIMEOUT}s",
            )
        except Exception as exc:
            logger.warning("Health check '%s' failed: %s", name, exc)
            return ComponentHealth(
                name=name,
                status=ComponentStatus.UNREACHABLE,
                latency_ms=(time.monotonic() - t0) * 1000,
                message=str(exc),
            )


# ---------------------------------------------------------------------------
# Built-in component checkers
# ---------------------------------------------------------------------------


async def check_postgres(dsn: str) -> ComponentHealth:
    """Check PostgreSQL connectivity via asyncpg."""
    import asyncpg

    conn = await asyncpg.connect(dsn, timeout=_CHECK_TIMEOUT)
    try:
        version = await conn.fetchval("SELECT version()")
        return ComponentHealth(
            name="postgres",
            status=ComponentStatus.OK,
            message="connected",
            details={"version": version.split(",")[0] if version else "unknown"},
        )
    finally:
        await conn.close()


async def check_timescaledb(dsn: str) -> ComponentHealth:
    """Check TimescaleDB connectivity and extension."""
    import asyncpg

    conn = await asyncpg.connect(dsn, timeout=_CHECK_TIMEOUT)
    try:
        row = await conn.fetchrow(
            "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
        )
        ext_version = row["extversion"] if row else "not installed"
        return ComponentHealth(
            name="timescaledb",
            status=ComponentStatus.OK,
            message="connected",
            details={"timescaledb_version": ext_version},
        )
    finally:
        await conn.close()


async def check_neo4j(uri: str, user: str, password: str) -> ComponentHealth:
    """Check Neo4j connectivity."""
    from neo4j import AsyncGraphDatabase

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        async with driver.session() as session:
            result = await session.run("RETURN 1 AS n")
            await result.single()
        return ComponentHealth(
            name="neo4j",
            status=ComponentStatus.OK,
            message="connected",
        )
    finally:
        await driver.close()


async def check_redis(url: str) -> ComponentHealth:
    """Check Redis connectivity."""
    from redis.asyncio import from_url

    client = from_url(url)
    try:
        pong = await client.ping()
        info = await client.info("server")
        return ComponentHealth(
            name="redis",
            status=ComponentStatus.OK if pong else ComponentStatus.DEGRADED,
            message="connected" if pong else "ping failed",
            details={"redis_version": info.get("redis_version", "unknown")},
        )
    finally:
        await client.aclose()


async def check_kafka(bootstrap_servers: str) -> ComponentHealth:
    """Check Kafka broker connectivity.

    Uses confluent-kafka AdminClient — this is a synchronous call
    wrapped in run_in_executor to avoid blocking the event loop.
    """
    import functools

    from confluent_kafka.admin import AdminClient

    def _probe() -> dict[str, Any]:
        admin = AdminClient({"bootstrap.servers": bootstrap_servers})
        metadata = admin.list_topics(timeout=_CHECK_TIMEOUT)
        return {
            "broker_count": len(metadata.brokers),
            "topic_count": len(metadata.topics),
        }

    loop = asyncio.get_running_loop()
    details = await loop.run_in_executor(
        None, functools.partial(_probe),
    )
    return ComponentHealth(
        name="kafka",
        status=ComponentStatus.OK,
        message="connected",
        details=details,
    )
