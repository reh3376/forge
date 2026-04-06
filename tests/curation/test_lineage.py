"""Tests for the lineage tracker."""

from __future__ import annotations

from uuid import uuid4

from forge.curation.lineage import (
    InMemoryLineageStore,
    LineageEntry,
    LineageTracker,
    TransformationStep,
)


class TestTransformationStep:
    def test_create(self) -> None:
        step = TransformationStep(
            step_name="normalize",
            component="NormalizationStep",
            description="Unit conversion °F → °C",
        )
        assert step.step_name == "normalize"
        assert step.timestamp is not None

    def test_with_parameters(self) -> None:
        step = TransformationStep(
            step_name="time_bucket",
            component="TimeBucketStep",
            parameters={"window": "5min"},
        )
        assert step.parameters["window"] == "5min"


class TestInMemoryLineageStore:
    def test_save_and_get(self) -> None:
        store = InMemoryLineageStore()
        entry = LineageEntry(
            source_record_ids=["r1", "r2"],
            output_record_id="out-1",
            product_id="dp-1",
        )
        store.save(entry)
        assert store.get(entry.lineage_id) is not None

    def test_get_by_output(self) -> None:
        store = InMemoryLineageStore()
        entry = LineageEntry(output_record_id="out-1", product_id="dp-1")
        store.save(entry)
        results = store.get_by_output("out-1")
        assert len(results) == 1

    def test_get_by_source(self) -> None:
        store = InMemoryLineageStore()
        entry = LineageEntry(
            source_record_ids=["src-1", "src-2"],
            output_record_id="out-1",
        )
        store.save(entry)
        assert len(store.get_by_source("src-1")) == 1
        assert len(store.get_by_source("src-3")) == 0

    def test_get_by_product(self) -> None:
        store = InMemoryLineageStore()
        for i in range(3):
            store.save(LineageEntry(
                output_record_id=f"out-{i}",
                product_id="dp-1",
            ))
        store.save(LineageEntry(output_record_id="out-other", product_id="dp-2"))
        assert len(store.get_by_product("dp-1")) == 3
        assert len(store.get_by_product("dp-2")) == 1

    def test_list_all(self) -> None:
        store = InMemoryLineageStore()
        for i in range(5):
            store.save(LineageEntry(output_record_id=f"out-{i}"))
        assert len(store.list_all()) == 5


class TestLineageTracker:
    def test_start_entry(self, lineage_tracker: LineageTracker) -> None:
        entry = lineage_tracker.start_entry(
            source_record_ids=[uuid4(), uuid4()],
            adapter_ids=["whk-wms"],
        )
        assert len(entry.source_record_ids) == 2
        assert entry.adapter_ids == ["whk-wms"]

    def test_add_step(self, lineage_tracker: LineageTracker) -> None:
        entry = lineage_tracker.start_entry(["r1"])
        lineage_tracker.add_step(entry, "normalize", "NormalizationStep")
        lineage_tracker.add_step(entry, "aggregate_avg", "AggregationStep")
        assert len(entry.steps) == 2
        assert entry.steps[0].step_name == "normalize"

    def test_complete_entry(self, lineage_tracker: LineageTracker) -> None:
        entry = lineage_tracker.start_entry(["r1"])
        lineage_tracker.add_step(entry, "normalize", "NormalizationStep")
        lineage_tracker.complete_entry(
            entry, output_record_id="out-1", product_id="dp-test",
        )
        assert entry.output_record_id == "out-1"
        assert entry.product_id == "dp-test"

        # Should be persisted
        results = lineage_tracker.get_lineage("out-1")
        assert len(results) == 1

    def test_get_downstream(self, lineage_tracker: LineageTracker) -> None:
        entry = lineage_tracker.start_entry(["src-1", "src-2"])
        lineage_tracker.complete_entry(
            entry, output_record_id="out-1", product_id="dp-1",
        )
        downstream = lineage_tracker.get_downstream("src-1")
        assert len(downstream) == 1
        assert downstream[0].output_record_id == "out-1"

    def test_get_product_lineage(self, lineage_tracker: LineageTracker) -> None:
        for i in range(3):
            entry = lineage_tracker.start_entry([f"src-{i}"])
            lineage_tracker.complete_entry(
                entry, output_record_id=f"out-{i}", product_id="dp-x",
            )
        results = lineage_tracker.get_product_lineage("dp-x")
        assert len(results) == 3

    def test_full_lifecycle(self, lineage_tracker: LineageTracker) -> None:
        # Simulate a full curation lifecycle
        entry = lineage_tracker.start_entry(
            source_record_ids=["rec-001", "rec-002", "rec-003"],
            adapter_ids=["whk-wms", "whk-mes"],
        )
        lineage_tracker.add_step(
            entry, "normalize", "NormalizationStep",
            description="°F → °C conversion",
            parameters={"from": "°F", "to": "°C"},
        )
        lineage_tracker.add_step(
            entry, "time_bucket_5min", "TimeBucketStep",
            parameters={"window": "5min"},
        )
        lineage_tracker.add_step(
            entry, "aggregate_avg", "AggregationStep",
            parameters={"function": "AVG"},
        )
        lineage_tracker.complete_entry(
            entry,
            output_record_id="curated-001",
            product_id="dp-production-context",
        )

        # Verify full chain
        results = lineage_tracker.get_lineage("curated-001")
        assert len(results) == 1
        lineage = results[0]
        assert len(lineage.source_record_ids) == 3
        assert len(lineage.steps) == 3
        assert lineage.steps[0].step_name == "normalize"
        assert lineage.steps[1].step_name == "time_bucket_5min"
        assert lineage.steps[2].step_name == "aggregate_avg"
        assert lineage.adapter_ids == ["whk-wms", "whk-mes"]
