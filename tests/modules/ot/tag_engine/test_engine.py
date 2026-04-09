"""Tests for TagEngine — expression evaluation, dependency propagation, derived aggregation."""

import asyncio

import pytest
import pytest_asyncio

from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.models import (
    ComputedTag,
    DerivedSource,
    DerivedTag,
    ExpressionTag,
    MemoryTag,
    ReferenceTag,
    StandardTag,
)
from forge.modules.ot.tag_engine.engine import TagEngine, _quality_rank
from forge.modules.ot.tag_engine.registry import TagRegistry


@pytest_asyncio.fixture
async def registry():
    return TagRegistry()


@pytest_asyncio.fixture
async def engine(registry):
    eng = TagEngine(registry)
    # Don't start scan loops — we test evaluation directly
    return eng


# ---------------------------------------------------------------------------
# Quality rank helper
# ---------------------------------------------------------------------------

class TestQualityRank:
    def test_ordering(self):
        assert _quality_rank(QualityCode.GOOD) < _quality_rank(QualityCode.UNCERTAIN)
        assert _quality_rank(QualityCode.UNCERTAIN) < _quality_rank(QualityCode.BAD)
        assert _quality_rank(QualityCode.BAD) < _quality_rank(QualityCode.NOT_AVAILABLE)


# ---------------------------------------------------------------------------
# Expression evaluation
# ---------------------------------------------------------------------------

class TestExpressionEval:
    async def test_simple_arithmetic(self, registry, engine):
        await registry.register(MemoryTag(path="temp_c"))
        await registry.register(ExpressionTag(
            path="temp_f",
            expression="{temp_c} * 1.8 + 32",
        ))
        await registry.update_value("temp_c", 100.0, QualityCode.GOOD)

        result = await engine.evaluate("temp_f")
        assert result is not None
        value, quality = result
        assert abs(value - 212.0) < 0.01
        assert quality == QualityCode.GOOD

    async def test_multi_source_expression(self, registry, engine):
        await registry.register(MemoryTag(path="a"))
        await registry.register(MemoryTag(path="b"))
        await registry.register(ExpressionTag(
            path="sum_ab",
            expression="{a} + {b}",
        ))
        await registry.update_value("a", 10.0, QualityCode.GOOD)
        await registry.update_value("b", 20.0, QualityCode.GOOD)

        result = await engine.evaluate("sum_ab")
        value, quality = result
        assert value == 30.0

    async def test_math_functions(self, registry, engine):
        await registry.register(MemoryTag(path="val"))
        await registry.register(ExpressionTag(
            path="result",
            expression="sqrt({val})",
        ))
        await registry.update_value("val", 144.0, QualityCode.GOOD)

        result = await engine.evaluate("result")
        value, _ = result
        assert abs(value - 12.0) < 0.01

    async def test_missing_source_gives_bad_quality(self, registry, engine):
        await registry.register(ExpressionTag(
            path="orphan",
            expression="{nonexistent} + 1",
        ))

        result = await engine.evaluate("orphan")
        _, quality = result
        assert quality == QualityCode.BAD

    async def test_invalid_expression_gives_bad_quality(self, registry, engine):
        await registry.register(MemoryTag(path="x"))
        await registry.register(ExpressionTag(
            path="bad_expr",
            expression="{x} / 0",
        ))
        await registry.update_value("x", 1.0, QualityCode.GOOD)

        result = await engine.evaluate("bad_expr")
        _, quality = result
        assert quality == QualityCode.BAD

    async def test_quality_propagation(self, registry, engine):
        """Worst quality of all sources propagates to the expression result."""
        await registry.register(MemoryTag(path="good_src"))
        await registry.register(MemoryTag(path="uncertain_src"))
        await registry.register(ExpressionTag(
            path="combined",
            expression="{good_src} + {uncertain_src}",
        ))
        await registry.update_value("good_src", 10, QualityCode.GOOD)
        await registry.update_value("uncertain_src", 20, QualityCode.UNCERTAIN)

        result = await engine.evaluate("combined")
        value, quality = result
        assert value == 30
        assert quality == QualityCode.UNCERTAIN


