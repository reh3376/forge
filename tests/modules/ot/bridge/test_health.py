"""Tests for the bridge health dashboard model."""

from datetime import datetime, timezone

import pytest

from forge.modules.ot.bridge.dual_write import ConsistencyReport
from forge.modules.ot.bridge.health import (
    BridgeHealthDashboard,
    FailoverState,
    LatencyComparison,
    OperatorChecklistItem,
)
from forge.modules.ot.bridge.models import BridgeHealth, BridgeState


# ---------------------------------------------------------------------------
# LatencyComparison
# ---------------------------------------------------------------------------


class TestLatencyComparison:
    """Tests for side-by-side latency metrics."""

    def test_ot_faster(self):
        lc = LatencyComparison(ot_avg_ms=50, bridge_avg_ms=200)
        assert lc.ot_faster is True
        assert lc.latency_ratio == 4.0

    def test_bridge_faster(self):
        lc = LatencyComparison(ot_avg_ms=200, bridge_avg_ms=50)
        assert lc.ot_faster is False
        assert lc.latency_ratio == 0.25

    def test_equal_latency(self):
        lc = LatencyComparison(ot_avg_ms=100, bridge_avg_ms=100)
        assert lc.latency_ratio == 1.0

    def test_zero_ot_latency(self):
        lc = LatencyComparison(ot_avg_ms=0, bridge_avg_ms=50)
        assert lc.latency_ratio == float("inf")

    def test_both_zero(self):
        lc = LatencyComparison(ot_avg_ms=0, bridge_avg_ms=0)
        assert lc.latency_ratio == 1.0

    def test_to_dict(self):
        lc = LatencyComparison(
            ot_avg_ms=50.123, bridge_avg_ms=200.456, samples=1000
        )
        d = lc.to_dict()
        assert d["ot_avg_ms"] == 50.12
        assert d["bridge_avg_ms"] == 200.46
        assert d["samples"] == 1000
        assert d["ot_faster"] is True


# ---------------------------------------------------------------------------
# OperatorChecklistItem
# ---------------------------------------------------------------------------


class TestOperatorChecklist:
    """Tests for checklist items."""

    def test_default_unchecked(self):
        item = OperatorChecklistItem(id="test", description="Test item")
        assert item.passed is False
        assert item.checked_at is None

    def test_check_item(self):
        item = OperatorChecklistItem(id="test", description="Test item")
        item.passed = True
        item.checked_at = datetime.now(timezone.utc)
        item.checked_by = "engineer01"
        assert item.passed is True


# ---------------------------------------------------------------------------
# BridgeHealthDashboard
# ---------------------------------------------------------------------------


class TestBridgeHealthDashboard:
    """Tests for the unified health dashboard."""

    def test_default_checklist_created(self):
        dashboard = BridgeHealthDashboard()
        assert len(dashboard.checklist) == 8  # 8 standard items
        assert all(not item.passed for item in dashboard.checklist)

    def test_gate5_all_fail_initially(self):
        dashboard = BridgeHealthDashboard()
        status = dashboard.gate5_status
        assert status["data_discrepancy_below_1pct"] is False
        assert status["failover_confirmed"] is False
        assert status["operator_checklist_complete"] is False
        assert dashboard.gate5_passes is False

    def test_gate5_passes_when_all_met(self):
        dashboard = BridgeHealthDashboard(
            ot_module_healthy=True,
            bridge_healthy=True,
            failover_state=FailoverState.READY,
            latest_report=ConsistencyReport(
                total_compared=1000, matches=1000, mismatches=0,
                missing_in_ot=0,
            ),
        )
        # Check all checklist items
        for item in dashboard.checklist:
            item.passed = True

        assert dashboard.gate5_passes is True

    def test_gate5_fails_high_discrepancy(self):
        dashboard = BridgeHealthDashboard(
            ot_module_healthy=True,
            bridge_healthy=True,
            failover_state=FailoverState.READY,
            latest_report=ConsistencyReport(
                total_compared=100, matches=80, mismatches=20,
            ),
        )
        for item in dashboard.checklist:
            item.passed = True
        assert dashboard.gate5_passes is False

    def test_gate5_fails_missing_failover(self):
        dashboard = BridgeHealthDashboard(
            ot_module_healthy=True,
            bridge_healthy=True,
            failover_state=FailoverState.NOT_TESTED,
            latest_report=ConsistencyReport(
                total_compared=100, matches=100, mismatches=0,
            ),
        )
        for item in dashboard.checklist:
            item.passed = True
        assert dashboard.gate5_passes is False

    def test_check_item_by_id(self):
        dashboard = BridgeHealthDashboard()
        result = dashboard.check_item(
            "data-consistency",
            passed=True,
            checked_by="pmannion",
            notes="24hr report looks good",
        )
        assert result is True
        item = next(i for i in dashboard.checklist if i.id == "data-consistency")
        assert item.passed is True
        assert item.checked_by == "pmannion"

    def test_check_nonexistent_item(self):
        dashboard = BridgeHealthDashboard()
        result = dashboard.check_item("nonexistent-id")
        assert result is False

    def test_summary_serializable(self):
        dashboard = BridgeHealthDashboard(
            ot_module_healthy=True,
            ot_module_tags=500,
            bridge_healthy=True,
            bridge_tags=480,
            bridge_health=BridgeHealth(
                state=BridgeState.HEALTHY,
                ignition_version="8.1.33",
            ),
            failover_state=FailoverState.NOT_TESTED,
            latency=LatencyComparison(ot_avg_ms=50, bridge_avg_ms=200),
        )
        s = dashboard.summary()
        assert isinstance(s, dict)
        assert s["ot_module"]["healthy"] is True
        assert s["ot_module"]["tags"] == 500
        assert s["bridge"]["state"] == "healthy"
        assert s["latency"]["ot_faster"] is True
        assert s["failover"]["state"] == "not_tested"
        assert isinstance(s["gate5"], dict)

    def test_summary_without_report(self):
        dashboard = BridgeHealthDashboard()
        s = dashboard.summary()
        assert s["consistency"] is None

    def test_custom_checklist(self):
        """Dashboard accepts a custom checklist without generating defaults."""
        custom = [
            OperatorChecklistItem(id="custom1", description="Custom check"),
        ]
        dashboard = BridgeHealthDashboard(checklist=custom)
        assert len(dashboard.checklist) == 1
        assert dashboard.checklist[0].id == "custom1"
