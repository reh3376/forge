# ruff: noqa: TC001
"""Quality monitoring — FQTS-aligned SLO evaluation for data products.

The quality monitor evaluates declarative quality rules against
batches of curated records and produces reports showing which
SLOs pass and which fail. This is the runtime evaluation engine
that enforces the quality contracts defined in FQTS specs.

Rule categories:
- Completeness: required fields are non-null
- Freshness: records are recent enough
- Range: numeric values are within expected bounds
- Consistency: cross-field relationships hold
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from forge._compat import StrEnum
from typing import Any

from forge.core.models.contextual_record import ContextualRecord


class QualityDimension(StrEnum):
    """Quality dimensions aligned with FQTS framework."""

    COMPLETENESS = "completeness"
    FRESHNESS = "freshness"
    ACCURACY = "accuracy"
    CONSISTENCY = "consistency"
    RANGE = "range"


@dataclass
class QualityResult:
    """Result of evaluating a single quality rule."""

    rule_name: str
    dimension: QualityDimension
    passed: bool
    score: float  # 0.0 to 1.0
    measurement: str  # human-readable measurement
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class QualityReport:
    """Aggregate quality report for a batch of records."""

    product_id: str
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    record_count: int = 0
    results: list[QualityResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """Overall pass: all rules pass."""
        return all(r.passed for r in self.results) if self.results else False

    @property
    def score(self) -> float:
        """Aggregate quality score (average of all rule scores)."""
        if not self.results:
            return 0.0
        return sum(r.score for r in self.results) / len(self.results)

    @property
    def failing_rules(self) -> list[QualityResult]:
        """Return only the failing rule results."""
        return [r for r in self.results if not r.passed]

    @property
    def passing_rules(self) -> list[QualityResult]:
        """Return only the passing rule results."""
        return [r for r in self.results if r.passed]


# ---------------------------------------------------------------------------
# Quality Rules
# ---------------------------------------------------------------------------

class QualityRule(ABC):
    """Abstract quality rule that can be evaluated against records."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def dimension(self) -> QualityDimension: ...

    @abstractmethod
    def evaluate(self, records: list[ContextualRecord]) -> QualityResult: ...


class CompletenessRule(QualityRule):
    """Check that required fields are present (non-null) above a threshold.

    Evaluates the percentage of records where all specified fields
    have non-null values.
    """

    def __init__(
        self,
        required_fields: list[str],
        threshold: float = 0.95,
        rule_name: str = "",
    ) -> None:
        self._required_fields = required_fields
        self._threshold = threshold
        self._name = rule_name or f"completeness_{'-'.join(required_fields)}"

    @property
    def name(self) -> str:
        return self._name

    @property
    def dimension(self) -> QualityDimension:
        return QualityDimension.COMPLETENESS

    def evaluate(self, records: list[ContextualRecord]) -> QualityResult:
        if not records:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=False,
                score=0.0,
                measurement="No records to evaluate",
            )

        complete_count = 0
        for record in records:
            context_dict = record.context.model_dump()
            all_present = all(
                context_dict.get(f) is not None
                for f in self._required_fields
            )
            if all_present:
                complete_count += 1

        score = complete_count / len(records)
        return QualityResult(
            rule_name=self.name,
            dimension=self.dimension,
            passed=score >= self._threshold,
            score=score,
            measurement=f"{complete_count}/{len(records)} records complete ({score:.1%})",
            details={
                "required_fields": self._required_fields,
                "threshold": self._threshold,
                "complete_count": complete_count,
                "total_count": len(records),
            },
        )


class FreshnessRule(QualityRule):
    """Check that records are recent enough.

    Evaluates whether the most recent record's source_time is within
    a configurable maximum age.
    """

    def __init__(
        self,
        max_age: timedelta,
        rule_name: str = "freshness",
        reference_time: datetime | None = None,
    ) -> None:
        self._max_age = max_age
        self._name = rule_name
        self._reference_time = reference_time

    @property
    def name(self) -> str:
        return self._name

    @property
    def dimension(self) -> QualityDimension:
        return QualityDimension.FRESHNESS

    def evaluate(self, records: list[ContextualRecord]) -> QualityResult:
        if not records:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=False,
                score=0.0,
                measurement="No records to evaluate",
            )

        now = self._reference_time or datetime.now(timezone.utc)
        most_recent = max(records, key=lambda r: r.timestamp.source_time)
        source_time = most_recent.timestamp.source_time
        if source_time.tzinfo is None:
            source_time = source_time.replace(tzinfo=timezone.utc)

        age = now - source_time
        passed = age <= self._max_age
        # Score: 1.0 if fresh, decays linearly to 0 at 2x max_age
        max_seconds = self._max_age.total_seconds()
        score = max(0.0, 1.0 - (age.total_seconds() / (2 * max_seconds)))

        return QualityResult(
            rule_name=self.name,
            dimension=self.dimension,
            passed=passed,
            score=score,
            measurement=f"Most recent record age: {age}, max allowed: {self._max_age}",
            details={
                "most_recent_source_time": source_time.isoformat(),
                "age_seconds": age.total_seconds(),
                "max_age_seconds": max_seconds,
            },
        )