# ---------------------------------------------------------------------------
# Derived evaluation
# ---------------------------------------------------------------------------

class TestDerivedEval:
    async def test_weighted_sum(self, registry, engine):
        await registry.register(MemoryTag(path="a"))
        await registry.register(MemoryTag(path="b"))
        await registry.register(DerivedTag(
            path="ws",
            sources=[
                DerivedSource(tag_path="a", weight=0.3),
                DerivedSource(tag_path="b", weight=0.7),
            ],
            aggregation="weighted_sum",
        ))
        await registry.update_value("a", 100.0, QualityCode.GOOD)
        await registry.update_value("b", 200.0, QualityCode.GOOD)

        result = await engine.evaluate("ws")
        value, _ = result
        assert abs(value - 170.0) < 0.01  # 100*0.3 + 200*0.7

    async def test_average(self, registry, engine):
        await registry.register(MemoryTag(path="a"))
        await registry.register(MemoryTag(path="b"))
        await registry.register(DerivedTag(
            path="avg",
            sources=[
                DerivedSource(tag_path="a", weight=1.0),
                DerivedSource(tag_path="b", weight=1.0),
            ],
            aggregation="average",
        ))
        await registry.update_value("a", 10.0, QualityCode.GOOD)
        await registry.update_value("b", 20.0, QualityCode.GOOD)

        result = await engine.evaluate("avg")
        value, _ = result
        assert abs(value - 15.0) < 0.01

    async def test_min_max(self, registry, engine):
        await registry.register(MemoryTag(path="a"))
        await registry.register(MemoryTag(path="b"))
        await registry.register(DerivedTag(
            path="mn", sources=[DerivedSource(tag_path="a"), DerivedSource(tag_path="b")], aggregation="min",
        ))
        await registry.register(DerivedTag(
            path="mx", sources=[DerivedSource(tag_path="a"), DerivedSource(tag_path="b")], aggregation="max",
        ))
        await registry.update_value("a", 5.0, QualityCode.GOOD)
        await registry.update_value("b", 15.0, QualityCode.GOOD)

        min_result = await engine.evaluate("mn")
        max_result = await engine.evaluate("mx")
        assert min_result[0] == 5.0
        assert max_result[0] == 15.0

    async def test_all_sources_missing(self, registry, engine):
        await registry.register(DerivedTag(
            path="empty", sources=[DerivedSource(tag_path="missing")], aggregation="weighted_sum",
        ))
        result = await engine.evaluate("empty")
        _, quality = result
        assert quality == QualityCode.BAD


# ---------------------------------------------------------------------------
# Reference evaluation
# ---------------------------------------------------------------------------

class TestReferenceEval:
    async def test_simple_reference(self, registry, engine):
        await registry.register(MemoryTag(path="source"))
        await registry.register(ReferenceTag(path="alias", source_path="source"))
        await registry.update_value("source", 42, QualityCode.GOOD)

        result = await engine.evaluate("alias")
        value, quality = result
        assert value == 42
        assert quality == QualityCode.GOOD

    async def test_reference_with_transform(self, registry, engine):
        await registry.register(MemoryTag(path="source"))
        await registry.register(ReferenceTag(
            path="doubled",
            source_path="source",
            transform="value * 2",
        ))
        await registry.update_value("source", 21, QualityCode.GOOD)

        result = await engine.evaluate("doubled")
        assert result[0] == 42

    async def test_reference_missing_source(self, registry, engine):
        await registry.register(ReferenceTag(path="broken_ref", source_path="nope"))
        result = await engine.evaluate("broken_ref")
        _, quality = result
        assert quality == QualityCode.BAD


# ---------------------------------------------------------------------------
# Computed evaluation
# ---------------------------------------------------------------------------

