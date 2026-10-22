"""IngestPipeline: validate -> route -> persist."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from forge.core.clock import SERVER_LINK, SOURCE_LINK, SPOKE_LINK, ClockOffsetTracker
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    AdapterTier,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.ingest.pipeline import IngestPipeline, IngestStats, InMemoryRecordSink
from forge.storage.registry import StorageEngine

SCHEMA_REF = "forge://schemas/forge-mes/v0.1.0"


def make_manifest(adapter_id: str = "forge-mes") -> AdapterManifest:
    return AdapterManifest(
        adapter_id=adapter_id,
        name="Forge MES",
        version="0.1.0",
        protocol="grpc",
        tier=AdapterTier.MES_MOM,
        capabilities=AdapterCapabilities(read=True, write=True, subscribe=True),
        data_contract=DataContract(
            schema_ref=SCHEMA_REF,
            context_fields=["batch_id", "event_type"],
        ),
    )


def make_record(
    *,
    adapter_id: str = "forge-mes",
    schema_ref: str = SCHEMA_REF,
    data_type: str = "object",
    batch_id: str | None = "B-1",
    entity_type: str | None = "StepExecution",
    event_type: str | None = "step.started",
) -> ContextualRecord:
    extra = {k: v for k, v in {"entity_type": entity_type, "event_type": event_type}.items() if v}
    return ContextualRecord(
        source=RecordSource(adapter_id=adapter_id, system="forge-mes", tag_path="mes.backend.x"),
        timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, 12, tzinfo=UTC)),
        value=RecordValue(raw={"id": "x"}, quality=QualityCode.GOOD, data_type=data_type),
        context=RecordContext(batch_id=batch_id, extra=extra),
        lineage=RecordLineage(
            schema_ref=schema_ref, adapter_id=adapter_id, adapter_version="0.1.0"
        ),
    )


class FailingSink:
    async def write_batch(self, records):
        raise RuntimeError("disk on fire")


class PartialSink:
    def __init__(self) -> None:
        self.calls: list[int] = []

    async def write_batch(self, records):
        self.calls.append(len(records))
        return max(len(records) - 1, 0)


@pytest.mark.asyncio
async def test_accepts_routes_and_persists_to_fallback() -> None:
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink)
    manifest = make_manifest()
    outcome = await pipeline.ingest(
        [make_record(), make_record(batch_id=None)], adapter_id="forge-mes", manifest=manifest
    )
    assert outcome.received == 2
    assert outcome.accepted == 2
    assert outcome.persisted == 2
    assert outcome.rejected == 0 and outcome.failed == 0
    assert outcome.missing_context == 1  # second record lacks batch_id
    # "object" has no default route -> PostgreSQL -> fallback sink
    assert outcome.by_engine == {StorageEngine.POSTGRESQL.value: 2}
    assert len(sink) == 2
    assert pipeline.stats.batches == 1 and pipeline.stats.persisted == 2


@pytest.mark.asyncio
async def test_rejects_schema_ref_and_adapter_mismatch() -> None:
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink)
    outcome = await pipeline.ingest(
        [
            make_record(schema_ref="forge://schemas/other/v1"),
            make_record(adapter_id="someone-else"),
            make_record(),
        ],
        adapter_id="forge-mes",
        manifest=make_manifest(),
    )
    assert outcome.accepted == 1 and outcome.rejected == 2
    assert len(outcome.errors) == 2
    assert any("schema_ref" in e for e in outcome.errors)
    assert any("adapter_id" in e for e in outcome.errors)
    assert len(sink) == 1
    assert pipeline.stats.last_error is not None


@pytest.mark.asyncio
async def test_routes_time_series_to_the_timescale_sink() -> None:
    ts_sink = InMemoryRecordSink()
    fallback = InMemoryRecordSink()
    pipeline = IngestPipeline(sinks={StorageEngine.TIMESCALEDB: ts_sink}, fallback_sink=fallback)
    outcome = await pipeline.ingest(
        [make_record(data_type="sensor_reading"), make_record(data_type="object")]
    )
    assert outcome.by_engine == {"timescaledb": 1, "postgresql": 1}
    assert len(ts_sink) == 1 and len(fallback) == 1
    assert pipeline.describe()["sinks"] == {"timescaledb": "InMemoryRecordSink"}


@pytest.mark.asyncio
async def test_sink_failures_are_counted_not_raised() -> None:
    pipeline = IngestPipeline(fallback_sink=FailingSink())
    outcome = await pipeline.ingest([make_record(), make_record()])
    assert outcome.accepted == 2
    assert outcome.persisted == 0 and outcome.failed == 2
    assert outcome.errors and "disk on fire" in outcome.errors[0]

    partial = PartialSink()
    pipeline = IngestPipeline(fallback_sink=partial)
    outcome = await pipeline.ingest([make_record(), make_record(), make_record()])
    assert outcome.persisted == 2 and outcome.failed == 1
    assert partial.calls == [3]


@pytest.mark.asyncio
async def test_empty_batch_is_a_noop() -> None:
    pipeline = IngestPipeline()
    outcome = await pipeline.ingest([])
    assert outcome.to_dict()["received"] == 0
    assert pipeline.stats.batches == 1


def test_coerce_rejects_offset_less_timestamp() -> None:
    """A REST reading whose timestamp carries no offset names no instant; it is refused (FB-014)."""
    with pytest.raises(ValidationError, match="source_time must be timezone-aware"):
        IngestPipeline.coerce(
            {"tag": "temp", "value": 72.5, "timestamp": "2026-06-01T12:00:00"},
            adapter_id="forge-mes",
            manifest=make_manifest(),
        )


def test_coerce_wraps_raw_readings_and_accepts_full_records() -> None:
    manifest = make_manifest()
    wrapped = IngestPipeline.coerce(
        {"tag": "temp", "value": 72.5, "units": "°F", "timestamp": "2026-06-01T12:00:00Z"},
        adapter_id="forge-mes",
        manifest=manifest,
    )
    assert wrapped.source.adapter_id == "forge-mes"
    assert wrapped.source.tag_path == "temp"
    assert wrapped.value.raw == 72.5 and wrapped.value.data_type == "float64"
    assert wrapped.value.engineering_units == "°F"
    assert wrapped.timestamp.source_time == datetime(2026, 6, 1, 12, tzinfo=UTC)
    assert wrapped.lineage.schema_ref == SCHEMA_REF
    assert wrapped.lineage.transformation_chain == ["rest:wrap"]

    full = make_record().model_dump(mode="json")
    parsed = IngestPipeline.coerce(full, adapter_id="forge-mes", manifest=manifest)
    assert str(parsed.record_id) == full["record_id"]
    assert parsed.context.batch_id == "B-1"

    bare = IngestPipeline.coerce({"anything": 1}, adapter_id="forge-mes", manifest=manifest)
    assert bare.value.raw == {"anything": 1} and bare.value.data_type == "object"


def test_in_memory_sink_is_bounded() -> None:
    sink = InMemoryRecordSink(max_records=2)
    import asyncio

    asyncio.run(sink.write_batch([make_record(), make_record(), make_record()]))
    assert len(sink) == 2 and sink.total_written == 3
    sink.clear()
    assert len(sink) == 0


# ── Hub receipt stamp (one clock, FB-087) ───────────────────────────

HUB_NOW = datetime(2026, 6, 1, 12, 0, 5, tzinfo=UTC)
SPOKE_NOW = datetime(2026, 6, 1, 12, 0, 2, tzinfo=UTC)


def _spoke_record() -> ContextualRecord:
    """A record as a spoke builds it: ingestion_time stamped on the spoke's clock."""
    record = make_record()
    record.timestamp = RecordTimestamp(
        source_time=record.timestamp.source_time, ingestion_time=SPOKE_NOW
    )
    return record


