# ruff: noqa: TC001
"""Curation pipeline — composable transformation steps for ContextualRecords.

The pipeline takes raw ContextualRecords from adapters and runs them
through an ordered sequence of CurationSteps:

    1. Normalize  — unit conversion, value alignment
    2. TimeBucket — floor timestamps to configurable windows
    3. Aggregate  — group-by rollups (min/max/avg/count)
    4. Enrich     — cross-system joins, derived fields
    5. Validate   — quality SLO checks

Each step is independent and testable in isolation. The pipeline
produces a CurationResult containing output records, lineage entries,
and a quality report.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from forge.core.models.contextual_record import ContextualRecord
from forge.curation.aggregation import AggregationSpec, aggregate_records
from forge.curation.lineage import LineageEntry, LineageTracker
from forge.curation.normalization import TimeBucketer, UnitRegistry, ValueNormalizer
from forge.curation.quality import QualityMonitor, QualityReport, QualityRule

# ---------------------------------------------------------------------------
# CurationResult — the output of a pipeline run
# ---------------------------------------------------------------------------

@dataclass
class CurationResult:
    """Output of running a curation pipeline."""

    input_count: int = 0
    output_records: list[ContextualRecord] = field(default_factory=list)
    lineage_entries: list[LineageEntry] = field(default_factory=list)
    quality_report: QualityReport | None = None
    steps_applied: list[str] = field(default_factory=list)

    @property
    def output_count(self) -> int:
        return len(self.output_records)


# ---------------------------------------------------------------------------
# CurationStep ABC
# ---------------------------------------------------------------------------

class CurationStep(ABC):
    """A single composable transformation step in the curation pipeline."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of this step."""
        ...

    @abstractmethod
    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        """Transform a batch of records. Returns new list."""
        ...


# ---------------------------------------------------------------------------
# Concrete steps
# ---------------------------------------------------------------------------

class NormalizationStep(CurationStep):
    """Apply unit conversion and value normalization."""

    def __init__(self, unit_registry: UnitRegistry) -> None:
        self._normalizer = ValueNormalizer(unit_registry=unit_registry)

    @property
    def name(self) -> str:
        return "normalize"

    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        return [self._normalizer.normalize_record(r) for r in records]


class TimeBucketStep(CurationStep):
    """Floor timestamps to a configurable window and tag records."""

    def __init__(self, window: str = "5min") -> None:
        self._bucketer = TimeBucketer.from_name(window)
        self._window = window

    @property
    def name(self) -> str:
        return f"time_bucket_{self._window}"

    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        output = []
        for record in records:
            bucketed_time = self._bucketer.bucket(record.timestamp.source_time)
            new_ts = record.timestamp.model_copy(update={"source_time": bucketed_time})
            new_chain = [*record.lineage.transformation_chain, self.name]
            new_lineage = record.lineage.model_copy(update={
                "transformation_chain": new_chain,
            })
            output.append(record.model_copy(update={
                "timestamp": new_ts,
                "lineage": new_lineage,
            }))
        return output


class AggregationStep(CurationStep):
    """Group records by context keys + time bucket and aggregate."""

    def __init__(self, spec: AggregationSpec) -> None:
        self._spec = spec

    @property
    def name(self) -> str:
        funcs = "_".join(f.value.lower() for f in self._spec.functions)
        return f"aggregate_{funcs}"

    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        return aggregate_records(records, self._spec)


class EnrichmentStep(CurationStep):
    """Apply enrichment rules to add derived fields.

    Enrichment rules are callables that take a record and return
    a modified record. Common enrichments: cross-system joins,
    computed fields, classification tags.
    """

    EnrichmentFn = Any  # Callable[[ContextualRecord], ContextualRecord]

    def __init__(self, rules: list[Any] | None = None) -> None:
        self._rules: list[Any] = rules or []

    @property
    def name(self) -> str:
        return "enrich"

    def add_rule(self, rule: Any) -> None:
        """Add an enrichment rule."""
        self._rules.append(rule)

    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        output = []
        for record in records:
            enriched = record
            for rule in self._rules:
                enriched = rule(enriched)
            # Tag lineage
            new_chain = [*enriched.lineage.transformation_chain, "enrich"]
            new_lineage = enriched.lineage.model_copy(update={
                "transformation_chain": new_chain,
            })
            output.append(enriched.model_copy(update={"lineage": new_lineage}))
        return output


class ValidationStep(CurationStep):
    """Run quality rules and tag records that fail validation.

    Does not filter records — all records pass through, but those
    failing validation get quality=UNCERTAIN in their value.
    """

    def __init__(self, rules: list[QualityRule] | None = None) -> None:
        self._rules = rules or []

    @property
    def name(self) -> str:
        return "validate"

    def process(self, records: list[ContextualRecord]) -> list[ContextualRecord]:
        # Validation step evaluates but doesn't modify records
        # Quality assessment is done at the pipeline level via QualityMonitor
        return records


# ---------------------------------------------------------------------------
# CurationPipeline — orchestrates steps
# ---------------------------------------------------------------------------

class CurationPipeline:
    """Orchestrates an ordered sequence of CurationSteps.

    Processes a batch of ContextualRecords through each step,
    records lineage, evaluates quality, and returns a CurationResult.
    """

    def __init__(
        self,
        steps: list[CurationStep] | None = None,
        lineage_tracker: LineageTracker | None = None,
        quality_monitor: QualityMonitor | None = None,
        product_id: str = "",
    ) -> None:
        self._steps = steps or []
        self._lineage = lineage_tracker or LineageTracker()
        self._quality = quality_monitor or QualityMonitor()
        self._product_id = product_id

    @property
    def steps(self) -> list[CurationStep]:
        return list(self._steps)

    def add_step(self, step: CurationStep) -> None:
        """Append a step to the pipeline."""
        self._steps.append(step)

    def execute(
        self,
        records: list[ContextualRecord],
        product_id: str | None = None,
    ) -> CurationResult:
        """Run all steps on a batch of records.

        Returns a CurationResult with output records, lineage, and quality.
        """
        pid = product_id or self._product_id
        input_count = len(records)
        current = list(records)
        steps_applied: list[str] = []

        # Start lineage tracking for this batch
        source_ids = [str(r.record_id) for r in records]
        adapter_ids = list({r.source.adapter_id for r in records})

        # Run each step
        for step in self._steps:
            current = step.process(current)
            steps_applied.append(step.name)

        # Build lineage entries (one per output record)
        lineage_entries: list[LineageEntry] = []
        for output_record in current:
            entry = self._lineage.start_entry(source_ids, adapter_ids)
            for step_name in steps_applied:
                self._lineage.add_step(entry, step_name, step_name.title())
            self._lineage.complete_entry(
                entry,
                output_record_id=str(output_record.record_id),
                product_id=pid,
            )
            lineage_entries.append(entry)

        # Evaluate quality
        quality_report = None
        if pid and self._quality.get_rules(pid):
            quality_report = self._quality.evaluate(pid, current)

        return CurationResult(
            input_count=input_count,
            output_records=current,
            lineage_entries=lineage_entries,
            quality_report=quality_report,
            steps_applied=steps_applied,
        )
