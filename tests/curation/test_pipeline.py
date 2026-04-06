# ruff: noqa: TC001
"""Tests for the curation pipeline."""

from __future__ import annotations

from datetime import timedelta

import pytest
from tests.curation.conftest import make_record_batch

from forge.core.models.contextual_record import ContextualRecord
from forge.curation.aggregation import AggregationFunction, AggregationSpec
from forge.curation.lineage import LineageTracker
from forge.curation.normalization import build_whk_unit_registry
from forge.curation.pipeline import (
    AggregationStep,
    CurationPipeline,
    EnrichmentStep,
    NormalizationStep,
    TimeBucketStep,
    ValidationStep,
)
from forge.curation.quality import (
    CompletenessRule,
    QualityMonitor,
    RangeRule,
)


class TestNormalizationStep:
    def test_normalizes_values(self) -> None:
        step = NormalizationStep(build_whk_unit_registry())
        records = make_record_batch(count=3, base_value=78.4, unit="°F")
        results = step.process(records)
        assert len(results) == 3
        assert results[0].value.engineering_units == "°C"
        assert results[0].value.raw == pytest.approx(25.7778, rel=1e-3)

    def test_adds_normalize_to_lineage(self) -> None:
        step = NormalizationStep(build_whk_unit_registry())
        records = make_record_batch(count=1, unit="°F")
        results = step.process(records)
        assert "normalize" in results[0].lineage.transformation_chain


class TestTimeBucketStep:
    def test_floors_timestamps(self) -> None:
        step = TimeBucketStep("5min")
        records = make_record_batch(count=3, interval=timedelta(minutes=1))
        results = step.process(records)
        # All should be floored to same 5-min boundary
        times = {r.timestamp.source_time for r in results}
        assert len(times) == 1  # 3 records within 3 minutes → same bucket

    def test_adds_step_to_lineage(self) -> None:
        step = TimeBucketStep("1hr")
        records = make_record_batch(count=1)
        results = step.process(records)
        assert "time_bucket_1hr" in results[0].lineage.transformation_chain


class TestAggregationStep:
    def test_aggregates_records(self) -> None:
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.AVG],
        )
        step = AggregationStep(spec)
        records = make_record_batch(count=10)
        results = step.process(records)
        assert len(results) == 1

    def test_step_name(self) -> None:
        spec = AggregationSpec(
            functions=[AggregationFunction.MIN, AggregationFunction.MAX],
        )
        step = AggregationStep(spec)
        assert "min" in step.name
        assert "max" in step.name


class TestEnrichmentStep:
    def test_applies_rules(self) -> None:
        def add_tag(record: ContextualRecord) -> ContextualRecord:
            extra = {**record.context.extra, "enriched": "true"}
            return record.model_copy(update={
                "context": record.context.model_copy(update={"extra": extra}),
            })

        step = EnrichmentStep(rules=[add_tag])
        records = make_record_batch(count=2)
        results = step.process(records)
        assert results[0].context.extra["enriched"] == "true"
        assert "enrich" in results[0].lineage.transformation_chain

    def test_no_rules_passthrough(self) -> None:
        step = EnrichmentStep()
        records = make_record_batch(count=3)
        results = step.process(records)
        assert len(results) == 3


class TestValidationStep:
    def test_passthrough(self) -> None:
        step = ValidationStep()
        records = make_record_batch(count=5)
        results = step.process(records)
        assert len(results) == 5  # validation doesn't filter


class TestCurationPipeline:
    def test_empty_pipeline(self) -> None:
        pipeline = CurationPipeline()
        records = make_record_batch(count=5)
        result = pipeline.execute(records)
        assert result.input_count == 5
        assert result.output_count == 5
        assert result.steps_applied == []

    def test_normalization_only(self) -> None:
        pipeline = CurationPipeline(steps=[
            NormalizationStep(build_whk_unit_registry()),
        ])
        records = make_record_batch(count=3, base_value=78.4, unit="°F")
        result = pipeline.execute(records)
        assert result.output_count == 3
        assert result.output_records[0].value.engineering_units == "°C"
        assert result.steps_applied == ["normalize"]

    def test_full_pipeline(self) -> None:
        pipeline = CurationPipeline(
            steps=[
                NormalizationStep(build_whk_unit_registry()),
                TimeBucketStep("5min"),
                AggregationStep(AggregationSpec(
                    group_by=["equipment_id"],
                    time_window="5min",
                    functions=[AggregationFunction.AVG],
                )),
            ],
            product_id="dp-test",
        )
        records = make_record_batch(count=10, base_value=78.4, unit="°F")
        result = pipeline.execute(records)
        assert result.input_count == 10
        assert result.output_count >= 1
        assert "normalize" in result.steps_applied
        assert "aggregate_avg" in result.steps_applied

    def test_pipeline_with_quality(self) -> None:
        monitor = QualityMonitor()
        monitor.register_rules("dp-test", [
            CompletenessRule(["equipment_id"]),
            RangeRule(min_value=0.0, max_value=100.0),
        ])
        pipeline = CurationPipeline(
            steps=[NormalizationStep(build_whk_unit_registry())],
            quality_monitor=monitor,
            product_id="dp-test",
        )
        records = make_record_batch(count=5, base_value=78.4, unit="°F")
        result = pipeline.execute(records)
        assert result.quality_report is not None
        assert result.quality_report.passed

    def test_pipeline_tracks_lineage(self) -> None:
        tracker = LineageTracker()
        pipeline = CurationPipeline(
            steps=[
                NormalizationStep(build_whk_unit_registry()),
                TimeBucketStep("5min"),
            ],
            lineage_tracker=tracker,
            product_id="dp-lineage-test",
        )
        records = make_record_batch(count=3)
        result = pipeline.execute(records)
        assert len(result.lineage_entries) == result.output_count
        # Check lineage has steps
        entry = result.lineage_entries[0]
        assert len(entry.steps) == 2
        assert entry.product_id == "dp-lineage-test"

    def test_add_step(self) -> None:
        pipeline = CurationPipeline()
        pipeline.add_step(NormalizationStep(build_whk_unit_registry()))
        assert len(pipeline.steps) == 1

    def test_cross_adapter_records(
        self, sample_record: ContextualRecord, mes_record: ContextualRecord,
    ) -> None:
        """Test pipeline with records from both WMS and MES adapters."""
        pipeline = CurationPipeline(
            steps=[NormalizationStep(build_whk_unit_registry())],
        )
        result = pipeline.execute([sample_record, mes_record])
        assert result.input_count == 2
        assert result.output_count == 2
        # Both should be in °C after normalization
        for r in result.output_records:
            assert r.value.engineering_units == "°C"
