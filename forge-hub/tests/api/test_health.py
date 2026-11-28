"""Tests for the health check orchestration module.

Validates:
1. HealthOrchestrator — concurrent probing, timeout handling, aggregation
2. ComponentHealth — status enum, latency tracking
3. PlatformHealth — status rollup (healthy/degraded/unhealthy)
4. The RabbitMQ and object store probes (FB-006, FB-314), against stand-in clients
5. One probe in flight per component, blocking probes on threads of their own (FB-326):
   readable examples here; every sequence in a bound is ``test_health_probes_exhaustive.py``
"""

from __future__ import annotations

import asyncio
import sys
import threading
from functools import partial
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from forge_hub.api.health import (
    _CHECK_TIMEOUT,
    ComponentHealth,
    ComponentStatus,
    HealthOrchestrator,
    PlatformHealth,
    check_rabbitmq,
    probe_object_store,
)

# ---------------------------------------------------------------------------
# ComponentHealth
# ---------------------------------------------------------------------------


class TestComponentHealth:
    def test_default_status_is_unreachable(self):
        h = ComponentHealth(name="test")
        assert h.status == ComponentStatus.UNREACHABLE

    def test_ok_status(self):
        h = ComponentHealth(name="pg", status=ComponentStatus.OK, message="connected")
        assert h.status == ComponentStatus.OK
        assert h.message == "connected"

    def test_latency_defaults_to_zero(self):
        h = ComponentHealth(name="redis")
        assert h.latency_ms == 0.0

    def test_details_are_optional(self):
        h = ComponentHealth(name="kafka")
        assert h.details == {}

    def test_details_can_hold_arbitrary_data(self):
        h = ComponentHealth(
            name="kafka",
            status=ComponentStatus.OK,
            details={"broker_count": 3, "topic_count": 12},
        )
        assert h.details["broker_count"] == 3

    def test_disabled_status(self):
        h = ComponentHealth(name="otel", status=ComponentStatus.DISABLED)
        assert h.status == ComponentStatus.DISABLED


# ---------------------------------------------------------------------------
# PlatformHealth
# ---------------------------------------------------------------------------


class TestPlatformHealth:
    def test_healthy_to_dict(self):
        ph = PlatformHealth(status="healthy", uptime_seconds=42.123)
        d = ph.to_dict()
        assert d["status"] == "healthy"
        assert d["uptime_seconds"] == 42.1
        assert d["components"] == {}

    def test_degraded_with_components(self):
        ph = PlatformHealth(
            status="degraded",
            components={
                "postgres": {"status": "ok", "latency_ms": 1.2},
                "neo4j": {"status": "unreachable", "latency_ms": 3000.0},
            },
        )
        d = ph.to_dict()
        assert d["status"] == "degraded"
        assert len(d["components"]) == 2

    def test_unhealthy_status(self):
        ph = PlatformHealth(status="unhealthy")
        assert ph.to_dict()["status"] == "unhealthy"


# ---------------------------------------------------------------------------
# HealthOrchestrator
# ---------------------------------------------------------------------------


