"""Tests for bridge adapter data models."""

from datetime import datetime, timezone

import pytest

from forge.modules.ot.bridge.models import (
    BridgeConfig,
    BridgeHealth,
    BridgeState,
    IgnitionQuality,
    IgnitionTagResponse,
    IgnitionTagValue,
    TagMapping,
    TagMappingRule,
)


# ---------------------------------------------------------------------------
# IgnitionQuality
# ---------------------------------------------------------------------------


class TestIgnitionQuality:
    """Tests for Ignition quality code mapping."""

    def test_good_is_good(self):
        assert IgnitionQuality.GOOD.is_good is True
        assert IgnitionQuality.GOOD.is_bad is False

    def test_bad_variants(self):
        for q in [
            IgnitionQuality.BAD,
            IgnitionQuality.BAD_STALE,
            IgnitionQuality.BAD_DISABLED,
            IgnitionQuality.BAD_NOT_FOUND,
            IgnitionQuality.BAD_ACCESS_DENIED,
        ]:
            assert q.is_bad is True
            assert q.is_good is False

    def test_uncertain_is_neither(self):
        assert IgnitionQuality.UNCERTAIN.is_good is False
        assert IgnitionQuality.UNCERTAIN.is_bad is False

    def test_error_is_bad(self):
        assert IgnitionQuality.ERROR.is_bad is True


# ---------------------------------------------------------------------------
# IgnitionTagValue
# ---------------------------------------------------------------------------


class TestIgnitionTagValue:
    """Tests for IgnitionTagValue parsing."""

    def test_from_api_response_good(self):
        data = {
            "value": 72.5,
            "quality": "Good",
            "timestamp": 1712678400000,  # epoch ms
            "dataType": "Float8",
        }
        tv = IgnitionTagValue.from_api_response("[WHK01]TIT_2010/Out_PV", data)
        assert tv.path == "[WHK01]TIT_2010/Out_PV"
        assert tv.value == 72.5
        assert tv.quality == IgnitionQuality.GOOD
        assert tv.data_type == "Float8"
        assert tv.timestamp.tzinfo is not None  # UTC

    def test_from_api_response_bad_quality(self):
        data = {"value": None, "quality": "Bad_Stale", "timestamp": 0}
        tv = IgnitionTagValue.from_api_response("[WHK01]tag", data)
        assert tv.quality == IgnitionQuality.BAD_STALE

    def test_from_api_response_unknown_quality(self):
        data = {"value": 1, "quality": "SomeNewQuality"}
        tv = IgnitionTagValue.from_api_response("[WHK01]tag", data)
        assert tv.quality == IgnitionQuality.BAD  # fallback

    def test_from_api_response_iso_timestamp(self):
        data = {"value": 42, "timestamp": "2026-04-09T12:00:00Z"}
        tv = IgnitionTagValue.from_api_response("[WHK01]tag", data)
        assert tv.timestamp.year == 2026
        assert tv.timestamp.month == 4

    def test_from_api_response_missing_fields(self):
        tv = IgnitionTagValue.from_api_response("[WHK01]tag", {})
        assert tv.value is None
        assert tv.quality == IgnitionQuality.GOOD  # default
        assert tv.data_type == "Unknown"

    def test_frozen(self):
        tv = IgnitionTagValue(path="[WHK01]tag", value=1)
        with pytest.raises(AttributeError):
            tv.value = 2  # type: ignore[misc]


# ---------------------------------------------------------------------------
# IgnitionTagResponse
# ---------------------------------------------------------------------------


class TestIgnitionTagResponse:
    """Tests for batch response model."""

    def test_empty_response(self):
        resp = IgnitionTagResponse(values=())
        assert resp.good_count == 0
        assert resp.bad_count == 0
        assert resp.latency_ms >= 0

    def test_mixed_quality_counts(self):
        values = (
            IgnitionTagValue(path="a", quality=IgnitionQuality.GOOD),
            IgnitionTagValue(path="b", quality=IgnitionQuality.GOOD),
            IgnitionTagValue(path="c", quality=IgnitionQuality.BAD),
            IgnitionTagValue(path="d", quality=IgnitionQuality.BAD_STALE),
            IgnitionTagValue(path="e", quality=IgnitionQuality.UNCERTAIN),
        )
        resp = IgnitionTagResponse(values=values)
        assert resp.good_count == 2
        assert resp.bad_count == 2  # BAD and BAD_STALE

    def test_latency_calculation(self):
        t1 = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 4, 9, 12, 0, 0, 500000, tzinfo=timezone.utc)  # +500ms
        resp = IgnitionTagResponse(values=(), request_time=t1, response_time=t2)
        assert abs(resp.latency_ms - 500.0) < 1.0


# ---------------------------------------------------------------------------
# TagMappingRule
# ---------------------------------------------------------------------------


class TestTagMappingRule:
    """Tests for tag mapping rules."""

    def test_frozen(self):
        rule = TagMappingRule(ignition_pattern="*")
        with pytest.raises(AttributeError):
            rule.enabled = False  # type: ignore[misc]

    def test_defaults(self):
        rule = TagMappingRule(ignition_pattern="*")
        assert rule.strip_prefix == ""
        assert rule.forge_prefix == ""
        assert rule.enabled is True


# ---------------------------------------------------------------------------
# TagMapping
# ---------------------------------------------------------------------------


class TestTagMapping:
    """Tests for complete tag mapping results."""

    def test_basic_mapping(self):
        m = TagMapping(
            ignition_path="[WHK01]Distillery01/TIT_2010/Out_PV",
            forge_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            connection_name="WHK01",
        )
        assert m.connection_name == "WHK01"
        assert m.rule is None  # No rule matched


# ---------------------------------------------------------------------------
# BridgeConfig
# ---------------------------------------------------------------------------


class TestBridgeConfig:
    """Tests for bridge configuration model."""

    def test_defaults(self):
        cfg = BridgeConfig()
        assert cfg.gateway_url == "http://localhost:8088"
        assert cfg.poll_interval_ms == 1000
        assert cfg.batch_size == 100
        assert cfg.max_consecutive_failures == 5
        assert cfg.dual_write_enabled is True

    def test_custom_config(self):
        cfg = BridgeConfig(
            gateway_url="http://10.0.22.8:8088",
            tag_provider="WHK01",
            include_patterns=["WH/WHK01/Distillery01/*"],
            exclude_patterns=["*/_meta_*"],
        )
        assert cfg.tag_provider == "WHK01"
        assert len(cfg.include_patterns) == 1
        assert len(cfg.exclude_patterns) == 1


# ---------------------------------------------------------------------------
# BridgeHealth
# ---------------------------------------------------------------------------


class TestBridgeHealth:
    """Tests for bridge health metrics."""

    def test_initial_state(self):
        h = BridgeHealth()
        assert h.state == BridgeState.DISCONNECTED
        assert h.error_rate == 0.0
        assert h.tag_quality_rate == 0.0

    def test_error_rate(self):
        h = BridgeHealth(total_polls=100, total_errors=5)
        assert h.error_rate == 0.05

    def test_tag_quality_rate(self):
        h = BridgeHealth(tags_polled=1000, tags_good=990, tags_bad=10)
        assert h.tag_quality_rate == 0.99

    def test_zero_polls(self):
        h = BridgeHealth()
        assert h.error_rate == 0.0
        assert h.tag_quality_rate == 0.0
