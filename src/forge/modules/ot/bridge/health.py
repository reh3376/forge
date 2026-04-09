"""Bridge health dashboard model — side-by-side OT Module vs. Ignition.

Provides a unified view of both data paths for operator acceptance
during parallel operation validation (Epic 5.2).

The dashboard aggregates:
  - OT Module direct health (from OTModuleAdapter)
  - Bridge adapter health (from IgnitionBridgeAdapter)
  - Dual-write consistency report (from DualWriteValidator)
  - Latency comparison
  - Failover readiness

This is a data model only — the UI rendering is in the OT UI Builder (P9).
The data is exposed via the Forge API for dashboard consumption.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from forge.modules.ot.bridge.dual_write import ConsistencyReport
from forge.modules.ot.bridge.models import BridgeHealth, BridgeState


class FailoverState(str, Enum):
    """Current failover readiness."""

    NOT_TESTED = "not_tested"
    READY = "ready"             # Failover tested and confirmed
    ACTIVE = "active"           # Currently failed over to bridge
    FAILED = "failed"           # Failover test failed
    DISABLED = "disabled"       # Failover not configured


@dataclass
class LatencyComparison:
    """Side-by-side latency metrics for OT Module vs. Bridge."""

    ot_avg_ms: float = 0.0
    ot_p95_ms: float = 0.0
    ot_p99_ms: float = 0.0
    bridge_avg_ms: float = 0.0
    bridge_p95_ms: float = 0.0
    bridge_p99_ms: float = 0.0
    samples: int = 0

    @property
    def ot_faster(self) -> bool:
        """True if OT Module has lower average latency."""
        return self.ot_avg_ms < self.bridge_avg_ms

    @property
    def latency_ratio(self) -> float:
        """Ratio of bridge latency to OT latency (>1 means bridge is slower)."""
        if self.ot_avg_ms == 0:
            return float("inf") if self.bridge_avg_ms > 0 else 1.0
        return self.bridge_avg_ms / self.ot_avg_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "ot_avg_ms": round(self.ot_avg_ms, 2),
            "ot_p95_ms": round(self.ot_p95_ms, 2),
            "ot_p99_ms": round(self.ot_p99_ms, 2),
            "bridge_avg_ms": round(self.bridge_avg_ms, 2),
            "bridge_p95_ms": round(self.bridge_p95_ms, 2),
            "bridge_p99_ms": round(self.bridge_p99_ms, 2),
            "samples": self.samples,
            "ot_faster": self.ot_faster,
            "latency_ratio": round(self.latency_ratio, 2),
        }


@dataclass
class OperatorChecklistItem:
    """A single item on the operator acceptance checklist."""

    id: str
    description: str
    passed: bool = False
    checked_at: datetime | None = None
    checked_by: str = ""
    notes: str = ""


@dataclass
class BridgeHealthDashboard:
    """Unified health dashboard for parallel operation validation.

    Aggregates all metrics needed for Gate 5 evaluation and operator
    acceptance sign-off.
    """

    # Timestamps
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Source health
    ot_module_healthy: bool = False
    ot_module_tags: int = 0
    bridge_healthy: bool = False
    bridge_tags: int = 0
    bridge_health: BridgeHealth = field(default_factory=BridgeHealth)

    # Consistency
    latest_report: ConsistencyReport | None = None
    historical_discrepancy_rates: list[float] = field(default_factory=list)

    # Latency
    latency: LatencyComparison = field(default_factory=LatencyComparison)

    # Failover
    failover_state: FailoverState = FailoverState.NOT_TESTED
    last_failover_test: datetime | None = None
    failover_switch_time_ms: float | None = None

    # Operator checklist
    checklist: list[OperatorChecklistItem] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Initialize the default operator acceptance checklist."""
        if not self.checklist:
            self.checklist = _default_checklist()

    # ------------------------------------------------------------------
    # Gate 5 evaluation
    # ------------------------------------------------------------------

    @property
    def gate5_status(self) -> dict[str, Any]:
        """Evaluate all Gate 5 criteria and return pass/fail for each."""
        report = self.latest_report
        return {
            "data_discrepancy_below_1pct": (
                report.discrepancy_rate < 0.01 if report else False
            ),
            "all_tag_paths_covered": (
                report.missing_in_ot == 0 if report else False
            ),
            "failover_confirmed": self.failover_state == FailoverState.READY,
            "ot_module_healthy": self.ot_module_healthy,
            "bridge_healthy": self.bridge_healthy,
            "operator_checklist_complete": all(
                item.passed for item in self.checklist
            ),
        }

    @property
    def gate5_passes(self) -> bool:
        """True if all Gate 5 criteria are met."""
        return all(self.gate5_status.values())

    # ------------------------------------------------------------------
    # Checklist management
    # ------------------------------------------------------------------

    def check_item(
        self,
        item_id: str,
        *,
        passed: bool = True,
        checked_by: str = "",
        notes: str = "",
    ) -> bool:
        """Mark a checklist item as checked.

        Returns True if the item was found and updated.
        """
        for item in self.checklist:
            if item.id == item_id:
                item.passed = passed
                item.checked_at = datetime.now(timezone.utc)
                item.checked_by = checked_by
                item.notes = notes
                return True
        return False

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def summary(self) -> dict[str, Any]:
        """JSON-serializable summary of the dashboard state."""
        return {
            "generated_at": self.generated_at.isoformat(),
            "ot_module": {
                "healthy": self.ot_module_healthy,
                "tags": self.ot_module_tags,
            },
            "bridge": {
                "healthy": self.bridge_healthy,
                "tags": self.bridge_tags,
                "state": self.bridge_health.state.value,
                "ignition_version": self.bridge_health.ignition_version,
            },
            "consistency": (
                self.latest_report.summary() if self.latest_report else None
            ),
            "latency": self.latency.to_dict(),
            "failover": {
                "state": self.failover_state.value,
                "last_test": (
                    self.last_failover_test.isoformat()
                    if self.last_failover_test
                    else None
                ),
                "switch_time_ms": self.failover_switch_time_ms,
            },
            "gate5": self.gate5_status,
            "gate5_passes": self.gate5_passes,
            "checklist": [
                {
                    "id": item.id,
                    "description": item.description,
                    "passed": item.passed,
                    "checked_by": item.checked_by,
                }
                for item in self.checklist
            ],
        }