class TestComputedEval:
    async def test_oee_calculation(self, registry, engine):
        await registry.register(MemoryTag(path="avail"))
        await registry.register(MemoryTag(path="perf"))
        await registry.register(MemoryTag(path="qual"))
        await registry.register(ComputedTag(
            path="oee",
            sources={"avail": "avail", "perf": "perf", "qual": "qual"},
            function="(avail * perf * qual) / 1000000",
        ))
        await registry.update_value("avail", 90.0, QualityCode.GOOD)
        await registry.update_value("perf", 85.0, QualityCode.GOOD)
        await registry.update_value("qual", 95.0, QualityCode.GOOD)

        result = await engine.evaluate("oee")
        value, _ = result
        expected = (90 * 85 * 95) / 1000000
        assert abs(value - expected) < 0.001

    async def test_computed_with_none_source(self, registry, engine):
        await registry.register(ComputedTag(
            path="broken",
            sources={"x": "missing"},
            function="x * 2 if x is not None else 0",
        ))
        result = await engine.evaluate("broken")
        # Source is None, quality should be BAD
        _, quality = result
        # The function handles None so it may return a value, but quality is BAD
        assert quality == QualityCode.BAD


# ---------------------------------------------------------------------------
# Non-evaluable types return None
# ---------------------------------------------------------------------------

class TestNonEvaluable:
    async def test_standard_not_evaluated(self, registry, engine):
        await registry.register(StandardTag(path="opc", opcua_node_id="ns=2;s=test"))
        result = await engine.evaluate("opc")
        assert result is None

    async def test_memory_not_evaluated(self, registry, engine):
        await registry.register(MemoryTag(path="mem"))
        result = await engine.evaluate("mem")
        assert result is None

    async def test_nonexistent_returns_none(self, registry, engine):
        result = await engine.evaluate("ghost")
        assert result is None


# ---------------------------------------------------------------------------
# Change propagation
# ---------------------------------------------------------------------------

class TestChangePropagation:
    async def test_expression_updates_on_source_change(self, registry, engine):
        """When a source tag changes, the dependent expression re-evaluates."""
        await registry.register(MemoryTag(path="src"))
        await registry.register(ExpressionTag(path="dep", expression="{src} * 2"))

        await engine.start()
        try:
            # Write to source — should trigger propagation to dep
            await registry.update_value("src", 5, QualityCode.GOOD)

            # Give the propagation loop time to process
            await asyncio.sleep(0.1)

            tv = await registry.get_value("dep")
            assert tv.value == 10
        finally:
            await engine.stop()

    async def test_chained_propagation(self, registry, engine):
        """A → B → C chain: change in A propagates through B to C."""
        await registry.register(MemoryTag(path="a"))
        await registry.register(ExpressionTag(path="b", expression="{a} + 1"))
        await registry.register(ExpressionTag(path="c", expression="{b} * 2"))

        await engine.start()
        try:
            await registry.update_value("a", 10, QualityCode.GOOD)
            await asyncio.sleep(0.2)

            tv_b = await registry.get_value("b")
            tv_c = await registry.get_value("c")
            assert tv_b.value == 11    # 10 + 1
            assert tv_c.value == 22    # 11 * 2
        finally:
            await engine.stop()

    async def test_cycle_detection(self, registry, engine):
        """Circular dependencies are detected and broken without crash."""
        # A depends on B, B depends on A
        await registry.register(ExpressionTag(path="cycle_a", expression="{cycle_b} + 1"))
        await registry.register(ExpressionTag(path="cycle_b", expression="{cycle_a} + 1"))

        # Force evaluate — should not infinite loop
        await engine._propagate("cycle_a", visited=set())
        # If we get here, cycle was broken


# ---------------------------------------------------------------------------
# Engine lifecycle
# ---------------------------------------------------------------------------

class TestEngineLifecycle:
    async def test_start_stop(self, registry, engine):
        assert not engine.running
        await engine.start()
        assert engine.running
        await engine.stop()
        assert not engine.running

    async def test_double_start(self, registry, engine):
        await engine.start()
        await engine.start()  # Should be idempotent
        assert engine.running
        await engine.stop()

    async def test_double_stop(self, registry, engine):
        await engine.start()
        await engine.stop()
        await engine.stop()  # Should be idempotent
        assert not engine.running
