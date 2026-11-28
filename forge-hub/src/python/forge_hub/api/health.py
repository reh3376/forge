"""Health check orchestration for all Forge infrastructure components.

A health call asks every component at once and is answered within the check's limit,
whatever a component does. Results are aggregated into a top-level ``status`` field:

    healthy   — every component reachable
    degraded  — at least one component unhealthy
    unhealthy — no components reachable

One dependency's state never stops the hub (FB-326). A component has at most one probe in
flight, however many health calls arrive, and a probe whose client blocks runs on a thread of
its own, never on the event loop's shared pool. A store that accepts a connection and never
answers is reported unreachable at the limit, and holds one thread, not the hub's.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from functools import partial
from typing import Any

logger = logging.getLogger(__name__)

# The check's limit, per component (seconds): how long a health call waits for an answer
_CHECK_TIMEOUT = 3.0


class ComponentStatus(StrEnum):
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


#: A probe whose client blocks: a plain function that asks the component and returns what it
#: learned, and raises when the component does not answer. It never touches the event loop.
BlockingProbe = Callable[[], dict[str, Any]]
#: What a blocking probe ended with: what it returned, or what it raised.
Outcome = dict[str, Any] | Exception
#: How a blocking probe is started. ``ended`` is called once, from any thread, with the outcome.
StartBlocking = Callable[[str, BlockingProbe, Callable[[Outcome], None]], None]


def _in_its_own_thread(name: str, probe: BlockingProbe, ended: Callable[[Outcome], None]) -> None:
    """Run a blocking probe on a thread of its own, never on the event loop's shared pool.

    The shared pool also resolves host names and runs every other blocking call the hub
    makes, so a probe waiting there on a component that has stopped answering takes that
    capacity from the whole hub (FB-326). The thread is a daemon: a probe that never returns
    cannot hold the process open when the hub stops.
    """

    def run() -> None:
        try:
            outcome: Outcome = probe()
        except Exception as exc:  # the component's state, to be reported: not raised in a thread
            outcome = exc
        ended(outcome)

    threading.Thread(target=run, name=f"forge-health-{name}", daemon=True).start()


@dataclass
class _InFlight:
    """One probe of one component, from its start until it ends."""

    started: float  # on the event loop's clock
    answer: asyncio.Future[ComponentHealth]
    task: asyncio.Task[None] | None = None  # an async probe's task, held so it is not collected


class HealthOrchestrator:
    """Probes every registered component, one probe of each at a time.

    A health call asks every component at once and is answered within the check's limit,
    whatever a component does. A component has at most one probe in flight: a call that
    arrives while one is running waits for that probe and does not start another, so the
    number of probes never depends on the number of callers. A probe that has not returned
    by the limit is reported unreachable and keeps its place until it ends. An async probe
    is cancelled at the limit; a blocking one cannot be, so no second one is started beside
    it. Nothing is remembered between probes: a component is never reported ok from an
    answer that came before the call (FB-326).
    """

    def __init__(
        self,
        start_time: float | None = None,
        *,
        start_blocking: StartBlocking = _in_its_own_thread,
    ) -> None:
        self._start_time = start_time or time.monotonic()
        self._checks: list[tuple[str, Any, bool]] = []
        self._in_flight: dict[str, _InFlight] = {}
        self._start_blocking = start_blocking

    def register(self, name: str, check_fn: Any) -> None:
        """Register an async check.

        ``check_fn`` must be an async callable returning ComponentHealth.
        """
        self._checks.append((name, check_fn, False))

    def register_blocking(self, name: str, probe: BlockingProbe) -> None:
        """Register a probe whose client blocks: a plain function, run on a thread of its own."""
        self._checks.append((name, probe, True))

    async def check_all(self) -> PlatformHealth:
        """Ask every registered component at once."""
        results = await asyncio.gather(
            *(self._run_check(name, fn, blocking) for name, fn, blocking in self._checks)
        )

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

    async def _run_check(self, name: str, fn: Any, blocking: bool = False) -> ComponentHealth:
        """This call's answer for one component: its probe's, or unreachable at the limit."""
        loop = asyncio.get_running_loop()
        probe = self._probe_for(loop, name, fn, blocking)
        return await self._answer_within(loop, name, probe)

    def _probe_for(
        self, loop: asyncio.AbstractEventLoop, name: str, fn: Any, blocking: bool
    ) -> _InFlight:
        """The component's probe in flight, or a new one when it has none."""
        probe = self._in_flight.get(name)
        if probe is None:
            probe = _InFlight(started=loop.time(), answer=loop.create_future())
            self._in_flight[name] = probe
            if blocking:
                self._start_blocking(name, fn, partial(self._from_thread, loop, name, probe))
            else:
                probe.task = loop.create_task(self._bounded(name, fn, probe))
        return probe

    async def _answer_within(
        self, loop: asyncio.AbstractEventLoop, name: str, probe: _InFlight
    ) -> ComponentHealth:
        """Wait for the probe up to its limit, which runs from its start, not from this call."""
        remaining = probe.started + _CHECK_TIMEOUT - loop.time()
        if remaining <= 0:
            # an earlier call's probe is still out past its limit: say so at once
            return self._not_returned(loop, name, probe, found_late=True)
        try:
            # shielded: a caller that goes away must not end the probe that others wait on
            return await asyncio.wait_for(asyncio.shield(probe.answer), timeout=remaining)
        except TimeoutError:
            return self._not_returned(loop, name, probe, found_late=False)

    def _not_returned(
        self, loop: asyncio.AbstractEventLoop, name: str, probe: _InFlight, *, found_late: bool
    ) -> ComponentHealth:
        age = loop.time() - probe.started
        message = f"Timeout after {_CHECK_TIMEOUT}s"
        if found_late:
            message += f": the probe started {age:.0f} s ago has not returned"
        return ComponentHealth(
            name=name, status=ComponentStatus.UNREACHABLE, latency_ms=age * 1000, message=message
        )

    async def _bounded(self, name: str, fn: Any, probe: _InFlight) -> None:
        """Run an async check to its end, or to the limit, where it is cancelled."""
        outcome: ComponentHealth | Exception
        try:
            outcome = await asyncio.wait_for(fn(), timeout=_CHECK_TIMEOUT)
        except TimeoutError:
            outcome = TimeoutError(f"Timeout after {_CHECK_TIMEOUT}s")
        except Exception as exc:
            outcome = exc
        self._end(name, probe, outcome)

    def _from_thread(
        self, loop: asyncio.AbstractEventLoop, name: str, probe: _InFlight, outcome: Outcome
    ) -> None:
        """A blocking probe ended, on its own thread: hand its outcome to the event loop."""
        with contextlib.suppress(RuntimeError):  # the loop is closed: the hub is stopping
            loop.call_soon_threadsafe(self._end, name, probe, outcome)

    def _end(
        self, name: str, probe: _InFlight, outcome: ComponentHealth | dict[str, Any] | Exception
    ) -> None:
        """The probe ended: its place is free, and every call waiting on it has its answer."""
        if self._in_flight.get(name) is probe:
            del self._in_flight[name]
        latency = (probe.answer.get_loop().time() - probe.started) * 1000
        if isinstance(outcome, ComponentHealth):
            outcome.latency_ms = latency
            health = outcome
        elif isinstance(outcome, Exception):
            if not isinstance(outcome, TimeoutError):
                logger.warning("Health check '%s' failed: %s", name, outcome)
            health = ComponentHealth(
                name=name,
                status=ComponentStatus.UNREACHABLE,
                latency_ms=latency,
                message=str(outcome),
            )
        else:
            health = ComponentHealth(
                name=name,
                status=ComponentStatus.OK,
                latency_ms=latency,
                message="connected",
                details=outcome,
            )
        if not probe.answer.done():
            probe.answer.set_result(health)


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


