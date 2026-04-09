"""Tests for the dual-write data consistency validator."""

import math
from datetime import datetime, timedelta, timezone

import pytest

from forge.modules.ot.bridge.dual_write import (
    ComparisonResult,
    ConsistencyReport,
    DiscrepancyType,
    DualWriteConfig,
    DualWriteValidator,
)


# ---------------------------------------------------------------------------
# ComparisonResult
# ---------------------------------------------------------------------------


class TestComparisonResult:
    """Tests for individual comparison results."""

    def test_matching_result(self):
        r = ComparisonResult(tag_path="WH/WHK01/tag", match=True)
        assert r.match is True
        assert r.discrepancy_type is None

    def test_mismatching_result(self):
        r = ComparisonResult(
            tag_path="WH/WHK01/tag",
            match=False,
            ot_value=72.5,
            bridge_value=73.0,
            discrepancy_type=DiscrepancyType.VALUE_MISMATCH,
        )
        assert r.match is False
        assert r.discrepancy_type == DiscrepancyType.VALUE_MISMATCH

    def test_timestamp_delta(self):
        t1 = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 4, 9, 12, 0, 0, 500000, tzinfo=timezone.utc)
        r = ComparisonResult(
            tag_path="tag", match=True,
            ot_timestamp=t1, bridge_timestamp=t2,
        )
        assert r.timestamp_delta_ms is not None
        assert abs(r.timestamp_delta_ms - 500.0) < 1.0

    def test_timestamp_delta_none_when_missing(self):
        r = ComparisonResult(tag_path="tag", match=True)
        assert r.timestamp_delta_ms is None


# ---------------------------------------------------------------------------
# ConsistencyReport
# ---------------------------------------------------------------------------


class TestConsistencyReport:
    """Tests for aggregate consistency reports."""

    def test_empty_report(self):
        r = ConsistencyReport()
        assert r.discrepancy_rate == 0.0
        assert r.coverage_rate == 1.0
        assert r.passes_gate is True  # Vacuously true

    def test_perfect_report(self):
        r = ConsistencyReport(total_compared=1000, matches=1000, mismatches=0)
        assert r.discrepancy_rate == 0.0
        assert r.passes_gate is True

    def test_failing_report_high_discrepancy(self):
        r = ConsistencyReport(total_compared=100, matches=80, mismatches=20)
        assert r.discrepancy_rate == 0.20
        assert r.passes_gate is False

    def test_failing_report_missing_in_ot(self):
        r = ConsistencyReport(
            total_compared=100, matches=100, mismatches=0,
            missing_in_ot=5,
        )
        assert r.passes_gate is False  # Missing tags fail gate

    def test_barely_passing(self):
        r = ConsistencyReport(total_compared=1000, matches=991, mismatches=9)
        assert r.discrepancy_rate == 0.009
        assert r.passes_gate is True  # <1%

    def test_barely_failing(self):
        r = ConsistencyReport(total_compared=1000, matches=989, mismatches=11)
        assert r.discrepancy_rate == 0.011
        assert r.passes_gate is False  # ≥1%

    def test_coverage_rate(self):
        r = ConsistencyReport(
            total_compared=900,
            missing_in_ot=50,
            missing_in_bridge=50,
        )
        assert r.coverage_rate == 900 / 1000

    def test_get_mismatches(self):
        r = ConsistencyReport(results=[
            ComparisonResult(tag_path="a", match=True),
            ComparisonResult(tag_path="b", match=False, discrepancy_type=DiscrepancyType.VALUE_MISMATCH),
            ComparisonResult(tag_path="c", match=True),
        ])
        mismatches = r.get_mismatches()
        assert len(mismatches) == 1
        assert mismatches[0].tag_path == "b"

    def test_summary_serializable(self):
        r = ConsistencyReport(total_compared=1000, matches=995, mismatches=5)
        s = r.summary()
        assert isinstance(s, dict)
        assert s["total_compared"] == 1000
        assert s["passes_gate"] is True  # 0.5% < 1%
        assert isinstance(s["discrepancy_rate"], float)


# ---------------------------------------------------------------------------
# DualWriteValidator — single tag
# ---------------------------------------------------------------------------


