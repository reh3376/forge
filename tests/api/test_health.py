"""Tests for the health check orchestration module.

Validates:
1. HealthOrchestrator — concurrent probing, timeout handling, aggregation
2. ComponentHealth — status enum, latency tracking
3. PlatformHealth — status rollup (healthy/degraded/unhealthy)
"""

from __future__ import annotations

import asyncio

import pytest

from forge.api.health import (
    ComponentHealth,
    ComponentStatus,
    HealthOrchestrator,
    PlatformHealth,
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
        orch.register("minio", unreachable)

        result = await orch.check_all()
        # 3 OK out of 5 → degraded (not all OK)
        assert result.status == "degraded"
