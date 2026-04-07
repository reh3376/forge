"""Tests for the quality monitor."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest
from tests.curation.conftest import make_record_batch

from forge.core.models.contextual_record import (
    ContextualRecord,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.curation.quality import (
    CompletenessRule,
    ConsistencyRule,
    FreshnessRule,
    QualityDimension,
    QualityMonitor,
    QualityReport,
    RangeRule,
)


class TestCompletenessRule:
    def test_all_complete(self) -> None:
        records = make_record_batch(count=10)  # all have equipment_id, batch_id, lot_id
        rule = CompletenessRule(["equipment_id", "batch_id", "lot_id"])
        result = rule.evaluate(records)
        assert result.passed
        assert result.score == 1.0

    def test_partial_completeness(self) -> None:
        records = make_record_batch(count=10)
        # Remove lot_id from half
        for i in range(5):
            records[i] = records[i].model_copy(update={
                "context": records[i].context.model_copy(update={"lot_id": None}),
            })
        rule = CompletenessRule(["lot_id"], threshold=0.8)
        result = rule.evaluate(records)
        assert result.score == pytest.approx(0.5)
        assert not result.passed  # 0.5 < 0.8

    def test_empty_records(self) -> None:
        rule = CompletenessRule(["equipment_id"])
        result = rule.evaluate([])
        assert not result.passed
        assert result.score == 0.0

    def test_custom_name(self) -> None:
        rule = CompletenessRule(["equipment_id"], rule_name="custom_check")
        assert rule.name == "custom_check"
        assert rule.dimension == QualityDimension.COMPLETENESS


class TestFreshnessRule:
    def test_fresh_records(self) -> None:
        now = datetime.now(timezone.utc)
        records = make_record_batch(count=5, base_time=now - timedelta(minutes=5))
        rule = FreshnessRule(max_age=timedelta(hours=1), reference_time=now)
        result = rule.evaluate(records)
        assert result.passed
        assert result.score > 0.9

    def test_stale_records(self) -> None:
        now = datetime.now(timezone.utc)
        records = make_record_batch(
            count=5,
            base_time=now - timedelta(hours=3),
            interval=timedelta(minutes=1),
        )
        rule = FreshnessRule(max_age=timedelta(hours=1), reference_time=now)
        result = rule.evaluate(records)
        assert not result.passed

    def test_empty_records(self) -> None:
        rule = FreshnessRule(max_age=timedelta(hours=1))
        result = rule.evaluate([])
        assert not result.passed

    def test_score_decay(self) -> None:
        now = datetime.now(timezone.utc)
        # Records at exactly max_age → score should be ~0.5
        records = make_record_batch(
            count=1,
            base_time=now - timedelta(hours=1),
        )
        rule = FreshnessRule(max_age=timedelta(hours=1), reference_time=now)
        result = rule.evaluate(records)
        assert result.score == pytest.approx(0.5, abs=0.05)


class TestRangeRule:
    def test_all_in_range(self) -> None:
        records = make_record_batch(count=10, base_value=50.0)
        rule = RangeRule(min_value=0.0, max_value=100.0)
        result = rule.evaluate(records)
        assert result.passed
        assert result.score == 1.0

    def test_some_out_of_range(self) -> None:
        records = make_record_batch(count=10, base_value=95.0)
        # Records go from 95.0 to 95.9 — set max at 95.5
        rule = RangeRule(min_value=0.0, max_value=95.5, threshold=0.9)
        result = rule.evaluate(records)
        assert result.score < 1.0

    def test_min_only(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        rule = RangeRule(min_value=0.0)
        result = rule.evaluate(records)
        assert result.passed

    def test_max_only(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        rule = RangeRule(max_value=100.0)
        result = rule.evaluate(records)
        assert result.passed

    def test_empty_records(self) -> None:
        rule = RangeRule(min_value=0.0, max_value=100.0)
        result = rule.evaluate([])
        assert not result.passed

    def test_no_numeric_records(self) -> None:
        records = [ContextualRecord(
            source=RecordSource(adapter_id="test", system="test"),
            timestamp=RecordTimestamp(source_time=datetime.now(timezone.utc)),
            value=RecordValue(raw="string_value", data_type="string"),
            lineage=RecordLineage(
                schema_ref="x", adapter_id="test", adapter_version="0.1.0",
            ),
        )]
        rule = RangeRule(min_value=0.0, max_value=100.0)
        result = rule.evaluate(records)
        assert result.passed  # no numeric records → vacuously true


class TestConsistencyRule:
    def test_consistent_records(self) -> None:
        records = make_record_batch(count=10)  # all have batch_id and lot_id
        rule = ConsistencyRule("batch_id", "lot_id")
        result = rule.evaluate(records)
        assert result.passed
        assert result.score == 1.0

    def test_inconsistent_records(self) -> None:
        records = make_record_batch(count=10)
        # Set batch_id but remove lot_id from half
        for i in range(5):
            records[i] = records[i].model_copy(update={
                "context": records[i].context.model_copy(update={"lot_id": None}),
            })
        rule = ConsistencyRule("batch_id", "lot_id", threshold=0.8)
        result = rule.evaluate(records)
        assert result.score == pytest.approx(0.5)
        assert not result.passed

    def test_no_applicable_records(self) -> None:
        records = make_record_batch(count=5)
        # Remove all batch_ids
        for i in range(5):
            records[i] = records[i].model_copy(update={
                "context": records[i].context.model_copy(update={"batch_id": None}),
            })
        rule = ConsistencyRule("batch_id", "lot_id")
        result = rule.evaluate(records)
        assert result.passed  # vacuously true

    def test_empty_records(self) -> None:
        rule = ConsistencyRule("batch_id", "lot_id")
        result = rule.evaluate([])
        assert not result.passed


class TestQualityReport:
    def test_all_passing(self) -> None:
        report = QualityReport(
            product_id="dp-test",
            record_count=10,
            results=[
                CompletenessRule(["equipment_id"]).evaluate(make_record_batch(10)),
                RangeRule(min_value=0.0, max_value=200.0).evaluate(make_record_batch(10)),
            ],
        )
        assert report.passed
        assert report.score > 0.9
        assert len(report.failing_rules) == 0

    def test_some_failing(self) -> None:
        report = QualityReport(
            product_id="dp-test",
            record_count=0,
            results=[
                CompletenessRule(["equipment_id"]).evaluate([]),  # fails
                RangeRule(min_value=0.0, max_value=200.0).evaluate(make_record_batch(10)),
            ],
        )
        assert not report.passed
        assert len(report.failing_rules) == 1

    def test_empty_report(self) -> None:
        report = QualityReport(product_id="dp-test")
        assert not report.passed
        assert report.score == 0.0


class TestQualityMonitor:
    def test_register_and_evaluate(self) -> None:
        monitor = QualityMonitor()
        monitor.register_rules("dp-1", [
            CompletenessRule(["equipment_id"]),
            RangeRule(min_value=0.0, max_value=200.0),
        ])
        records = make_record_batch(10)
        report = monitor.evaluate("dp-1", records)
        assert report.passed
        assert report.record_count == 10
        assert len(report.results) == 2

    def test_add_rule(self) -> None:
        monitor = QualityMonitor()
        monitor.add_rule("dp-1", CompletenessRule(["equipment_id"]))
        monitor.add_rule("dp-1", RangeRule(min_value=0.0, max_value=200.0))
        assert len(monitor.get_rules("dp-1")) == 2

    def test_evaluate_no_rules(self) -> None:
        monitor = QualityMonitor()
        records = make_record_batch(5)
        report = monitor.evaluate("dp-unknown", records)
        assert not report.passed
        assert len(report.results) == 0

    def test_multiple_products(self) -> None:
        monitor = QualityMonitor()
        monitor.register_rules("dp-1", [CompletenessRule(["equipment_id"])])
        monitor.register_rules("dp-2", [RangeRule(min_value=0.0, max_value=50.0)])
        records = make_record_batch(5, base_value=78.0)

        report1 = monitor.evaluate("dp-1", records)
        report2 = monitor.evaluate("dp-2", records)
        assert report1.passed
        assert not report2.passed  # 78+ > 50