class TestHealthOrchestrator:
    @pytest.mark.asyncio
    async def test_no_checks_returns_healthy(self):
        orch = HealthOrchestrator()
        result = await orch.check_all()
        assert result.status == "healthy"
        assert result.components == {}

    @pytest.mark.asyncio
    async def test_all_ok_returns_healthy(self):
        orch = HealthOrchestrator()

        async def ok_check():
            return ComponentHealth(name="pg", status=ComponentStatus.OK)

        async def ok_check2():
            return ComponentHealth(name="redis", status=ComponentStatus.OK)

        orch.register("pg", ok_check)
        orch.register("redis", ok_check2)

        result = await orch.check_all()
        assert result.status == "healthy"
        assert "pg" in result.components
        assert "redis" in result.components
        assert result.components["pg"]["status"] == "ok"

    @pytest.mark.asyncio
    async def test_one_down_returns_degraded(self):
        orch = HealthOrchestrator()

        async def ok_check():
            return ComponentHealth(name="pg", status=ComponentStatus.OK)

        async def bad_check():
            return ComponentHealth(name="neo4j", status=ComponentStatus.UNREACHABLE)

        orch.register("pg", ok_check)
        orch.register("neo4j", bad_check)

        result = await orch.check_all()
        assert result.status == "degraded"

    @pytest.mark.asyncio
    async def test_all_down_returns_unhealthy(self):
        orch = HealthOrchestrator()

        async def bad_check():
            return ComponentHealth(name="pg", status=ComponentStatus.UNREACHABLE)

        async def bad_check2():
            return ComponentHealth(name="redis", status=ComponentStatus.UNREACHABLE)

        orch.register("pg", bad_check)
        orch.register("redis", bad_check2)

        result = await orch.check_all()
        assert result.status == "unhealthy"

    @pytest.mark.asyncio
    async def test_timeout_returns_unreachable(self):
        orch = HealthOrchestrator()

        async def slow_check():
            await asyncio.sleep(10)  # Will be killed by 3s timeout
            return ComponentHealth(name="slow", status=ComponentStatus.OK)

        orch.register("slow", slow_check)
        result = await orch.check_all()
        assert result.status == "unhealthy"
        assert result.components["slow"]["status"] == "unreachable"
        assert "Timeout" in result.components["slow"]["message"]

    @pytest.mark.asyncio
    async def test_exception_returns_unreachable(self):
        orch = HealthOrchestrator()

        async def crashing_check():
            msg = "Connection refused"
            raise ConnectionError(msg)

        orch.register("broken", crashing_check)
        result = await orch.check_all()
        assert result.status == "unhealthy"
        assert result.components["broken"]["status"] == "unreachable"
        assert "Connection refused" in result.components["broken"]["message"]

    @pytest.mark.asyncio
    async def test_latency_is_measured(self):
        orch = HealthOrchestrator()

        async def delayed_check():
            await asyncio.sleep(0.05)
            return ComponentHealth(name="delayed", status=ComponentStatus.OK)

        orch.register("delayed", delayed_check)
        result = await orch.check_all()
        latency = result.components["delayed"]["latency_ms"]
        assert latency >= 40  # At least ~50ms of sleep

    @pytest.mark.asyncio
    async def test_uptime_tracked(self):
        import time

        start = time.monotonic()
        orch = HealthOrchestrator(start_time=start)

        async def ok_check():
            return ComponentHealth(name="pg", status=ComponentStatus.OK)

        orch.register("pg", ok_check)
        await asyncio.sleep(0.05)
        result = await orch.check_all()
        assert result.uptime_seconds >= 0.04

    @pytest.mark.asyncio
    async def test_checks_run_concurrently(self):
        """Verify that multiple slow checks don't run sequentially."""
        orch = HealthOrchestrator()
        check_count = 3

        async def slow_ok():
            await asyncio.sleep(0.1)
            return ComponentHealth(name="check", status=ComponentStatus.OK)

        for i in range(check_count):
            orch.register(f"check_{i}", slow_ok)

        import time

        t0 = time.monotonic()
        result = await orch.check_all()
        elapsed = time.monotonic() - t0

        assert result.status == "healthy"
        # If sequential, would take ~0.3s. Concurrent should be ~0.1s.
        assert elapsed < 0.25, f"Checks appear sequential: {elapsed:.2f}s"

    @pytest.mark.asyncio
    async def test_mixed_statuses(self):
        """3 ok + 1 degraded + 1 unreachable = degraded overall."""
        orch = HealthOrchestrator()

        async def ok():
            return ComponentHealth(name="x", status=ComponentStatus.OK)

        async def degraded():
            return ComponentHealth(name="x", status=ComponentStatus.DEGRADED)

        async def unreachable():
            return ComponentHealth(name="x", status=ComponentStatus.UNREACHABLE)

        orch.register("pg", ok)
        orch.register("redis", ok)
        orch.register("kafka", ok)
        orch.register("neo4j", degraded)
        orch.register("object-store", unreachable)

        result = await orch.check_all()
        # 3 OK out of 5 → degraded (not all OK)
        assert result.status == "degraded"


# ---------------------------------------------------------------------------
# RabbitMQ and object store probes (FB-006, FB-314)
# ---------------------------------------------------------------------------


