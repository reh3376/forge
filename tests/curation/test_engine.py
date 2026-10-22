"""The curation engine: one pipeline per data product, run on demand or on ingest (FB-009)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.core.models.data_product import CurationSpec
from forge.curation.engine import CurationEngine, validate_spec
from forge.curation.registry import DataProductRegistry

T0 = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)


def _record(
    adapter_id: str = "whk-wms", equipment_id: str = "FERM-01", raw: float = 70.0, minute: int = 0
) -> ContextualRecord:
    return ContextualRecord(
        source=RecordSource(adapter_id=adapter_id, system=adapter_id, tag_path="Temp"),
        timestamp=RecordTimestamp(source_time=T0 + timedelta(minutes=minute)),
        value=RecordValue(raw=raw, engineering_units="°F", quality=QualityCode.GOOD),
        context=RecordContext(equipment_id=equipment_id),
        lineage=RecordLineage(
            schema_ref=f"forge://schemas/{adapter_id}/v0.1.0",
            adapter_id=adapter_id,
            adapter_version="0.1.0",
        ),
    )


def _batch() -> list[ContextualRecord]:
    return [
        _record(raw=70.0),
        _record(raw=74.0, minute=1),
        _record(equipment_id="FERM-02", raw=1.0),
    ]


def _engine(**kwargs) -> CurationEngine:
    return CurationEngine(DataProductRegistry(), **kwargs)


def _product(engine: CurationEngine, *, adapters=("whk-wms",), publish=True, **spec):
    product = engine.registry.create(
        name="Fermentation",
        description="...",
        owner="reh3376",
        schema_ref="forge://schemas/curation/Fermentation/v1",
        source_adapters=list(adapters),
        curation=CurationSpec(**spec) if spec else None,
    )
    if publish:
        engine.registry.publish(product.product_id)
    return product


class TestSpec:
    def test_default_spec_is_the_fixed_pipeline_of_before(self):
        spec = CurationSpec()
        assert (
            spec.normalize,
            spec.time_window,
            spec.group_by,
            spec.functions,
            spec.on_ingest,
        ) == (
            True,
            "5min",
            ["equipment_id"],
            ["AVG"],
            True,
        )
        validate_spec(spec)

    @pytest.mark.parametrize(
        ("spec", "message"),
        [
            ({"time_window": "7min"}, "unknown time_window"),
            ({"functions": ["AVG", "MODE"]}, "unknown aggregation function"),
            ({"functions": []}, "at least one aggregation function"),
            ({"group_by": []}, "at least one context field"),
        ],
    )
    def test_rejects_what_forge_cannot_run(self, spec, message):
        with pytest.raises(ValueError, match=message):
            validate_spec(CurationSpec(**spec))

    def test_functions_are_case_insensitive(self):
        validate_spec(CurationSpec(functions=["max", "Min"]))


class TestBuildPipeline:
    def test_builds_the_product_spec(self):
        engine = _engine()
        product = _product(engine, normalize=False, time_window="1hr", functions=["max", "COUNT"])
        names = [step.name for step in engine.build_pipeline(product).steps]
        assert names == ["time_bucket_1hr", "aggregate_max_count"]

    def test_default_spec_normalises_buckets_and_averages(self):
        engine = _engine()
        names = [step.name for step in engine.build_pipeline(_product(engine)).steps]
        assert names == ["normalize", "time_bucket_5min", "aggregate_avg"]

    def test_bad_spec_is_a_value_error(self):
        engine = _engine()
        product = _product(engine, time_window="7min")
        with pytest.raises(ValueError, match="unknown time_window"):
            engine.build_pipeline(product)


class TestCurate:
    @pytest.mark.asyncio
    async def test_runs_the_products_pipeline_and_keeps_the_outputs(self):
        persisted: list[list[ContextualRecord]] = []

        async def persist(records):
            persisted.append(records)
            return len(records)

        engine = _engine(persist=persist)
        product = _product(engine, functions=["MAX"], normalize=False)  # keep °F
        result = await engine.curate(product.product_id, _batch())
        assert result.input_count == 3 and result.output_count == 2  # one bucket per equipment
        assert {r.value.raw for r in result.output_records} == {74.0, 1.0}
        assert all(r.source.tag_path.endswith("/max") for r in result.output_records)
        assert engine.curated(product.product_id) == result.output_records
        assert persisted == [result.output_records]
        assert engine.describe()["runs"] == 1 and engine.describe()["persisted"] == 2

    @pytest.mark.asyncio
    async def test_window_of_curated_records_is_bounded(self):
        engine = _engine(keep=3)
        product = _product(engine)
        for _ in range(4):
            await engine.curate(product.product_id, _batch())
        assert len(engine.curated(product.product_id)) == 3
        assert len(engine.curated(product.product_id, limit=2)) == 2

    @pytest.mark.asyncio
    async def test_unknown_product(self):
        with pytest.raises(KeyError):
            await _engine().curate("dp-nope", _batch())


class TestOnIngest:
    @pytest.mark.asyncio
    async def test_only_published_products_fed_by_the_adapter_run(self):
        engine = _engine()
        fed = _product(engine)
        _product(engine, publish=False)  # a draft is not in service
        _product(engine, adapters=("forge-mes",))  # another spoke
        _product(engine, on_ingest=False)  # manual only
        assert [p.product_id for p in engine.products_for("whk-wms")] == [fed.product_id]

        curated, errors = await engine.on_ingested("whk-wms", _batch())
        assert curated == {fed.product_id: 2} and errors == []
        assert engine.curated(fed.product_id)
        assert await engine.on_ingested("whk-wms", []) == ({}, [])

    @pytest.mark.asyncio
    async def test_a_failing_product_does_not_stop_the_others(self, caplog):
        engine = _engine()
        broken = _product(engine, time_window="7min")
        fine = _product(engine)
        curated, errors = await engine.on_ingested("whk-wms", _batch())
        assert curated == {fine.product_id: 2}
        assert len(errors) == 1 and errors[0].startswith(broken.product_id)
        assert "unknown time_window" in errors[0]
        assert f"Curation of {broken.product_id} for whk-wms failed" in caplog.text
