"""Tests for the aggregation engine."""

from __future__ import annotations

from datetime import timedelta

import pytest
from tests.curation.conftest import make_record_batch

from forge.curation.aggregation import (
    AggregationFunction,
    AggregationSpec,
    aggregate_records,
)


class TestAggregationFunctions:
    def test_avg(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.AVG],
        )
        results = aggregate_records(records, spec)
        assert len(results) == 1
        # avg of 10.0, 10.1, 10.2, 10.3, 10.4 = 10.2
        assert results[0].value.raw == pytest.approx(10.2)

    def test_min_max(self) -> None:
        records = make_record_batch(count=10, base_value=100.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.MIN, AggregationFunction.MAX],
        )
        results = aggregate_records(records, spec)
        assert len(results) == 2
        values = sorted(r.value.raw for r in results)
        assert values[0] == pytest.approx(100.0)
        assert values[1] == pytest.approx(100.9)

    def test_sum(self) -> None:
        records = make_record_batch(count=3, base_value=10.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.SUM],
        )
        results = aggregate_records(records, spec)
        assert len(results) == 1
        assert results[0].value.raw == pytest.approx(30.3)  # 10.0 + 10.1 + 10.2

    def test_count(self) -> None:
        records = make_record_batch(count=7, base_value=1.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.COUNT],
        )
        results = aggregate_records(records, spec)
        assert len(results) == 1
        assert results[0].value.raw == pytest.approx(7.0)

    def test_first_last(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.FIRST, AggregationFunction.LAST],
        )
        results = aggregate_records(records, spec)
        values = {r.source.tag_path.split("/")[-1]: r.value.raw for r in results}
        assert values["first"] == pytest.approx(10.0)
        assert values["last"] == pytest.approx(10.4)

    def test_median(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.MEDIAN],
        )
        results = aggregate_records(records, spec)
        assert results[0].value.raw == pytest.approx(10.2)

    def test_stddev(self) -> None:
        records = make_record_batch(count=5, base_value=10.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.STDDEV],
        )
        results = aggregate_records(records, spec)
        assert results[0].value.raw > 0  # should be non-zero


class TestAggregationGrouping:
    def test_multiple_time_buckets(self) -> None:
        # 15 records at 1min intervals → 3 five-minute buckets
        records = make_record_batch(count=15, base_value=10.0, interval=timedelta(minutes=1))
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="5min",
            functions=[AggregationFunction.AVG],
        )
        results = aggregate_records(records, spec)
        assert len(results) == 3

    def test_multiple_equipment(self) -> None:
        records_a = make_record_batch(count=5, equipment_id="FERM-001", base_value=70.0)
        records_b = make_record_batch(count=5, equipment_id="FERM-002", base_value=80.0)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.AVG],
        )
        results = aggregate_records(records_a + records_b, spec)
        assert len(results) == 2

    def test_empty_records(self) -> None:
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="5min",
            functions=[AggregationFunction.AVG],
        )
        results = aggregate_records([], spec)
        assert len(results) == 0


class TestAggregationLineage:
    def test_output_has_lineage(self) -> None:
        records = make_record_batch(count=5)
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="5min",
            functions=[AggregationFunction.AVG],
            product_id="dp-test",
        )
        results = aggregate_records(records, spec)
        assert len(results) == 1
        lineage = results[0].lineage
        assert lineage.adapter_id == "forge-curation"
        assert "aggregate_avg" in lineage.transformation_chain
        assert "dp-test" in lineage.schema_ref

    def test_output_preserves_source_adapter(self) -> None:
        records = make_record_batch(count=5, adapter="whk-wms")
        spec = AggregationSpec(
            group_by=["equipment_id"],
            time_window="1hr",
            functions=[AggregationFunction.AVG],
        )
        results = aggregate_records(records, spec)
        assert results[0].source.adapter_id == "whk-wms"