async def test_ingest_stamps_receipt_with_the_hub_clock() -> None:
    sink = InMemoryRecordSink()
    pipeline = IngestPipeline(fallback_sink=sink, clock=lambda: HUB_NOW)
    await pipeline.ingest([_spoke_record()], adapter_id="forge-mes", manifest=make_manifest())
    ts = sink.records[0].timestamp
    assert ts.ingestion_time == HUB_NOW
    assert ts.sent_time == SPOKE_NOW


async def test_ingest_shares_one_receipt_stamp_per_batch() -> None:
    ticks = iter([HUB_NOW, HUB_NOW + timedelta(seconds=30)])
    pipeline = IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: next(ticks))
    records = [_spoke_record(), _spoke_record()]
    await pipeline.ingest(records, adapter_id="forge-mes", manifest=make_manifest())
    assert {r.timestamp.ingestion_time for r in records} == {HUB_NOW}


async def test_record_without_a_spoke_stamp_keeps_sent_time_empty() -> None:
    pipeline = IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: HUB_NOW)
    record = make_record()  # ingestion_time left to its default: the spoke sent none
    await pipeline.ingest([record], adapter_id="forge-mes", manifest=make_manifest())
    assert record.timestamp.ingestion_time == HUB_NOW
    assert record.timestamp.sent_time is None


