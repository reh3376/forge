"""Tests for tag engine models — 9-type hierarchy, configs, discriminated union."""

import pytest
from pydantic import TypeAdapter, ValidationError

from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.models import (
    AlarmConfig,
    BaseTag,
    ClampConfig,
    ComputedTag,
    DerivedSource,
    DerivedTag,
    EventTag,
    ExpressionTag,
    HistoryConfig,
    MemoryTag,
    QueryTag,
    ReferenceTag,
    ScaleConfig,
    ScanClass,
    StandardTag,
    TagType,
    TagUnion,
    TagValue,
    VirtualTag,
    SCAN_CLASS_INTERVALS_MS,
)


# ---------------------------------------------------------------------------
# TagType enum
# ---------------------------------------------------------------------------

class TestTagType:
    def test_all_nine_types(self):
        assert len(TagType) == 9

    def test_values(self):
        assert TagType.STANDARD.value == "standard"
        assert TagType.MEMORY.value == "memory"
        assert TagType.EXPRESSION.value == "expression"
        assert TagType.QUERY.value == "query"
        assert TagType.DERIVED.value == "derived"
        assert TagType.REFERENCE.value == "reference"
        assert TagType.COMPUTED.value == "computed"
        assert TagType.EVENT.value == "event"
        assert TagType.VIRTUAL.value == "virtual"

    def test_string_enum(self):
        assert isinstance(TagType.STANDARD, str)
        assert TagType.STANDARD == "standard"


# ---------------------------------------------------------------------------
# ScanClass enum
# ---------------------------------------------------------------------------

class TestScanClass:
    def test_four_classes(self):
        assert len(ScanClass) == 4

    def test_intervals(self):
        assert SCAN_CLASS_INTERVALS_MS[ScanClass.CRITICAL] == 100
        assert SCAN_CLASS_INTERVALS_MS[ScanClass.HIGH] == 500
        assert SCAN_CLASS_INTERVALS_MS[ScanClass.STANDARD] == 1000
        assert SCAN_CLASS_INTERVALS_MS[ScanClass.SLOW] == 5000


# ---------------------------------------------------------------------------
# ScaleConfig
# ---------------------------------------------------------------------------

class TestScaleConfig:
    def test_default_scaling(self):
        s = ScaleConfig()
        assert s.apply(0) == 0.0
        assert s.apply(65535) == 100.0
        assert abs(s.apply(32767.5) - 50.0) < 0.01

    def test_custom_scaling(self):
        s = ScaleConfig(raw_min=4000, raw_max=20000, scaled_min=0, scaled_max=100)
        assert s.apply(4000) == 0.0
        assert s.apply(20000) == 100.0
        assert abs(s.apply(12000) - 50.0) < 0.01

    def test_inverse(self):
        s = ScaleConfig(raw_min=0, raw_max=1000, scaled_min=0, scaled_max=100)
        assert s.inverse(50.0) == 500.0
        assert abs(s.inverse(s.apply(750)) - 750.0) < 0.01

    def test_zero_range(self):
        s = ScaleConfig(raw_min=5, raw_max=5)
        assert s.apply(5) == 0.0  # Returns scaled_min when range is 0


# ---------------------------------------------------------------------------
# ClampConfig
# ---------------------------------------------------------------------------

class TestClampConfig:
    def test_no_clamp(self):
        c = ClampConfig()
        val, clamped = c.apply(999.9)
        assert val == 999.9
        assert not clamped

    def test_clamp_low(self):
        c = ClampConfig(low=0, high=100)
        val, clamped = c.apply(-5)
        assert val == 0
        assert clamped

    def test_clamp_high(self):
        c = ClampConfig(low=0, high=100)
        val, clamped = c.apply(150)
        assert val == 100
        assert clamped

    def test_within_range(self):
        c = ClampConfig(low=0, high=100)
        val, clamped = c.apply(50)
        assert val == 50
        assert not clamped


# ---------------------------------------------------------------------------
# AlarmConfig
# ---------------------------------------------------------------------------