def probe_kafka(bootstrap_servers: str) -> dict[str, Any]:
    """Ask the Kafka brokers for their metadata.

    The confluent-kafka client blocks, so this is a plain function that the orchestrator runs
    on a thread of its own (``register_blocking``). The call carries the check's limit.
    """
    from confluent_kafka.admin import AdminClient

    admin = AdminClient({"bootstrap.servers": bootstrap_servers})
    metadata = admin.list_topics(timeout=_CHECK_TIMEOUT)
    return {
        "broker_count": len(metadata.brokers),
        "topic_count": len(metadata.topics),
    }


async def check_rabbitmq(url: str) -> ComponentHealth:
    """Check RabbitMQ connectivity via aio-pika.

    A plain (not robust) connection: the probe is one-shot, and a robust
    connection would keep reconnecting in the background after the check
    returned. Opening a channel proves the broker accepts AMQP, the
    credentials and the vhost; nothing is declared, since the broker refuses
    ``exchange.declare`` on the default exchange.
    """
    import aio_pika

    connection = await aio_pika.connect(url, timeout=_CHECK_TIMEOUT)
    try:
        channel = await connection.channel()
        await channel.close()
        return ComponentHealth(
            name="rabbitmq",
            status=ComponentStatus.OK,
            message="connected",
        )
    finally:
        await connection.close()


def probe_object_store(
    endpoint: str,
    access_key: str,
    secret_key: str,
    secure: bool = False,
    region: str | None = None,
) -> dict[str, Any]:
    """Ask the object store for its buckets (any S3 store; FB-314).

    The S3 client blocks, so this is a plain function that the orchestrator runs on a thread
    of its own (``register_blocking``), and the client is built with the check's limit, so
    the thread ends when the check does (FB-326). This is connectivity only; what the store
    can do is ``forge_hub.storage.object_store_check``.
    """
    from forge_hub.storage.object_store_check import client_for

    client = client_for(
        endpoint, access_key, secret_key, limit=_CHECK_TIMEOUT, secure=secure, region=region
    )
    return {"bucket_count": len(client.list_buckets())}