async def test_replay_keeps_the_first_sent_time() -> None:
    later = HUB_NOW + timedelta(minutes=1)
    ticks = iter([HUB_NOW, later])
    pipeline = IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: next(ticks))
    record = _spoke_record()
    await pipeline.ingest([record], adapter_id="forge-mes", manifest=make_manifest())
    await pipeline.ingest([record], adapter_id="forge-mes", manifest=make_manifest())
    assert record.timestamp.sent_time == SPOKE_NOW
    assert record.timestamp.ingestion_time == later


def test_coerce_leaves_the_hub_stamp_to_ingest() -> None:
    wrapped = IngestPipeline.coerce(
        {"tag": "t", "value": 1}, adapter_id="forge-mes", manifest=make_manifest()
    )
    assert "ingestion_time" not in wrapped.timestamp.model_fields_set
    assert wrapped.timestamp.sent_time is None


# ── Clock-offset measurement (one clock, FB-089) ─────────────────────


async def test_ingest_measures_clock_offsets_per_link(caplog: pytest.LogCaptureFixture) -> None:
    pipeline = IngestPipeline(
        fallback_sink=InMemoryRecordSink(),
        clock=lambda: HUB_NOW,
        offsets=ClockOffsetTracker(tolerance_seconds=0.5),
    )
    record = make_record()
    record.timestamp = RecordTimestamp(
        source_time=HUB_NOW - timedelta(seconds=4),
        server_time=HUB_NOW - timedelta(seconds=1),
        ingestion_time=SPOKE_NOW,  # the spoke's clock: 3 s behind the hub at send
    )
    with caplog.at_level(logging.WARNING, logger="forge.core.clock"):
        await pipeline.ingest([record], adapter_id="forge-mes", manifest=make_manifest())
    stats = pipeline.offsets.stats("forge-mes")
    assert stats[SPOKE_LINK].last_seconds == -3.0 and not stats[SPOKE_LINK].within_tolerance
    assert stats[SERVER_LINK].last_seconds == -1.0 and not stats[SERVER_LINK].within_tolerance
    assert stats[SOURCE_LINK].last_seconds == -3.0
    assert all(s.measured_at == HUB_NOW for s in stats.values())
    assert caplog.text.count("out of tolerance") == 3
    described = pipeline.describe()["clock_offsets"]
    assert described["breaches"] == 3 and described["tolerance_seconds"] == 0.5
    assert set(described["adapters"]["forge-mes"]) == {SPOKE_LINK, SERVER_LINK, SOURCE_LINK}