class TestAlarmConfig:
    def test_defaults(self):
        a = AlarmConfig()
        assert a.hihi is None
        assert a.hi is None
        assert a.lo is None
        assert a.lolo is None
        assert a.deadband == 0.0
        assert a.priority == "MEDIUM"
        assert a.enabled

    def test_full_config(self):
        a = AlarmConfig(hihi=95, hi=85, lo=15, lolo=5, deadband=1.0, priority="CRITICAL")
        assert a.hihi == 95
        assert a.lo == 15


# ---------------------------------------------------------------------------
# HistoryConfig
# ---------------------------------------------------------------------------

class TestHistoryConfig:
    def test_defaults(self):
        h = HistoryConfig()
        assert h.enabled
        assert h.sample_mode == "on_change"
        assert h.deadband == 0.0
        assert h.max_interval_ms == 60000


# ---------------------------------------------------------------------------
# TagValue
# ---------------------------------------------------------------------------

class TestTagValue:
    def test_defaults(self):
        tv = TagValue()
        assert tv.value is None
        assert tv.quality == QualityCode.NOT_AVAILABLE
        assert tv.previous_value is None
        assert tv.change_count == 0

    def test_has_changed_true(self):
        tv = TagValue(value=42, previous_value=41)
        assert tv.has_changed()

    def test_has_changed_false(self):
        tv = TagValue(value=42, previous_value=42, quality=QualityCode.GOOD, previous_quality=QualityCode.GOOD)
        assert not tv.has_changed()

    def test_quality_change_counts(self):
        tv = TagValue(value=42, previous_value=42, quality=QualityCode.GOOD, previous_quality=QualityCode.BAD)
        assert tv.has_changed()

    def test_naive_timestamp_gets_utc(self):
        from datetime import datetime
        tv = TagValue(timestamp=datetime(2026, 1, 1, 12, 0))
        assert tv.timestamp.tzinfo is not None


# ---------------------------------------------------------------------------
# Tag type models
# ---------------------------------------------------------------------------

class TestStandardTag:
    def test_creation(self):
        tag = StandardTag(
            path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            opcua_node_id="ns=2;s=Distillery01.TIT_2010.Out_PV",
        )
        assert tag.tag_type == TagType.STANDARD
        assert tag.data_type == DataType.DOUBLE
        assert tag.scan_class == ScanClass.STANDARD
        assert tag.enabled

    def test_requires_opcua_node_id(self):
        with pytest.raises(ValidationError):
            StandardTag(path="test")  # Missing opcua_node_id


class TestMemoryTag:
    def test_creation(self):
        tag = MemoryTag(path="test/mem", default_value=0)
        assert tag.tag_type == TagType.MEMORY
        assert tag.persist is False

    def test_persist_flag(self):
        tag = MemoryTag(path="test/mem", persist=True)
        assert tag.persist


class TestExpressionTag:
    def test_creation(self):
        tag = ExpressionTag(
            path="test/expr",
            expression="{WH/WHK01/temp} * 1.8 + 32",
        )
        assert tag.tag_type == TagType.EXPRESSION

    def test_requires_expression(self):
        with pytest.raises(ValidationError):
            ExpressionTag(path="test")


class TestQueryTag:
    def test_creation(self):
        tag = QueryTag(
            path="test/query",
            query="SELECT count(*) FROM barrels",
        )
        assert tag.tag_type == TagType.QUERY
        assert tag.poll_interval_ms == 5000
        assert tag.scalar

    def test_poll_interval_min(self):
        with pytest.raises(ValidationError):
            QueryTag(path="test", query="SELECT 1", poll_interval_ms=100)


class TestDerivedTag:
    def test_creation(self):
        tag = DerivedTag(
            path="test/derived",
            sources=[
                DerivedSource(tag_path="a", weight=0.5),
                DerivedSource(tag_path="b", weight=0.5),
            ],
        )
        assert tag.tag_type == TagType.DERIVED
        assert tag.aggregation == "weighted_sum"

    def test_requires_at_least_one_source(self):
        with pytest.raises(ValidationError):
            DerivedTag(path="test", sources=[])


class TestReferenceTag:
    def test_creation(self):
        tag = ReferenceTag(
            path="test/ref",
            source_path="test/source",
        )
        assert tag.tag_type == TagType.REFERENCE
        assert tag.transform is None


