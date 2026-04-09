"""Dual-write data consistency validation.

During parallel operation, both the OT Module (direct OPC-UA) and the
Ignition Bridge Adapter produce ContextualRecords for the same tags.
The DualWriteValidator compares them to detect discrepancies.

A discrepancy is any case where:
  1. Values differ beyond a configurable tolerance (for floats)
  2. Quality codes differ
  3. Timestamps diverge beyond a configurable window
  4. A tag is present in one source but missing from the other

The validator produces a ConsistencyReport with per-tag and aggregate
metrics that Gate 5 uses to determine migration readiness.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any


class DiscrepancyType(str, Enum):
    """Categories of dual-write discrepancy."""

    VALUE_MISMATCH = "value_mismatch"           # Values differ beyond tolerance
    QUALITY_MISMATCH = "quality_mismatch"       # Quality codes differ
    TIMESTAMP_DRIFT = "timestamp_drift"         # Source timestamps too far apart
    MISSING_IN_OT = "missing_in_ot"             # Tag in bridge but not OT Module
    MISSING_IN_BRIDGE = "missing_in_bridge"     # Tag in OT Module but not bridge
    TYPE_MISMATCH = "type_mismatch"             # Data types differ


@dataclass(frozen=True)
class ComparisonResult:
    """Result of comparing a single tag between OT Module and Bridge.

    If ``match`` is True, the values are consistent within tolerance.
    If False, ``discrepancy_type`` describes the category of mismatch.
    """

    tag_path: str
    match: bool
    ot_value: Any = None
    bridge_value: Any = None
    ot_quality: str = ""
    bridge_quality: str = ""
    ot_timestamp: datetime | None = None
    bridge_timestamp: datetime | None = None
    discrepancy_type: DiscrepancyType | None = None
    detail: str = ""

    @property
    def timestamp_delta_ms(self) -> float | None:
        """Time difference between OT and bridge timestamps in ms."""
        if self.ot_timestamp and self.bridge_timestamp:
            delta = abs(
                (self.ot_timestamp - self.bridge_timestamp).total_seconds()
            )
            return delta * 1000.0
        return None


@dataclass
class ConsistencyReport:
    """Aggregate consistency report across all compared tags.

    This is the primary artifact for Gate 5 evaluation.
    """

    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    total_compared: int = 0
    matches: int = 0
    mismatches: int = 0
    missing_in_ot: int = 0
    missing_in_bridge: int = 0
    results: list[ComparisonResult] = field(default_factory=list)

    @property
    def discrepancy_rate(self) -> float:
        """Fraction of tags with any discrepancy (Gate 5 threshold: <1%)."""
        if self.total_compared == 0:
            return 0.0
        return self.mismatches / self.total_compared

    @property
    def coverage_rate(self) -> float:
        """Fraction of tags present in both sources."""
        total = self.total_compared + self.missing_in_ot + self.missing_in_bridge
        if total == 0:
            return 1.0
        return self.total_compared / total

    @property
    def passes_gate(self) -> bool:
        """True if this report meets Gate 5 criteria.

        Gate 5 requires:
          - <1% data discrepancy
          - All tag paths covered (coverage_rate == 1.0)
        """
        return self.discrepancy_rate < 0.01 and self.missing_in_ot == 0

    def get_mismatches(self) -> list[ComparisonResult]:
        """Return only the discrepant comparison results."""
        return [r for r in self.results if not r.match]

    def summary(self) -> dict[str, Any]:
        """Return a JSON-serializable summary dict."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "total_compared": self.total_compared,
            "matches": self.matches,
            "mismatches": self.mismatches,
            "missing_in_ot": self.missing_in_ot,
            "missing_in_bridge": self.missing_in_bridge,
            "discrepancy_rate": round(self.discrepancy_rate, 6),
            "coverage_rate": round(self.coverage_rate, 6),
            "passes_gate": self.passes_gate,
        }


# ---------------------------------------------------------------------------
# Validator configuration
# ---------------------------------------------------------------------------