async def test_ingest_keys_offsets_by_the_record_adapter_when_unnamed() -> None:
    pipeline = IngestPipeline(fallback_sink=InMemoryRecordSink(), clock=lambda: HUB_NOW)
    await pipeline.ingest([_spoke_record()])  # no adapter_id: the record names its source
    assert pipeline.offsets.adapters() == ["forge-mes"]
    assert pipeline.offsets.stats("forge-mes")[SPOKE_LINK].last_seconds == -3.0


class TestCurationOnIngest:
    """After a batch is persisted, the products fed by its adapter are curated (FB-009)."""

    @staticmethod
    def _engine(**spec):
        from forge.core.models.data_product import CurationSpec
        from forge.curation.engine import CurationEngine

        engine = CurationEngine()
        product = engine.registry.create(
            name="MES steps",
            description="...",
            owner="o",
            schema_ref="forge://schemas/curation/Steps/v1",
            source_adapters=["forge-mes"],
            curation=CurationSpec(functions=["COUNT"], **spec),
        )
        engine.registry.publish(product.product_id)
        return engine, product

    @staticmethod
    def _numeric(adapter_id: str = "forge-mes") -> ContextualRecord:
        record = make_record(adapter_id=adapter_id, data_type="float64")
        record.value.raw = 3.5
        record.context.equipment_id = "LINE-1"
        return record

    @pytest.mark.asyncio
    async def test_curated_records_land_in_the_pipeline_sinks(self):
        engine, product = self._engine()
        sink = InMemoryRecordSink()
        pipeline = IngestPipeline(fallback_sink=sink, curation=engine)
        engine.persist = pipeline.persist

        outcome = await pipeline.ingest([self._numeric(), self._numeric()], adapter_id="forge-mes")
        assert outcome.accepted == 2 and outcome.persisted == 2
        assert outcome.curated == {product.product_id: 1} and outcome.curation_errors == []
        assert outcome.to_dict()["curated"] == {product.product_id: 1}
        curated = engine.curated(product.product_id)
        assert len(curated) == 1 and curated[0].value.raw == 2  # COUNT of the bucket
        # the raw records and the curated one are both in the store
        assert len(sink) == 3 and sink.records[-1].lineage.adapter_id == "forge-curation"
        assert pipeline.describe()["curation"]["runs"] == 1

    @pytest.mark.asyncio
    async def test_other_adapters_and_rejected_batches_curate_nothing(self):
        engine, _product = self._engine()
        pipeline = IngestPipeline(curation=engine)
        outcome = await pipeline.ingest([self._numeric("whk-wms")], adapter_id="whk-wms")
        assert outcome.accepted == 1 and outcome.curated == {}
        rejected = await pipeline.ingest([self._numeric("whk-wms")], adapter_id="forge-mes")
        assert rejected.accepted == 0 and rejected.curated == {}

    @pytest.mark.asyncio
    async def test_a_curation_failure_never_fails_the_ingest(self):
        engine, product = self._engine(time_window="7min")
        pipeline = IngestPipeline(curation=engine)
        outcome = await pipeline.ingest([self._numeric()], adapter_id="forge-mes")
        assert outcome.accepted == 1 and outcome.persisted == 1 and outcome.errors == []
        assert outcome.curated == {}
        assert (
            len(outcome.curation_errors) == 1 and product.product_id in outcome.curation_errors[0]
        )

    @pytest.mark.asyncio
    async def test_persist_writes_hub_born_records_without_receipt(self):
        sink = InMemoryRecordSink()
        pipeline = IngestPipeline(fallback_sink=sink)
        record = self._numeric()
        before = record.timestamp.ingestion_time
        assert await pipeline.persist([record]) == 1
        assert await pipeline.persist([]) == 0
        assert sink.records[0].timestamp.ingestion_time == before
        # hub-born records are not ingest traffic: the stats stay untouched
        assert pipeline.stats.to_dict() == IngestStats().to_dict()