def _fake_aio_pika(channel_error: Exception | None = None):
    """An ``aio_pika`` stand-in whose ``connect`` yields a connection with a channel."""
    module = MagicMock()
    channel = AsyncMock()
    connection = AsyncMock()
    connection.channel = AsyncMock(return_value=channel, side_effect=channel_error)
    module.connect = AsyncMock(return_value=connection)
    return module, connection, channel


class TestRabbitMQProbe:
    @pytest.mark.asyncio
    async def test_opens_and_closes_a_channel_on_a_plain_connection(self):
        module, connection, channel = _fake_aio_pika()
        with patch.dict(sys.modules, {"aio_pika": module}):
            result = await check_rabbitmq("amqp://forge:x@rmq:5672/")
        assert result.name == "rabbitmq" and result.status == ComponentStatus.OK
        module.connect.assert_awaited_once_with("amqp://forge:x@rmq:5672/", timeout=_CHECK_TIMEOUT)
        # One-shot probe: no robust connection that would keep reconnecting afterwards.
        module.connect_robust.assert_not_called()
        channel.close.assert_awaited_once()
        connection.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_closes_the_connection_when_the_channel_fails(self):
        module, connection, _ = _fake_aio_pika(channel_error=RuntimeError("vhost refused"))
        with patch.dict(sys.modules, {"aio_pika": module}), pytest.raises(RuntimeError):
            await check_rabbitmq("amqp://forge:x@rmq:5672/")
        connection.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_the_orchestrator_reports_a_refused_broker_as_unreachable(self):
        module = MagicMock()
        module.connect = AsyncMock(side_effect=ConnectionRefusedError("refused"))
        orch = HealthOrchestrator()
        orch.register("rabbitmq", partial(check_rabbitmq, "amqp://forge:x@rmq:5672/"))
        with patch.dict(sys.modules, {"aio_pika": module}):
            health = await orch.check_all()
        assert health.status == "unhealthy"
        assert health.components["rabbitmq"]["status"] == "unreachable"
        assert "refused" in health.components["rabbitmq"]["message"]


class TestObjectStoreProbe:
    """The object store is named by its role and reached over S3, whichever store it is
    (FB-314). Its client blocks, so the probe is a plain function the orchestrator runs on a
    thread of its own (FB-326)."""

    CLIENT = "forge_hub.storage.object_store_check.client_for"

    def test_lists_buckets_with_the_configured_credentials_and_the_checks_limit(self):
        with patch(self.CLIENT) as client_for:
            client_for.return_value.list_buckets.return_value = ["forge-archive", "forge-docs"]
            details = probe_object_store(
                "object-store:9000", "forge", "secret", secure=True, region="plant-a"
            )
        assert details == {"bucket_count": 2}
        client_for.assert_called_once_with(
            "object-store:9000",
            "forge",
            "secret",
            limit=_CHECK_TIMEOUT,
            secure=True,
            region="plant-a",
        )

    @pytest.mark.asyncio
    async def test_the_orchestrator_reports_an_answering_store_as_ok(self):
        orch = HealthOrchestrator()
        orch.register_blocking(
            "object-store", partial(probe_object_store, "object-store:9000", "forge", "secret")
        )
        with patch(self.CLIENT) as client_for:
            client_for.return_value.list_buckets.return_value = ["forge-archive"]
            health = await orch.check_all()
        assert health.status == "healthy"
        store = health.components["object-store"]
        assert store["status"] == "ok" and store["message"] == "connected"
        assert store["bucket_count"] == 1

    @pytest.mark.asyncio
    async def test_the_orchestrator_reports_a_failed_listing_as_unreachable(self):
        orch = HealthOrchestrator()
        orch.register_blocking(
            "object-store", partial(probe_object_store, "object-store:9000", "forge", "secret")
        )
        with patch(self.CLIENT) as client_for:
            client_for.return_value.list_buckets.side_effect = OSError("connection refused")
            health = await orch.check_all()
        assert health.components["object-store"]["status"] == "unreachable"
        assert "connection refused" in health.components["object-store"]["message"]


# ---------------------------------------------------------------------------
# One probe in flight per component (FB-326): examples
# ---------------------------------------------------------------------------