class TestComputedTag:
    def test_creation(self):
        tag = ComputedTag(
            path="test/computed",
            sources={"temp": "WH/temp", "pressure": "WH/pressure"},
            function="temp * pressure / 100",
        )
        assert tag.tag_type == TagType.COMPUTED
        assert len(tag.sources) == 2


class TestEventTag:
    def test_creation(self):
        tag = EventTag(
            path="test/event",
            event_source="mqtt",
            topic_or_exchange="whk/whk01/distillery01/recipe/next",
        )
        assert tag.tag_type == TagType.EVENT
        assert tag.retain_last


class TestVirtualTag:
    def test_creation(self):
        tag = VirtualTag(
            path="test/virtual",
            source_type="nexttrend",
            source_config={"tag_path": "WH/WHK01/temp", "aggregation": "avg_24h"},
        )
        assert tag.tag_type == TagType.VIRTUAL
        assert tag.cache_ttl_ms == 10000


# ---------------------------------------------------------------------------
# Discriminated union deserialization
# ---------------------------------------------------------------------------

class TestTagUnion:
    adapter = TypeAdapter(TagUnion)

    def test_standard_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "standard",
            "path": "WH/test",
            "opcua_node_id": "ns=2;s=test",
        })
        assert isinstance(tag, StandardTag)

    def test_memory_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "memory",
            "path": "WH/test",
        })
        assert isinstance(tag, MemoryTag)

    def test_expression_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "expression",
            "path": "WH/expr",
            "expression": "{WH/temp} + 10",
        })
        assert isinstance(tag, ExpressionTag)

    def test_computed_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "computed",
            "path": "WH/oee",
            "sources": {"avail": "WH/avail", "perf": "WH/perf"},
            "function": "avail * perf / 100",
        })
        assert isinstance(tag, ComputedTag)

    def test_event_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "event",
            "path": "WH/recipe",
            "event_source": "rabbitmq",
            "topic_or_exchange": "recipe.next",
        })
        assert isinstance(tag, EventTag)

    def test_virtual_tag_from_dict(self):
        tag = self.adapter.validate_python({
            "tag_type": "virtual",
            "path": "WH/avg",
            "source_type": "nexttrend",
            "source_config": {"tag": "WH/temp"},
        })
        assert isinstance(tag, VirtualTag)

    def test_all_nine_types_deserialize(self):
        """Each tag type round-trips through JSON serialization."""
        tags = [
            StandardTag(path="a", opcua_node_id="ns=2;s=a"),
            MemoryTag(path="b"),
            ExpressionTag(path="c", expression="{a} + 1"),
            QueryTag(path="d", query="SELECT 1"),
            DerivedTag(path="e", sources=[DerivedSource(tag_path="a")]),
            ReferenceTag(path="f", source_path="a"),
            ComputedTag(path="g", sources={"x": "a"}, function="x * 2"),
            EventTag(path="h", event_source="mqtt", topic_or_exchange="t"),
            VirtualTag(path="i", source_type="rest", source_config={"url": "http://x"}),
        ]
        for tag in tags:
            json_dict = tag.model_dump(mode="json")
            restored = self.adapter.validate_python(json_dict)
            assert type(restored) is type(tag)
            assert restored.path == tag.path

    def test_invalid_tag_type_raises(self):
        with pytest.raises(ValidationError):
            self.adapter.validate_python({
                "tag_type": "nonexistent",
                "path": "test",
            })

    def test_json_round_trip(self):
        tag = StandardTag(
            path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            opcua_node_id="ns=2;s=Distillery01.TIT_2010.Out_PV",
            data_type=DataType.FLOAT,
            scan_class=ScanClass.HIGH,
            engineering_units="°C",
            alarm=AlarmConfig(hi=85, hihi=95, lo=15, lolo=5),
            history=HistoryConfig(deadband=0.5),
            scale=ScaleConfig(raw_min=0, raw_max=65535, scaled_min=-20, scaled_max=120),
        )
        json_str = tag.model_dump_json()
        restored = self.adapter.validate_json(json_str)
        assert isinstance(restored, StandardTag)
        assert restored.alarm.hi == 85
        assert restored.scale.raw_max == 65535
