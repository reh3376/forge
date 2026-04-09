"""Tests for tag providers — OpcUaProvider, MemoryProvider, ExpressionProvider,
AcquisitionEngine, and stub providers (Query, Event, Virtual).

Mock strategy:
    - OpcUaClient is mocked (no real PLC needed)
    - TagRegistry is real (in-memory, no external deps)
    - TagEngine is real for ExpressionProvider tests
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from forge.modules.ot.opcua_client.types import (
    ConnectionHealth,
    ConnectionState,
    DataType,
    DataValue,
    QualityCode,
)
from forge.modules.ot.tag_engine.engine import TagEngine
from forge.modules.ot.tag_engine.models import (
    EventTag,
    ExpressionTag,
    MemoryTag,
    StandardTag,
    TagType,
    VirtualTag,
)
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.providers.base import BaseProvider, ProviderState
from forge.modules.ot.tag_engine.providers.event_provider import EventProvider
from forge.modules.ot.tag_engine.providers.expression_provider import ExpressionProvider
from forge.modules.ot.tag_engine.providers.memory_provider import MemoryProvider
from forge.modules.ot.tag_engine.providers.opcua_provider import OpcUaProvider
from forge.modules.ot.tag_engine.providers.query_provider import QueryProvider
from forge.modules.ot.tag_engine.providers.virtual_provider import VirtualProvider
from forge.modules.ot.tag_engine.registry import TagRegistry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def registry():
    return TagRegistry()


def _mock_opcua_client(endpoint_url: str = "opc.tcp://10.4.8.10:4840") -> MagicMock:
    """Create a mock OpcUaClient with the interface OpcUaProvider expects."""
    client = MagicMock()
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.subscribe = AsyncMock(return_value=42)  # subscription_id
    client.unsubscribe = AsyncMock()
    client.read = AsyncMock(return_value=[])
    client.write = AsyncMock()
    client.health = MagicMock(
        return_value=ConnectionHealth(
            endpoint_url=endpoint_url,
            connection_name="WHK01",
            state=ConnectionState.CONNECTED,
            reconnect_count=0,
            latency_ms=2.3,
        )
    )
    return client


def _mock_path_normalizer() -> MagicMock:
    """Create a mock PathNormalizer (identity transform for tests)."""
    normalizer = MagicMock()
    return normalizer


# ---------------------------------------------------------------------------
# BaseProvider lifecycle tests
# ---------------------------------------------------------------------------


class TestBaseProviderLifecycle:
    """Test the BaseProvider state machine via a concrete subclass."""

    async def _make_provider(self, registry, fail_start=False, fail_stop=False):
        """Create a minimal concrete provider for testing."""

        class _TestProvider(BaseProvider):
            async def _start(self):
                if fail_start:
                    raise RuntimeError("start failed")

            async def _stop(self):
                if fail_stop:
                    raise RuntimeError("stop failed")

            async def _health(self):
                return {"test": True}

        return _TestProvider(name="test", registry=registry)

    @pytest.mark.asyncio
    async def test_initial_state_is_idle(self, registry):
        p = await self._make_provider(registry)
        assert p.state == ProviderState.IDLE
        assert not p.is_running

    @pytest.mark.asyncio
    async def test_start_transitions_to_running(self, registry):
        p = await self._make_provider(registry)
        await p.start()
        assert p.state == ProviderState.RUNNING
        assert p.is_running

    @pytest.mark.asyncio
    async def test_start_is_idempotent(self, registry):
        p = await self._make_provider(registry)
        await p.start()
        await p.start()  # Should not raise
        assert p.state == ProviderState.RUNNING

    @pytest.mark.asyncio
    async def test_stop_transitions_to_stopped(self, registry):
        p = await self._make_provider(registry)
        await p.start()
        await p.stop()
        assert p.state == ProviderState.STOPPED
        assert not p.is_running

    @pytest.mark.asyncio
    async def test_stop_idempotent_on_idle(self, registry):
        p = await self._make_provider(registry)
        await p.stop()  # Should not raise on IDLE
        assert p.state == ProviderState.IDLE  # No transition from IDLE

    @pytest.mark.asyncio
    async def test_start_failure_sets_failed_state(self, registry):
        p = await self._make_provider(registry, fail_start=True)
        with pytest.raises(RuntimeError, match="start failed"):
            await p.start()
        assert p.state == ProviderState.FAILED
        assert p._error == "start failed"

    @pytest.mark.asyncio
    async def test_stop_failure_still_transitions_to_stopped(self, registry):
        p = await self._make_provider(registry, fail_stop=True)
        await p.start()
        await p.stop()  # Should NOT raise — error is logged
        assert p.state == ProviderState.STOPPED

    @pytest.mark.asyncio
    async def test_health_includes_base_fields(self, registry):
        p = await self._make_provider(registry)
        await p.start()
        h = await p.health()
        assert h["name"] == "test"
        assert h["state"] == "running"
        assert h["started_at"] is not None
        assert h["error"] is None
        assert h["test"] is True  # From _health()

    @pytest.mark.asyncio
    async def test_health_omits_provider_health_when_not_running(self, registry):
        p = await self._make_provider(registry)
        h = await p.health()
        assert "test" not in h  # _health() not called when IDLE


# ---------------------------------------------------------------------------
# OpcUaProvider tests
# ---------------------------------------------------------------------------


class TestOpcUaProvider:
    """Test OpcUaProvider with mocked OPC-UA client."""

    @pytest_asyncio.fixture
    async def setup(self, registry):
        """Register StandardTags and create provider."""
        # Register tags for connection "WHK01"
        tags = [
            StandardTag(
                path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
                description="Temperature sensor",
                data_type=DataType.FLOAT,
                opcua_node_id="ns=2;s=Distillery01.TIT_2010.Out_PV",
                connection_name="WHK01",
            ),
            StandardTag(
                path="WH/WHK01/Distillery01/LIT_6050B/Out_PV",
                description="Level sensor",
                data_type=DataType.FLOAT,
                opcua_node_id="ns=2;s=Distillery01.LIT_6050B.Out_PV",
                connection_name="WHK01",
            ),
            # Tag on a different connection — should NOT be subscribed
            StandardTag(
                path="WH/WHK02/Granary01/TIT_1010/Out_PV",
                description="Grain temp",
                data_type=DataType.FLOAT,
                opcua_node_id="ns=2;s=Granary01.TIT_1010.Out_PV",
                connection_name="WHK02",
            ),
        ]
        for tag in tags:
            await registry.register(tag)

        client = _mock_opcua_client()
        normalizer = _mock_path_normalizer()
        provider = OpcUaProvider(
            name="WHK01", registry=registry, client=client, path_normalizer=normalizer
        )
        return provider, client, registry

    @pytest.mark.asyncio
    async def test_start_connects_and_subscribes(self, setup):
        provider, client, registry = setup
        await provider.start()

        client.connect.assert_called_once()
        client.subscribe.assert_called_once()
        # Should subscribe to 2 tags (WHK01 only, not WHK02)
        call_args = client.subscribe.call_args
        node_ids = call_args.kwargs.get("node_ids") or call_args[1].get("node_ids") or call_args[0][0]
        assert len(node_ids) == 2
        assert provider.subscribed_tag_count == 2
        assert provider.state == ProviderState.RUNNING

    @pytest.mark.asyncio
    async def test_on_data_change_updates_registry(self, setup):
        provider, client, registry = setup
        await provider.start()

        # Simulate an OPC-UA data change callback
        dv = DataValue(
            value=72.5,
            data_type=DataType.FLOAT,
            quality=QualityCode.GOOD,
            server_timestamp=datetime.now(timezone.utc),
            source_timestamp=datetime.now(timezone.utc),
        )
        await provider._on_data_change(
            "ns=2;s=Distillery01.TIT_2010.Out_PV", dv
        )

        tv = await registry.get_value("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert tv is not None
        assert tv.value == 72.5
        assert tv.quality == QualityCode.GOOD
        assert provider._values_received == 1

    @pytest.mark.asyncio
    async def test_on_data_change_ignores_unknown_node(self, setup):
        provider, client, registry = setup
        await provider.start()

        dv = DataValue(value=99.0)
        await provider._on_data_change("ns=2;s=UNKNOWN_NODE", dv)
        # Should not crash, values_received stays at 0
        assert provider._values_received == 0

    @pytest.mark.asyncio
    async def test_stop_unsubscribes_and_disconnects(self, setup):
        provider, client, registry = setup
        await provider.start()
        await provider.stop()

        client.unsubscribe.assert_called_once_with(42)
        client.disconnect.assert_called_once()
        assert provider.subscribed_tag_count == 0
        assert provider.state == ProviderState.STOPPED

    @pytest.mark.asyncio
    async def test_resubscribe_refreshes_subscriptions(self, setup):
        provider, client, registry = setup
        await provider.start()
        assert client.subscribe.call_count == 1

        await provider.resubscribe()
        assert client.subscribe.call_count == 2
        assert provider.subscribed_tag_count == 2

    @pytest.mark.asyncio
    async def test_health_reports_connection_metrics(self, setup):
        provider, client, registry = setup
        await provider.start()
        h = await provider.health()

        assert h["connection_state"] == ConnectionState.CONNECTED.value
        assert h["subscribed_tags"] == 2
        assert h["values_received"] == 0
        assert h["latency_ms"] == 2.3

    @pytest.mark.asyncio
    async def test_read_current_reads_from_plc(self, setup):
        provider, client, registry = setup
        await provider.start()

        dv = DataValue(
            value=65.0,
            quality=QualityCode.GOOD,
            source_timestamp=datetime.now(timezone.utc),
        )
        client.read = AsyncMock(return_value=[dv])

        result = await provider.read_current("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert result is not None
        assert result.value == 65.0

    @pytest.mark.asyncio
    async def test_read_current_returns_none_for_non_standard_tag(self, setup):
        provider, client, registry = setup
        await provider.start()

        # Register a memory tag and try to read it via OPC-UA
        mem = MemoryTag(path="test/mem", description="test")
        await registry.register(mem)
        result = await provider.read_current("test/mem")
        assert result is None

    @pytest.mark.asyncio
    async def test_write_to_plc(self, setup):
        provider, client, registry = setup
        await provider.start()

        ok = await provider.write_to_plc(
            "WH/WHK01/Distillery01/TIT_2010/Out_PV", 100.0, DataType.FLOAT
        )
        assert ok is True
        client.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_to_plc_fails_for_non_standard_tag(self, setup):
        provider, client, registry = setup
        mem = MemoryTag(path="test/mem2", description="test")
        await registry.register(mem)
        ok = await provider.write_to_plc("test/mem2", 42)
        assert ok is False


# ---------------------------------------------------------------------------
# MemoryProvider tests
# ---------------------------------------------------------------------------


class TestMemoryProvider:
    """Test MemoryProvider initialization and write operations."""

    @pytest_asyncio.fixture
    async def setup(self, registry):
        tags = [
            MemoryTag(
                path="mem/counter",
                description="A counter",
                default_value=0,
            ),
            MemoryTag(
                path="mem/name",
                description="A string tag",
                default_value="hello",
            ),
            MemoryTag(
                path="mem/uninitialized",
                description="No default",
            ),
        ]
        for tag in tags:
            await registry.register(tag)

        provider = MemoryProvider(registry=registry)
        return provider, registry

    @pytest.mark.asyncio
    async def test_start_initializes_default_values(self, setup):
        provider, registry = setup
        await provider.start()

        tv = await registry.get_value("mem/counter")
        assert tv.value == 0
        assert tv.quality == QualityCode.GOOD

        tv2 = await registry.get_value("mem/name")
        assert tv2.value == "hello"

    @pytest.mark.asyncio
    async def test_start_initializes_null_defaults_with_good_quality(self, setup):
        provider, registry = setup
        await provider.start()

        tv = await registry.get_value("mem/uninitialized")
        assert tv.value is None
        assert tv.quality == QualityCode.GOOD

    @pytest.mark.asyncio
    async def test_write_updates_value(self, setup):
        provider, registry = setup
        await provider.start()

        ok = await provider.write("mem/counter", 42)
        assert ok is True
        tv = await registry.get_value("mem/counter")
        assert tv.value == 42

    @pytest.mark.asyncio
    async def test_write_returns_false_for_unknown_tag(self, setup):
        provider, registry = setup
        await provider.start()
        ok = await provider.write("nonexistent/tag", 1)
        assert ok is False

    @pytest.mark.asyncio
    async def test_write_raises_for_non_memory_tag(self, setup):
        provider, registry = setup
        # Register a StandardTag
        st = StandardTag(
            path="std/temp",
            description="temp",
            data_type=DataType.FLOAT,
            opcua_node_id="ns=2;s=temp",
            connection_name="WHK01",
        )
        await registry.register(st)
        await provider.start()

        with pytest.raises(ValueError, match="non-Memory"):
            await provider.write("std/temp", 99)

    @pytest.mark.asyncio
    async def test_health_reports_initialized_count(self, setup):
        provider, registry = setup
        await provider.start()
        h = await provider.health()
        assert h["initialized_tags"] == 3


# ---------------------------------------------------------------------------
# ExpressionProvider tests
# ---------------------------------------------------------------------------


class TestExpressionProvider:
    """Test ExpressionProvider initial computation wiring."""

    @pytest_asyncio.fixture
    async def setup(self, registry):
        # Source memory tags
        mem_a = MemoryTag(path="source/a", description="Source A", default_value=10.0)
        mem_b = MemoryTag(path="source/b", description="Source B", default_value=20.0)
        await registry.register(mem_a)
        await registry.register(mem_b)

        # Initialize source values
        await registry.update_value("source/a", 10.0, QualityCode.GOOD)
        await registry.update_value("source/b", 20.0, QualityCode.GOOD)

        # Expression tag that reads from sources
        expr = ExpressionTag(
            path="calc/sum",
            description="Sum of A and B",
            expression="{source/a} + {source/b}",
        )
        await registry.register(expr)

        engine = TagEngine(registry)
        provider = ExpressionProvider(registry=registry, engine=engine)
        return provider, engine, registry

    @pytest.mark.asyncio
    async def test_start_runs_initial_computation(self, setup):
        provider, engine, registry = setup
        await provider.start()

        # The expression tag should have been computed
        tv = await registry.get_value("calc/sum")
        assert tv is not None
        assert tv.value == 30.0
        assert provider._evaluable_count >= 1
        assert provider._initial_eval_count >= 1

    @pytest.mark.asyncio
    async def test_start_without_engine_skips_computation(self, registry):
        expr = ExpressionTag(
            path="calc/noop",
            description="No engine attached",
            expression="{x} + 1",
        )
        await registry.register(expr)
        provider = ExpressionProvider(registry=registry, engine=None)
        await provider.start()

        assert provider._evaluable_count >= 1
        assert provider._initial_eval_count == 0

    @pytest.mark.asyncio
    async def test_set_engine_deferred_binding(self, registry):
        provider = ExpressionProvider(registry=registry, engine=None)
        assert provider._engine is None

        engine = TagEngine(registry)
        provider.set_engine(engine)
        assert provider._engine is engine

    @pytest.mark.asyncio
    async def test_health_reports_counts(self, setup):
        provider, engine, registry = setup
        await provider.start()
        h = await provider.health()
        assert h["evaluable_tags"] >= 1
        assert h["initial_eval_count"] >= 1


# ---------------------------------------------------------------------------
# AcquisitionEngine tests
# ---------------------------------------------------------------------------


class TestAcquisitionEngine:
    """Test orchestration, ordering, and fault isolation."""

    @pytest_asyncio.fixture
    async def engine(self):
        return AcquisitionEngine()

    def _make_mock_provider(self, name: str, fail_start=False) -> MagicMock:
        """Create a mock provider with the BaseProvider interface."""
        p = MagicMock(spec=BaseProvider)
        p.name = name
        p.state = ProviderState.IDLE

        async def _start():
            if fail_start:
                p.state = ProviderState.FAILED
                raise RuntimeError(f"{name} start failed")
            p.state = ProviderState.RUNNING

        async def _stop():
            p.state = ProviderState.STOPPED

        async def _health():
            return {"name": name, "state": p.state.value}

        p.start = AsyncMock(side_effect=_start)
        p.stop = AsyncMock(side_effect=_stop)
        p.health = AsyncMock(side_effect=_health)
        return p

    @pytest.mark.asyncio
    async def test_add_provider(self, engine):
        p = self._make_mock_provider("test")
        engine.add_provider(p)
        assert engine.provider_count == 1
        assert engine.get_provider("test") is p

    @pytest.mark.asyncio
    async def test_add_duplicate_provider_raises(self, engine):
        p1 = self._make_mock_provider("dup")
        p2 = self._make_mock_provider("dup")
        engine.add_provider(p1)
        with pytest.raises(ValueError, match="already registered"):
            engine.add_provider(p2)

    @pytest.mark.asyncio
    async def test_start_order_follows_priority(self, engine):
        """Memory(10) then OPC-UA(50) then Expression(90)."""
        start_order = []

        for name, prio in [("expression", 90), ("memory", 10), ("opcua", 50)]:
            p = self._make_mock_provider(name)

            original_start = p.start.side_effect

            async def _tracking_start(_name=name, _orig=original_start):
                start_order.append(_name)
                await _orig()

            p.start = AsyncMock(side_effect=_tracking_start)
            engine.add_provider(p, priority=prio)

        await engine.start()

        assert start_order == ["memory", "opcua", "expression"]
        assert engine.running is True

    @pytest.mark.asyncio
    async def test_stop_order_is_reversed(self, engine):
        stop_order = []

        for name, prio in [("expression", 90), ("memory", 10), ("opcua", 50)]:
            p = self._make_mock_provider(name)

            async def _tracking_stop(_name=name):
                stop_order.append(_name)

            p.stop = AsyncMock(side_effect=_tracking_stop)
            engine.add_provider(p, priority=prio)

        await engine.start()
        await engine.stop()

        assert stop_order == ["expression", "opcua", "memory"]
        assert engine.running is False

    @pytest.mark.asyncio
    async def test_fault_isolation_on_start(self, engine):
        """One provider failing does not prevent others from starting."""
        good = self._make_mock_provider("good")
        bad = self._make_mock_provider("bad", fail_start=True)
        good2 = self._make_mock_provider("good2")

        engine.add_provider(good, priority=10)
        engine.add_provider(bad, priority=50)
        engine.add_provider(good2, priority=90)

        await engine.start()

        assert good.state == ProviderState.RUNNING
        assert bad.state == ProviderState.FAILED
        assert good2.state == ProviderState.RUNNING

    @pytest.mark.asyncio
    async def test_health_aggregation_healthy(self, engine):
        p1 = self._make_mock_provider("a")
        p2 = self._make_mock_provider("b")
        engine.add_provider(p1)
        engine.add_provider(p2)
        await engine.start()

        h = await engine.health()
        assert h["status"] == "healthy"
        assert h["running_providers"] == 2
        assert h["total_providers"] == 2

    @pytest.mark.asyncio
    async def test_health_aggregation_degraded(self, engine):
        good = self._make_mock_provider("good")
        bad = self._make_mock_provider("bad", fail_start=True)
        engine.add_provider(good)
        engine.add_provider(bad)
        await engine.start()

        h = await engine.health()
        assert h["status"] == "degraded"
        assert h["running_providers"] == 1

    @pytest.mark.asyncio
    async def test_restart_provider(self, engine):
        p = self._make_mock_provider("restartable")
        engine.add_provider(p)
        await engine.start()

        ok = await engine.restart_provider("restartable")
        assert ok is True
        assert p.stop.call_count == 1
        assert p.start.call_count == 2

    @pytest.mark.asyncio
    async def test_restart_unknown_provider(self, engine):
        ok = await engine.restart_provider("nonexistent")
        assert ok is False

    @pytest.mark.asyncio
    async def test_start_idempotent(self, engine):
        p = self._make_mock_provider("once")
        engine.add_provider(p)
        await engine.start()
        await engine.start()  # Should return early
        assert p.start.call_count == 1

    @pytest.mark.asyncio
    async def test_stop_idempotent(self, engine):
        p = self._make_mock_provider("once")
        engine.add_provider(p)
        await engine.stop()  # Never started — should return early
        assert p.stop.call_count == 0


# ---------------------------------------------------------------------------
# QueryProvider stub tests
# ---------------------------------------------------------------------------


class TestQueryProvider:
    """Verify QueryProvider stub starts, stops, and reports health."""

    @pytest.mark.asyncio
    async def test_lifecycle(self, registry):
        provider = QueryProvider(registry=registry)
        await provider.start()
        assert provider.state == ProviderState.RUNNING

        h = await provider.health()
        assert h["query_tags"] == 0
        assert "stub" in h["status"]

        await provider.stop()
        assert provider.state == ProviderState.STOPPED

    @pytest.mark.asyncio
    async def test_discovers_query_tags(self, registry):
        from forge.modules.ot.tag_engine.models import QueryTag

        qt = QueryTag(
            path="query/test",
            description="test query",
            query="SELECT 1",
            connection_name="forge_db",
            poll_interval_ms=5000,
        )
        await registry.register(qt)

        provider = QueryProvider(registry=registry)
        await provider.start()
        assert provider._query_count == 1


# ---------------------------------------------------------------------------
# EventProvider stub tests
# ---------------------------------------------------------------------------


class TestEventProvider:
    """Verify EventProvider stub and inject_event method."""

    @pytest.mark.asyncio
    async def test_lifecycle(self, registry):
        provider = EventProvider(registry=registry)
        await provider.start()
        assert provider.state == ProviderState.RUNNING

        h = await provider.health()
        assert h["event_tags"] == 0
        assert "stub" in h["status"]

        await provider.stop()
        assert provider.state == ProviderState.STOPPED

    @pytest.mark.asyncio
    async def test_inject_event(self, registry):
        et = EventTag(
            path="event/mqtt_temp",
            description="MQTT temperature",
            event_source="mqtt",
            topic_or_exchange="plant/temp",
        )
        await registry.register(et)

        provider = EventProvider(registry=registry)
        await provider.start()

        ok = await provider.inject_event("event/mqtt_temp", 42.5)
        assert ok is True

        tv = await registry.get_value("event/mqtt_temp")
        assert tv.value == 42.5
        assert tv.quality == QualityCode.GOOD

    @pytest.mark.asyncio
    async def test_inject_event_nonexistent_tag(self, registry):
        provider = EventProvider(registry=registry)
        await provider.start()
        ok = await provider.inject_event("nonexistent/tag", 1)
        assert ok is False

    @pytest.mark.asyncio
    async def test_inject_event_wrong_type_raises(self, registry):
        mem = MemoryTag(path="mem/not_event", description="not event")
        await registry.register(mem)

        provider = EventProvider(registry=registry)
        await provider.start()

        with pytest.raises(ValueError, match="non-Event"):
            await provider.inject_event("mem/not_event", 42)


# ---------------------------------------------------------------------------
# VirtualProvider stub tests
# ---------------------------------------------------------------------------


class TestVirtualProvider:
    """Verify VirtualProvider stub with fallback initialization."""

    @pytest.mark.asyncio
    async def test_lifecycle(self, registry):
        provider = VirtualProvider(registry=registry)
        await provider.start()
        assert provider.state == ProviderState.RUNNING

        h = await provider.health()
        assert h["virtual_tags"] == 0
        assert "stub" in h["status"]

        await provider.stop()
        assert provider.state == ProviderState.STOPPED

    @pytest.mark.asyncio
    async def test_fallback_value_initialization(self, registry):
        vt = VirtualTag(
            path="virtual/db_metric",
            description="DB metric",
            source_type="database",
            source_config={"query": "SELECT count(*) FROM orders"},
            fallback_value=-1.0,
        )
        await registry.register(vt)

        provider = VirtualProvider(registry=registry)
        await provider.start()

        tv = await registry.get_value("virtual/db_metric")
        assert tv.value == -1.0
        assert tv.quality == QualityCode.UNCERTAIN  # Fallback = UNCERTAIN

    @pytest.mark.asyncio
    async def test_no_fallback_skips_init(self, registry):
        vt = VirtualTag(
            path="virtual/no_fallback",
            description="No fallback",
            source_type="rest",
            source_config={"url": "https://api.example.com/data"},
        )
        await registry.register(vt)

        provider = VirtualProvider(registry=registry)
        await provider.start()

        tv = await registry.get_value("virtual/no_fallback")
        # Should still have default NOT_AVAILABLE quality (no update pushed)
        assert tv.quality == QualityCode.NOT_AVAILABLE

    @pytest.mark.asyncio
    async def test_cache_cleared_on_stop(self, registry):
        provider = VirtualProvider(registry=registry)
        provider._cache["test"] = ("value", datetime.now(timezone.utc))
        await provider.start()
        await provider.stop()
        assert len(provider._cache) == 0


# ---------------------------------------------------------------------------
# Integration: Full acquisition stack
# ---------------------------------------------------------------------------


class TestAcquisitionIntegration:
    """Integration test with real providers wired to a shared registry."""

    @pytest.mark.asyncio
    async def test_memory_then_expression_computation(self, registry):
        """Verify Memory(10) then Expression(90) startup order works end-to-end."""
        # Register memory source
        mem = MemoryTag(path="src/temp", description="Temperature", default_value=72.5)
        await registry.register(mem)

        # Register expression that reads the memory tag
        expr = ExpressionTag(
            path="calc/temp_f_to_c",
            description="Fahrenheit to Celsius",
            expression="({src/temp} - 32) * 5 / 9",
        )
        await registry.register(expr)

        # Wire up providers
        engine_obj = TagEngine(registry)
        mem_provider = MemoryProvider(registry=registry)
        expr_provider = ExpressionProvider(registry=registry, engine=engine_obj)

        acq = AcquisitionEngine()
        acq.add_provider(mem_provider, priority=10)
        acq.add_provider(expr_provider, priority=90)

        await acq.start()

        # Memory provider initialized first, so expression can read the value
        tv = await registry.get_value("calc/temp_f_to_c")
        assert tv is not None
        expected = (72.5 - 32) * 5 / 9
        assert abs(tv.value - expected) < 0.01

        h = await acq.health()
        assert h["status"] == "healthy"
        assert h["running_providers"] == 2

        await acq.stop()