@pytest.fixture
def short_limit(monkeypatch: pytest.MonkeyPatch) -> float:
    """The check's limit, shortened so a test of the limit does not take three seconds."""
    from forge_hub.api import health

    monkeypatch.setattr(health, "_CHECK_TIMEOUT", 0.2)
    return 0.2


class TestOneProbeInFlight:
    @pytest.mark.asyncio
    async def test_calls_that_overlap_share_one_probe(self):
        orch = HealthOrchestrator()
        started = 0
        answer = asyncio.Event()

        async def check():
            nonlocal started
            started += 1
            await answer.wait()
            return ComponentHealth(name="pg", status=ComponentStatus.OK)

        orch.register("pg", check)
        calls = [asyncio.create_task(orch.check_all()) for _ in range(5)]
        await asyncio.sleep(0.01)
        answer.set()
        results = await asyncio.gather(*calls)
        assert started == 1
        assert [r.components["pg"]["status"] for r in results] == ["ok"] * 5

    @pytest.mark.asyncio
    async def test_a_caller_that_goes_away_does_not_end_the_probe_others_wait_on(self):
        orch = HealthOrchestrator()
        started = 0
        answer = asyncio.Event()

        async def check():
            nonlocal started
            started += 1
            await answer.wait()
            return ComponentHealth(name="pg", status=ComponentStatus.OK)

        orch.register("pg", check)
        leaving = asyncio.create_task(orch.check_all())
        staying = asyncio.create_task(orch.check_all())
        await asyncio.sleep(0.01)
        leaving.cancel()
        await asyncio.sleep(0.01)
        answer.set()
        assert (await staying).components["pg"]["status"] == "ok"
        assert started == 1 and leaving.cancelled()

    @pytest.mark.asyncio
    async def test_a_blocking_probe_that_has_not_returned_keeps_its_place(self, short_limit):
        orch = HealthOrchestrator()
        started = 0
        release = threading.Event()

        def probe():
            nonlocal started
            started += 1
            release.wait(timeout=30)
            return {"answered": True}

        orch.register_blocking("object-store", probe)
        first = (await orch.check_all()).components["object-store"]
        assert first["status"] == "unreachable" and first["message"].startswith("Timeout after")
        # the probe is still out: a later call is told at once, and starts no second probe
        loop = asyncio.get_running_loop()
        before = loop.time()
        second = (await orch.check_all()).components["object-store"]
        assert loop.time() - before < short_limit / 2
        assert second["status"] == "unreachable" and "has not returned" in second["message"]
        assert started == 1
        # when it ends, its place is free: the next call starts a new probe and gets its answer
        release.set()
        for _ in range(100):
            if not orch._in_flight:
                break
            await asyncio.sleep(0.01)
        third = (await orch.check_all()).components["object-store"]
        assert third["status"] == "ok" and third["answered"] is True
        assert started == 2

    @pytest.mark.asyncio
    async def test_an_answer_that_comes_after_the_limit_is_not_remembered(self, short_limit):
        orch = HealthOrchestrator()
        outcomes = iter([{"late": True}, OSError("refused")])
        release = threading.Event()

        def probe():
            outcome = next(outcomes)
            if isinstance(outcome, dict):
                release.wait(timeout=30)  # the first probe answers ok, after the limit
                return outcome
            raise outcome

        orch.register_blocking("object-store", probe)
        assert (await orch.check_all()).components["object-store"]["status"] == "unreachable"
        release.set()
        for _ in range(100):
            if not orch._in_flight:
                break
            await asyncio.sleep(0.01)
        # the late ok reached nobody; the next call asks again and reports what it finds now
        after = (await orch.check_all()).components["object-store"]
        assert after["status"] == "unreachable" and "refused" in after["message"]

    @pytest.mark.asyncio
    async def test_a_blocking_probe_runs_on_a_daemon_thread_of_its_own(self):
        orch = HealthOrchestrator()
        seen: list[threading.Thread] = []

        def probe():
            seen.append(threading.current_thread())
            return {}

        orch.register_blocking("kafka", probe)
        assert (await orch.check_all()).status == "healthy"
        assert [t.name for t in seen] == ["forge-health-kafka"]
        assert seen[0].daemon and seen[0] is not threading.main_thread()
