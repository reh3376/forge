"""The hub ingest pipeline: validate -> route -> persist.

``IngestPipeline.ingest`` takes a batch of ``ContextualRecord``s from one
adapter, rejects records that contradict the adapter's manifest, routes the
rest with :class:`forge.storage.router.DataRouter`, and writes each group to
the sink registered for its storage engine (falling back to an in-memory
sink so development stacks without databases still work).

Sinks are anything with ``async write_batch(records) -> int``; the
TimescaleDB and Neo4j writers in :mod:`forge.storage.engines` already have
that shape, so :func:`build_pipeline_from_storage` wires them directly.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Protocol

from forge.core.clock import ClockOffsetTracker, utc_now
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.storage.registry import SchemaRegistry, StorageEngine
from forge.storage.router import DataRouter

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from forge.core.models.adapter import AdapterManifest

logger = logging.getLogger(__name__)


class RecordSink(Protocol):
    """Anything that can persist a batch of records."""

    async def write_batch(self, records: list[ContextualRecord]) -> int:  # pragma: no cover
        """Write records; return how many were persisted."""
        ...


class InMemoryRecordSink:
    """Bounded ring buffer used when no storage engine is configured."""

    def __init__(self, max_records: int = 10_000) -> None:
        self._records: deque[ContextualRecord] = deque(maxlen=max_records)
        self.total_written = 0

    async def write_batch(self, records: list[ContextualRecord]) -> int:
        self._records.extend(records)
        self.total_written += len(records)
        return len(records)

    @property
    def records(self) -> list[ContextualRecord]:
        return list(self._records)

    def __len__(self) -> int:
        return len(self._records)

    def clear(self) -> None:
        self._records.clear()


@dataclass
class IngestOutcome:
    """Result of one ``IngestPipeline.ingest`` call."""

    received: int = 0
    accepted: int = 0
    rejected: int = 0
    persisted: int = 0
    failed: int = 0
    missing_context: int = 0
    errors: list[str] = field(default_factory=list)
    by_engine: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "received": self.received,
            "accepted": self.accepted,
            "rejected": self.rejected,
            "persisted": self.persisted,
            "failed": self.failed,
            "missing_context": self.missing_context,
            "errors": list(self.errors),
            "by_engine": dict(self.by_engine),
        }

    def summary(self) -> str:
        return (
            f"accepted={self.accepted} rejected={self.rejected} "
            f"persisted={self.persisted} failed={self.failed}"
        )


@dataclass
class IngestStats:
    """Cumulative counters for a pipeline (or one session)."""

    batches: int = 0
    received: int = 0
    accepted: int = 0
    rejected: int = 0
    persisted: int = 0
    failed: int = 0
    missing_context: int = 0
    by_engine: dict[str, int] = field(default_factory=dict)
    last_ingest_at: datetime | None = None
    last_error: str | None = None

    def add(self, outcome: IngestOutcome) -> None:
        self.batches += 1
        self.received += outcome.received
        self.accepted += outcome.accepted
        self.rejected += outcome.rejected
        self.persisted += outcome.persisted
        self.failed += outcome.failed
        self.missing_context += outcome.missing_context
        for engine, n in outcome.by_engine.items():
            self.by_engine[engine] = self.by_engine.get(engine, 0) + n
        self.last_ingest_at = datetime.now(UTC)
        if outcome.errors:
            self.last_error = outcome.errors[-1]

    def to_dict(self) -> dict[str, Any]:
        return {
            "batches": self.batches,
            "received": self.received,
            "accepted": self.accepted,
            "rejected": self.rejected,
            "persisted": self.persisted,
            "failed": self.failed,
            "missing_context": self.missing_context,
            "by_engine": dict(self.by_engine),
            "last_ingest_at": (self.last_ingest_at.isoformat() if self.last_ingest_at else None),
            "last_error": self.last_error,
        }


def _context_has(record: ContextualRecord, name: str) -> bool:
    ctx = record.context
    if ctx is None:
        return False
    if getattr(ctx, name, None):
        return True
    return bool(ctx.extra.get(name)) if ctx.extra else False


def stamp_receipt(record: ContextualRecord, received_at: datetime) -> None:
    """Stamp the hub's receipt on ``record`` (one clock, FB-087).

    ``ingestion_time`` becomes the hub's clock reading ``received_at``. The
    value the spoke sent there, if it sent one, moves to ``sent_time`` for the
    clock-offset measurement (FB-089); a record that arrived without a stamp
    keeps ``sent_time`` empty rather than inheriting the hub's own parse time.
    A record already stamped once (replay) keeps its first ``sent_time``.
    """
    ts = record.timestamp
    if ts.sent_time is None and "ingestion_time" in ts.model_fields_set:
        ts.sent_time = ts.ingestion_time
    ts.ingestion_time = received_at


class IngestPipeline:
    """Validate, route and persist records from registered adapters.

    The pipeline is the hub's receipt point for every path (gRPC push, pull,
    REST): each record is stamped with the hub clock on entry, see
    :func:`stamp_receipt`, and its timestamps feed the clock-offset
    measurement, see :class:`~forge.core.clock.ClockOffsetTracker` (FB-089).
    ``clock`` is the hub clock, ``utc_now`` unless a test or a hub-of-hubs link
    (FB-092) injects another; ``offsets`` is the tracker, one per pipeline by
    default.
    """

    def __init__(
        self,
        *,
        router: DataRouter | None = None,
        sinks: Mapping[StorageEngine, RecordSink] | None = None,
        fallback_sink: RecordSink | None = None,
        clock: Callable[[], datetime] | None = None,
        offsets: ClockOffsetTracker | None = None,
    ) -> None:
        self._clock: Callable[[], datetime] = clock or utc_now
        self.offsets: ClockOffsetTracker = offsets or ClockOffsetTracker()
        self._router = router or DataRouter(registry=SchemaRegistry())
        self._sinks: dict[StorageEngine, RecordSink] = dict(sinks or {})
        # `is not None`: an empty InMemoryRecordSink is falsy (it defines __len__).
        self._fallback: RecordSink = (
            fallback_sink if fallback_sink is not None else InMemoryRecordSink()
        )
        self.stats = IngestStats()

    # -- composition ---------------------------------------------------------

    @property
    def router(self) -> DataRouter:
        return self._router

    @property
    def fallback_sink(self) -> RecordSink:
        return self._fallback

    def sink_for(self, engine: StorageEngine) -> RecordSink:
        return self._sinks.get(engine, self._fallback)

    def set_sink(self, engine: StorageEngine, sink: RecordSink) -> None:
        self._sinks[engine] = sink

    def describe(self) -> dict[str, Any]:
        return {
            "sinks": {e.value: type(s).__name__ for e, s in self._sinks.items()},
            "fallback_sink": type(self._fallback).__name__,
            "stats": self.stats.to_dict(),
            "clock_offsets": self.offsets.describe(),
        }

    # -- validation ----------------------------------------------------------

    def validate(
        self,
        record: ContextualRecord,
        *,
        adapter_id: str | None = None,
        manifest: AdapterManifest | None = None,
    ) -> tuple[list[str], list[str]]:
        """Return ``(problems, missing_context_fields)`` for one record."""
        problems: list[str] = []
        if adapter_id and record.source.adapter_id != adapter_id:
            problems.append(
                f"record {record.record_id}: source.adapter_id "
                f"'{record.source.adapter_id}' != session adapter '{adapter_id}'"
            )
        missing: list[str] = []
        if manifest is not None:
            expected = manifest.data_contract.schema_ref
            if record.lineage.schema_ref != expected:
                problems.append(
                    f"record {record.record_id}: schema_ref "
                    f"'{record.lineage.schema_ref}' != manifest '{expected}'"
                )
            missing = [
                name
                for name in manifest.data_contract.context_fields
                if not _context_has(record, name)
            ]
        return problems, missing

    # -- ingestion -----------------------------------------------------------

    async def ingest(
        self,
        records: Iterable[ContextualRecord],
        *,
        adapter_id: str | None = None,
        manifest: AdapterManifest | None = None,
    ) -> IngestOutcome:
        outcome = IngestOutcome()
        accepted: list[ContextualRecord] = []
        received_at = self._clock()  # one stamp per batch: when the hub took delivery
        for record in records:
            outcome.received += 1
            stamp_receipt(record, received_at)
            self.offsets.observe_record(adapter_id or record.source.adapter_id, record.timestamp)
            problems, missing = self.validate(record, adapter_id=adapter_id, manifest=manifest)
            if problems:
                outcome.rejected += 1
                outcome.errors.extend(problems)
                continue
            if missing:
                outcome.missing_context += 1
            accepted.append(record)
        outcome.accepted = len(accepted)

        if accepted:
            grouped = self._router.route_batch(accepted)
            for engine, pairs in grouped.items():
                batch = [rec for rec, _decision in pairs]
                sink = self.sink_for(engine)
                try:
                    written = await sink.write_batch(batch)
                except Exception as exc:
                    logger.exception("Sink %s failed for %d records", engine.value, len(batch))
                    written = 0
                    outcome.errors.append(f"{engine.value}: {exc}")
                outcome.persisted += written
                outcome.failed += len(batch) - written
                outcome.by_engine[engine.value] = outcome.by_engine.get(engine.value, 0) + written

        self.stats.add(outcome)
        if outcome.rejected or outcome.failed:
            logger.warning("Ingest from %s: %s", adapter_id or "unknown", outcome.summary())
        else:
            logger.debug("Ingest from %s: %s", adapter_id or "unknown", outcome.summary())
        return outcome

    # -- REST helper ---------------------------------------------------------

    @staticmethod
    def coerce(
        raw: dict[str, Any], *, adapter_id: str, manifest: AdapterManifest
    ) -> ContextualRecord:
        """Turn a REST payload into a ContextualRecord.

        Accepts a full ContextualRecord (Pydantic JSON or proto-shaped dict)
        or a bare ``{"tag": ..., "value": ...}`` reading, which is wrapped
        with the adapter's identity and schema reference.
        """
        if "source" in raw and "value" in raw and isinstance(raw.get("value"), dict):
            try:
                return ContextualRecord.model_validate(raw)
            except Exception:
                from forge.transport.serialization import proto_to_pydantic

                return proto_to_pydantic(raw, "ContextualRecord")

        value = raw.get("value", raw)
        data_type = {bool: "bool", int: "int64", float: "float64", str: "string"}.get(
            type(value), "object"
        )
        tag = raw.get("tag") or raw.get("tag_path")
        now = datetime.now(UTC)
        source_time = raw.get("timestamp") or raw.get("source_time")
        if isinstance(source_time, str):
            try:
                source_time = datetime.fromisoformat(source_time.replace("Z", "+00:00"))
            except ValueError:
                source_time = None
        return ContextualRecord(
            source=RecordSource(adapter_id=adapter_id, system=adapter_id, tag_path=tag),
            # no ingestion_time: the client sent none, the hub stamps receipt in ingest()
            timestamp=RecordTimestamp(
                source_time=source_time if isinstance(source_time, datetime) else now,
            ),
            value=RecordValue(
                raw=value,
                engineering_units=raw.get("engineering_units") or raw.get("units"),
                quality=QualityCode(raw["quality"]) if raw.get("quality") else QualityCode.GOOD,
                data_type=data_type,
            ),
            lineage=RecordLineage(
                schema_ref=manifest.data_contract.schema_ref,
                adapter_id=adapter_id,
                adapter_version=manifest.version,
                transformation_chain=["rest:wrap"],
            ),
        )


def build_pipeline_from_storage(storage_factory: Any) -> IngestPipeline:
    """Wire the pipeline to whatever engines the StorageFactory has pools for.

    * TimescaleDB -> ``forge_ts.contextual_records`` (TimescaleRecordWriter).
      PostgreSQL-routed records use the same hypertable: there is no separate
      relational record table, and the hypertable is the canonical landing
      zone for ContextualRecords.
    * Neo4j -> Neo4jGraphWriter.
    * Anything else (Kafka, Redis) -> in-memory fallback until a writer exists.
    """
    sinks: dict[StorageEngine, RecordSink] = {}
    ts_writer = storage_factory.timescale_writer()
    if ts_writer is not None:
        sinks[StorageEngine.TIMESCALEDB] = ts_writer
        sinks[StorageEngine.POSTGRESQL] = ts_writer
    graph_writer = storage_factory.graph_writer()
    if graph_writer is not None:
        sinks[StorageEngine.NEO4J] = graph_writer
    pipeline = IngestPipeline(sinks=sinks)
    logger.info("Ingest pipeline sinks: %s", pipeline.describe()["sinks"] or "in-memory only")
    return pipeline