# ---------------------------------------------------------------------------
# Default operator acceptance checklist
# ---------------------------------------------------------------------------


def _default_checklist() -> list[OperatorChecklistItem]:
    """The standard checklist for Gate 5 operator sign-off.

    These items must all be verified by an operator or engineer
    before the OT Module can be considered ready for area cutover.
    """
    return [
        OperatorChecklistItem(
            id="data-consistency",
            description="Dual-write data consistency report shows <1% discrepancy for 24+ hours",
        ),
        OperatorChecklistItem(
            id="alarm-parity",
            description="OT Module alarms match Ignition alarm behavior for all critical alarms",
        ),
        OperatorChecklistItem(
            id="control-writes",
            description="Control writes via OT Module confirmed working on test equipment",
        ),
        OperatorChecklistItem(
            id="latency-acceptable",
            description="OT Module read latency is within 2x of Ignition for all polled tags",
        ),
        OperatorChecklistItem(
            id="failover-tested",
            description="Failover from OT Module to Ignition bridge tested and confirmed",
        ),
        OperatorChecklistItem(
            id="historian-data",
            description="NextTrend receiving OT Module data at expected rates",
        ),
        OperatorChecklistItem(
            id="mqtt-parity",
            description="MQTT topics published by OT Module match Ignition MQTT output",
        ),
        OperatorChecklistItem(
            id="hmi-functional",
            description="Operator HMI screens functional with OT Module data source",
        ),
    ]
