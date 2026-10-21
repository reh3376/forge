"""IngestPipeline: validate -> route -> persist."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

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
from forge.ingest.pipeline import IngestPipeline, InMemoryRecordSink
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