class RangeRule(QualityRule):
    """Check that numeric values fall within expected bounds.

    Evaluates the percentage of records where raw values are within
    [min_value, max_value].
    """

    def __init__(
        self,
        min_value: float | None = None,
        max_value: float | None = None,
        threshold: float = 0.99,
        rule_name: str = "range",
    ) -> None:
        self._min = min_value
        self._max = max_value
        self._threshold = threshold
        self._name = rule_name

    @property
    def name(self) -> str:
        return self._name

    @property
    def dimension(self) -> QualityDimension:
        return QualityDimension.RANGE

    def evaluate(self, records: list[ContextualRecord]) -> QualityResult:
        if not records:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=False,
                score=0.0,
                measurement="No records to evaluate",
            )

        numeric_records = [
            r for r in records
            if isinstance(r.value.raw, (int, float))
        ]
        if not numeric_records:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=True,
                score=1.0,
                measurement="No numeric records to check",
            )

        in_range = 0
        for r in numeric_records:
            val = float(r.value.raw)
            low_ok = self._min is None or val >= self._min
            high_ok = self._max is None or val <= self._max
            if low_ok and high_ok:
                in_range += 1

        score = in_range / len(numeric_records)
        return QualityResult(
            rule_name=self.name,
            dimension=self.dimension,
            passed=score >= self._threshold,
            score=score,
            measurement=f"{in_range}/{len(numeric_records)} values in range ({score:.1%})",
            details={
                "min": self._min,
                "max": self._max,
                "threshold": self._threshold,
                "in_range": in_range,
                "total_numeric": len(numeric_records),
            },
        )


class ConsistencyRule(QualityRule):
    """Check cross-field consistency in records.

    Evaluates that when field_a has a value, field_b also has a value
    (e.g. if batch_id is set, lot_id should also be set).
    """

    def __init__(
        self,
        field_a: str,
        field_b: str,
        threshold: float = 0.95,
        rule_name: str = "",
    ) -> None:
        self._field_a = field_a
        self._field_b = field_b
        self._threshold = threshold
        self._name = rule_name or f"consistency_{field_a}_{field_b}"

    @property
    def name(self) -> str:
        return self._name

    @property
    def dimension(self) -> QualityDimension:
        return QualityDimension.CONSISTENCY

    def evaluate(self, records: list[ContextualRecord]) -> QualityResult:
        if not records:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=False,
                score=0.0,
                measurement="No records to evaluate",
            )

        consistent = 0
        applicable = 0
        for record in records:
            ctx = record.context.model_dump()
            a_val = ctx.get(self._field_a)
            if a_val is not None:
                applicable += 1
                b_val = ctx.get(self._field_b)
                if b_val is not None:
                    consistent += 1

        if applicable == 0:
            return QualityResult(
                rule_name=self.name,
                dimension=self.dimension,
                passed=True,
                score=1.0,
                measurement=f"No records with {self._field_a} set",
            )

        score = consistent / applicable
        return QualityResult(
            rule_name=self.name,
            dimension=self.dimension,
            passed=score >= self._threshold,
            score=score,
            measurement=(
                f"{consistent}/{applicable} records consistent ({score:.1%})"
            ),
            details={
                "field_a": self._field_a,
                "field_b": self._field_b,
                "threshold": self._threshold,
                "consistent": consistent,
                "applicable": applicable,
            },
        )


# ---------------------------------------------------------------------------
# Quality Monitor
# ---------------------------------------------------------------------------

class QualityMonitor:
    """Evaluates all quality rules for a data product against a record batch.

    Rules are registered per data product. The monitor produces a
    QualityReport with per-rule results and an aggregate score.
    """

    def __init__(self) -> None:
        self._rules: dict[str, list[QualityRule]] = {}  # product_id → rules

    def register_rules(self, product_id: str, rules: list[QualityRule]) -> None:
        """Register quality rules for a data product."""
        self._rules[product_id] = rules

    def add_rule(self, product_id: str, rule: QualityRule) -> None:
        """Add a single rule to a data product."""
        self._rules.setdefault(product_id, []).append(rule)

    def get_rules(self, product_id: str) -> list[QualityRule]:
        """Get all rules for a data product."""
        return self._rules.get(product_id, [])

    def evaluate(
        self,
        product_id: str,
        records: list[ContextualRecord],
    ) -> QualityReport:
        """Evaluate all rules for a data product and produce a report."""
        rules = self._rules.get(product_id, [])
        results = [rule.evaluate(records) for rule in rules]

        return QualityReport(
            product_id=product_id,
            record_count=len(records),
            results=results,
        )