class TestSingleTagComparison:
    """Tests for comparing individual tags."""

    def test_matching_floats(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=72.5, bridge_value=72.5,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_float_within_tolerance(self):
        v = DualWriteValidator(DualWriteConfig(float_tolerance=0.01))
        r = v.compare_tag(
            "tag", ot_value=72.500, bridge_value=72.505,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_float_outside_tolerance(self):
        v = DualWriteValidator(DualWriteConfig(float_tolerance=0.001))
        r = v.compare_tag(
            "tag", ot_value=72.5, bridge_value=73.0,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is False
        assert r.discrepancy_type == DiscrepancyType.VALUE_MISMATCH

    def test_quality_mismatch(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=72.5, bridge_value=72.5,
            ot_quality="GOOD", bridge_quality="BAD",
        )
        assert r.match is False
        assert r.discrepancy_type == DiscrepancyType.QUALITY_MISMATCH

    def test_ignore_quality_mismatch(self):
        v = DualWriteValidator(DualWriteConfig(ignore_quality_mismatch=True))
        r = v.compare_tag(
            "tag", ot_value=72.5, bridge_value=72.5,
            ot_quality="GOOD", bridge_quality="BAD",
        )
        assert r.match is True

    def test_timestamp_drift_within_limit(self):
        t1 = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        t2 = t1 + timedelta(milliseconds=1000)
        v = DualWriteValidator(DualWriteConfig(timestamp_max_drift_ms=5000))
        r = v.compare_tag(
            "tag", ot_value=1, bridge_value=1,
            ot_quality="GOOD", bridge_quality="GOOD",
            ot_timestamp=t1, bridge_timestamp=t2,
        )
        assert r.match is True

    def test_timestamp_drift_exceeds_limit(self):
        t1 = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        t2 = t1 + timedelta(seconds=10)
        v = DualWriteValidator(DualWriteConfig(timestamp_max_drift_ms=5000))
        r = v.compare_tag(
            "tag", ot_value=1, bridge_value=1,
            ot_quality="GOOD", bridge_quality="GOOD",
            ot_timestamp=t1, bridge_timestamp=t2,
        )
        assert r.match is False
        assert r.discrepancy_type == DiscrepancyType.TIMESTAMP_DRIFT

    def test_boolean_comparison(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=True, bridge_value=True,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_boolean_mismatch(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=True, bridge_value=False,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is False

    def test_string_exact_match(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value="RUNNING", bridge_value="RUNNING",
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_string_mismatch(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value="RUNNING", bridge_value="STOPPED",
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is False

    def test_none_both(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=None, bridge_value=None,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_none_one_side(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=42, bridge_value=None,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is False

    def test_nan_both(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=float("nan"), bridge_value=float("nan"),
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_nan_one_side(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=float("nan"), bridge_value=42.0,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is False

    def test_int_vs_float_within_tolerance(self):
        v = DualWriteValidator()
        r = v.compare_tag(
            "tag", ot_value=42, bridge_value=42.0,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True

    def test_large_values_relative_tolerance(self):
        v = DualWriteValidator(DualWriteConfig(
            float_tolerance=0.001,
            float_relative_tolerance=1e-6,
        ))
        r = v.compare_tag(
            "tag", ot_value=1000000.0, bridge_value=1000000.0000005,
            ot_quality="GOOD", bridge_quality="GOOD",
        )
        assert r.match is True


# ---------------------------------------------------------------------------
# DualWriteValidator — batch
# ---------------------------------------------------------------------------


class TestBatchComparison:
    """Tests for batch comparison."""

    def test_all_matching(self):
        v = DualWriteValidator()
        ot = {
            "tag1": {"value": 72.5, "quality": "GOOD"},
            "tag2": {"value": True, "quality": "GOOD"},
        }
        bridge = {
            "tag1": {"value": 72.5, "quality": "GOOD"},
            "tag2": {"value": True, "quality": "GOOD"},
        }
        report = v.compare_batch(ot, bridge)
        assert report.total_compared == 2
        assert report.matches == 2
        assert report.mismatches == 0
        assert report.passes_gate is True

    def test_missing_in_ot(self):
        v = DualWriteValidator()
        ot = {"tag1": {"value": 1, "quality": "GOOD"}}
        bridge = {
            "tag1": {"value": 1, "quality": "GOOD"},
            "tag2": {"value": 2, "quality": "GOOD"},
        }
        report = v.compare_batch(ot, bridge)
        assert report.missing_in_ot == 1
        assert report.passes_gate is False

    def test_missing_in_bridge_ignored(self):
        v = DualWriteValidator(DualWriteConfig(ignore_missing_in_bridge=True))
        ot = {
            "tag1": {"value": 1, "quality": "GOOD"},
            "tag2": {"value": 2, "quality": "GOOD"},
        }
        bridge = {"tag1": {"value": 1, "quality": "GOOD"}}
        report = v.compare_batch(ot, bridge)
        assert report.missing_in_bridge == 1
        assert report.total_compared == 1
        # Missing in bridge doesn't count as mismatch when ignored

    def test_partial_mismatch(self):
        v = DualWriteValidator()
        ot = {
            "tag1": {"value": 72.5, "quality": "GOOD"},
            "tag2": {"value": 42.0, "quality": "GOOD"},
        }
        bridge = {
            "tag1": {"value": 72.5, "quality": "GOOD"},
            "tag2": {"value": 99.9, "quality": "GOOD"},
        }
        report = v.compare_batch(ot, bridge)
        assert report.matches == 1
        assert report.mismatches == 1
        assert report.discrepancy_rate == 0.5

    def test_empty_both(self):
        v = DualWriteValidator()
        report = v.compare_batch({}, {})
        assert report.total_compared == 0
        assert report.passes_gate is True  # Vacuously


# ---------------------------------------------------------------------------
# Coverage gap analysis
# ---------------------------------------------------------------------------


class TestCoverageGaps:
    """Tests for coverage gap finder."""

    def test_no_gaps(self):
        v = DualWriteValidator()
        gaps = v.find_coverage_gaps(
            ot_paths={"tag1", "tag2"},
            bridge_paths={"tag1", "tag2"},
        )
        assert len(gaps["missing_in_ot"]) == 0
        assert len(gaps["missing_in_bridge"]) == 0

    def test_gaps_in_ot(self):
        v = DualWriteValidator()
        gaps = v.find_coverage_gaps(
            ot_paths={"tag1"},
            bridge_paths={"tag1", "tag2", "tag3"},
        )
        assert set(gaps["missing_in_ot"]) == {"tag2", "tag3"}

    def test_gaps_in_bridge(self):
        v = DualWriteValidator()
        gaps = v.find_coverage_gaps(
            ot_paths={"tag1", "tag2"},
            bridge_paths={"tag1"},
        )
        assert set(gaps["missing_in_bridge"]) == {"tag2"}

    def test_sorted_output(self):
        v = DualWriteValidator()
        gaps = v.find_coverage_gaps(
            ot_paths=set(),
            bridge_paths={"z_tag", "a_tag", "m_tag"},
        )
        assert gaps["missing_in_ot"] == ["a_tag", "m_tag", "z_tag"]