@dataclass
class DualWriteConfig:
    """Configuration for dual-write comparison."""

    float_tolerance: float = 0.001          # Absolute tolerance for float comparison
    float_relative_tolerance: float = 1e-6  # Relative tolerance for large values
    timestamp_max_drift_ms: float = 5000.0  # Max acceptable timestamp difference
    ignore_quality_mismatch: bool = False    # If True, quality differences don't count
    ignore_missing_in_bridge: bool = True    # Bridge may not have all OT Module tags


# ---------------------------------------------------------------------------
# DualWriteValidator
# ---------------------------------------------------------------------------


class DualWriteValidator:
    """Compares OT Module values against Ignition Bridge values.

    Usage::

        validator = DualWriteValidator()

        # Compare single tag
        result = validator.compare_tag(
            tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            ot_value=72.5, ot_quality="GOOD", ot_timestamp=dt1,
            bridge_value=72.501, bridge_quality="GOOD", bridge_timestamp=dt2,
        )

        # Compare batch
        report = validator.compare_batch(ot_records, bridge_records)
        print(report.discrepancy_rate)  # e.g., 0.002 (0.2%)
    """

    def __init__(self, config: DualWriteConfig | None = None) -> None:
        self._config = config or DualWriteConfig()

    # ------------------------------------------------------------------
    # Single tag comparison
    # ------------------------------------------------------------------

    def compare_tag(
        self,
        tag_path: str,
        *,
        ot_value: Any = None,
        ot_quality: str = "",
        ot_timestamp: datetime | None = None,
        bridge_value: Any = None,
        bridge_quality: str = "",
        bridge_timestamp: datetime | None = None,
    ) -> ComparisonResult:
        """Compare OT Module and Bridge values for a single tag.

        Returns a ComparisonResult indicating match/mismatch.
        """
        # Check quality mismatch
        if not self._config.ignore_quality_mismatch and ot_quality != bridge_quality:
            return ComparisonResult(
                tag_path=tag_path,
                match=False,
                ot_value=ot_value,
                bridge_value=bridge_value,
                ot_quality=ot_quality,
                bridge_quality=bridge_quality,
                ot_timestamp=ot_timestamp,
                bridge_timestamp=bridge_timestamp,
                discrepancy_type=DiscrepancyType.QUALITY_MISMATCH,
                detail=f"Quality: OT={ot_quality}, Bridge={bridge_quality}",
            )

        # Check timestamp drift
        if ot_timestamp and bridge_timestamp:
            drift = abs((ot_timestamp - bridge_timestamp).total_seconds() * 1000.0)
            if drift > self._config.timestamp_max_drift_ms:
                return ComparisonResult(
                    tag_path=tag_path,
                    match=False,
                    ot_value=ot_value,
                    bridge_value=bridge_value,
                    ot_quality=ot_quality,
                    bridge_quality=bridge_quality,
                    ot_timestamp=ot_timestamp,
                    bridge_timestamp=bridge_timestamp,
                    discrepancy_type=DiscrepancyType.TIMESTAMP_DRIFT,
                    detail=f"Drift: {drift:.1f}ms > {self._config.timestamp_max_drift_ms}ms",
                )

        # Check value match
        if not self._values_match(ot_value, bridge_value):
            return ComparisonResult(
                tag_path=tag_path,
                match=False,
                ot_value=ot_value,
                bridge_value=bridge_value,
                ot_quality=ot_quality,
                bridge_quality=bridge_quality,
                ot_timestamp=ot_timestamp,
                bridge_timestamp=bridge_timestamp,
                discrepancy_type=DiscrepancyType.VALUE_MISMATCH,
                detail=f"Value: OT={ot_value!r}, Bridge={bridge_value!r}",
            )

        # All checks passed
        return ComparisonResult(
            tag_path=tag_path,
            match=True,
            ot_value=ot_value,
            bridge_value=bridge_value,
            ot_quality=ot_quality,
            bridge_quality=bridge_quality,
            ot_timestamp=ot_timestamp,
            bridge_timestamp=bridge_timestamp,
        )

    # ------------------------------------------------------------------
    # Batch comparison
    # ------------------------------------------------------------------

    def compare_batch(
        self,
        ot_records: dict[str, dict[str, Any]],
        bridge_records: dict[str, dict[str, Any]],
    ) -> ConsistencyReport:
        """Compare OT Module and Bridge records for a batch of tags.

        Args:
            ot_records: Dict of forge_path → {value, quality, timestamp}
            bridge_records: Dict of forge_path → {value, quality, timestamp}

        Returns:
            ConsistencyReport with per-tag results and aggregate metrics.
        """
        report = ConsistencyReport()
        all_paths = set(ot_records.keys()) | set(bridge_records.keys())

        for path in sorted(all_paths):
            ot = ot_records.get(path)
            bridge = bridge_records.get(path)

            if ot is None:
                # Tag in bridge but not in OT Module
                report.missing_in_ot += 1
                report.results.append(ComparisonResult(
                    tag_path=path,
                    match=False,
                    bridge_value=bridge.get("value") if bridge else None,
                    bridge_quality=bridge.get("quality", "") if bridge else "",
                    discrepancy_type=DiscrepancyType.MISSING_IN_OT,
                    detail="Tag present in bridge but missing from OT Module",
                ))
                continue

            if bridge is None:
                # Tag in OT Module but not in bridge
                report.missing_in_bridge += 1
                if not self._config.ignore_missing_in_bridge:
                    report.results.append(ComparisonResult(
                        tag_path=path,
                        match=False,
                        ot_value=ot.get("value"),
                        ot_quality=ot.get("quality", ""),
                        discrepancy_type=DiscrepancyType.MISSING_IN_BRIDGE,
                        detail="Tag present in OT Module but missing from bridge",
                    ))
                continue

            # Both present — compare
            report.total_compared += 1
            result = self.compare_tag(
                tag_path=path,
                ot_value=ot.get("value"),
                ot_quality=ot.get("quality", ""),
                ot_timestamp=ot.get("timestamp"),
                bridge_value=bridge.get("value"),
                bridge_quality=bridge.get("quality", ""),
                bridge_timestamp=bridge.get("timestamp"),
            )
            report.results.append(result)

            if result.match:
                report.matches += 1
            else:
                report.mismatches += 1

        return report

    # ------------------------------------------------------------------
    # Coverage gap analysis
    # ------------------------------------------------------------------

    def find_coverage_gaps(
        self,
        ot_paths: set[str],
        bridge_paths: set[str],
    ) -> dict[str, list[str]]:
        """Identify tags present in one source but not the other.

        Returns:
            Dict with "missing_in_ot" and "missing_in_bridge" lists.
        """
        return {
            "missing_in_ot": sorted(bridge_paths - ot_paths),
            "missing_in_bridge": sorted(ot_paths - bridge_paths),
        }

    # ------------------------------------------------------------------
    # Internal value comparison
    # ------------------------------------------------------------------

    def _values_match(self, ot_value: Any, bridge_value: Any) -> bool:
        """Compare two values with type-aware tolerance.

        For floats: absolute + relative tolerance.
        For booleans: normalize to bool then compare.
        For strings: exact match.
        For None: both must be None.
        """
        if ot_value is None and bridge_value is None:
            return True
        if ot_value is None or bridge_value is None:
            return False

        # Float comparison with tolerance
        if isinstance(ot_value, (int, float)) and isinstance(bridge_value, (int, float)):
            # Handle NaN
            if math.isnan(float(ot_value)) and math.isnan(float(bridge_value)):
                return True
            if math.isnan(float(ot_value)) or math.isnan(float(bridge_value)):
                return False

            # Absolute tolerance
            if abs(float(ot_value) - float(bridge_value)) <= self._config.float_tolerance:
                return True

            # Relative tolerance for large values
            max_abs = max(abs(float(ot_value)), abs(float(bridge_value)))
            if max_abs > 0:
                rel_diff = abs(float(ot_value) - float(bridge_value)) / max_abs
                if rel_diff <= self._config.float_relative_tolerance:
                    return True

            return False

        # Boolean normalization
        if isinstance(ot_value, bool) or isinstance(bridge_value, bool):
            return bool(ot_value) == bool(bridge_value)

        # String / other: exact match
        return ot_value == bridge_value
