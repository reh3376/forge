"""Shadow Writer — Phase B enabler for Forge DB Orchestration.

The Shadow Writer intercepts ContextualRecord streams from adapters and
persists them to Forge's storage engines. It operates in parallel with
existing spoke databases (which remain authoritative during Phase B).

Key responsibilities:
    - Receive ContextualRecords from adapter collect() output
    - Route each record to the appropriate storage engine via DataRouter
    - Persist records to Forge Core DB (shadow copy)
    - Track write metrics (counts, errors, latency)
    - Validate consistency between spoke source and Forge shadow
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.core.models.contextual_record import ContextualRecord
from forge.storage.pool import PoolManager
from forge.storage.registry import StorageEngine
from forge.storage.router import DataRouter, RoutingDecision

logger = logging.getLogger(__name__)


@dataclass
class WriteResult:
    """Result of a shadow write operation."""

    record_id: str
    engine: StorageEngine
    namespace: str
    success: bool
    written_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    error: str | None = None
    latency_ms: float = 0.0


@dataclass
class ShadowWriterMetrics:
    """Aggregate metrics for shadow write operations."""

    records_written: int = 0
    records_failed: int = 0
    records_skipped: int = 0
    by_engine: dict[str, int] = field(default_factory=dict)
    by_spoke: dict[str, int] = field(default_factory=dict)
    last_write_at: datetime | None = None
    errors: list[str] = field(default_factory=list)

    @property
    def total_processed(self) -> int:
        return self.records_written + self.records_failed + self.records_skipped

    @property
    def success_rate(self) -> float:
        total = self.records_written + self.records_failed
        if total == 0:
            return 1.0
        return self.records_written / total


@dataclass
class ShadowWriter:
    """Persists ContextualRecords to Forge storage engines.

    Phase 1 (current): In-memory buffer with metrics tracking.
    Phase 2: asyncpg/neo4j/redis persistence with consistency checks.

    Usage::

        writer = ShadowWriter(router=data_router, pools=pool_manager)
        results = await writer.write_batch(records)
        metrics = writer.metrics
    """

    router: DataRouter
    pools: PoolManager
    _metrics: ShadowWriterMetrics = field(
        default_factory=ShadowWriterMetrics, init=False
    )
    _buffer: list[tuple[ContextualRecord, RoutingDecision]] = field(
        default_factory=list, init=False
    )
    _enabled: bool = True

    @property
    def metrics(self) -> ShadowWriterMetrics:
        return self._metrics

    async def write(self, record: ContextualRecord) -> WriteResult:
        """Write a single ContextualRecord to the appropriate engine."""
        record_id_str = str(record.record_id)

        if not self._enabled:
            self._metrics.records_skipped += 1
            return WriteResult(
                record_id=record_id_str,
                engine=StorageEngine.POSTGRESQL,
                namespace="",
                success=False,
                error="Shadow writer disabled",
            )

        decision = self.router.route(record)
        start = datetime.now(tz=timezone.utc)

        try:
            await self._persist(record, decision)
            elapsed = (
                datetime.now(tz=timezone.utc) - start
            ).total_seconds() * 1000

            self._metrics.records_written += 1
            self._metrics.by_engine[decision.target_engine.value] = (
                self._metrics.by_engine.get(decision.target_engine.value, 0) + 1
            )
            spoke_id = record.source.system if record.source else "unknown"
            self._metrics.by_spoke[spoke_id] = (
                self._metrics.by_spoke.get(spoke_id, 0) + 1
            )
            self._metrics.last_write_at = datetime.now(tz=timezone.utc)

            return WriteResult(
                record_id=record_id_str,
                engine=decision.target_engine,
                namespace=decision.target_namespace,
                success=True,
                latency_ms=round(elapsed, 2),
            )

        except Exception as exc:
            self._metrics.records_failed += 1
            error_msg = f"{decision.target_engine.value}: {exc}"
            self._metrics.errors.append(error_msg)
            if len(self._metrics.errors) > 100:
                self._metrics.errors = self._metrics.errors[-50:]

            logger.exception(
                "Shadow write failed: %s → %s/%s",
                record_id_str,
                decision.target_engine.value,
                decision.target_namespace,
            )
            return WriteResult(
                record_id=record_id_str,
                engine=decision.target_engine,
                namespace=decision.target_namespace,
                success=False,
                error=str(exc),
            )

    async def write_batch(
        self, records: list[ContextualRecord]
    ) -> list[WriteResult]:
        """Write a batch of ContextualRecords, grouped by target engine.

        Groups records by engine first, then writes in bulk to each
        engine for efficiency. Returns individual results.
        """
        grouped = self.router.route_batch(records)
        results: list[WriteResult] = []

        for engine, items in grouped.items():
            for record, decision in items:
                result = await self.write(record)
                results.append(result)

        return results

    async def _persist(
        self, record: ContextualRecord, decision: RoutingDecision
    ) -> None:
        """Persist a record to its target storage engine.

        Phase 1: Buffer in memory (no actual DB writes).
        Phase 2: Actual persistence via pool connections.
        """
        self._buffer.append((record, decision))

        # Phase 2 implementation stubs:
        if decision.target_engine == StorageEngine.POSTGRESQL:
            await self._write_postgresql(record, decision)
        elif decision.target_engine == StorageEngine.TIMESCALEDB:
            await self._write_timescaledb(record, decision)
        elif decision.target_engine == StorageEngine.NEO4J:
            await self._write_neo4j(record, decision)
        elif decision.target_engine == StorageEngine.REDIS:
            await self._write_redis(record, decision)

    async def _write_postgresql(
        self, record: ContextualRecord, decision: RoutingDecision
    ) -> None:
        """Write to PostgreSQL spoke projection schema.

        Phase 2: INSERT INTO spoke_<name>.<entity> using asyncpg.
        """
        # Phase 1: no-op (buffered only)
        pass

    async def _write_timescaledb(
        self, record: ContextualRecord, decision: RoutingDecision
    ) -> None:
        """Write time-series data to TimescaleDB.

        Phase 2: INSERT INTO forge_ts.<hypertable> using asyncpg.
        """
        pass

    async def _write_neo4j(
        self, record: ContextualRecord, decision: RoutingDecision
    ) -> None:
        """Write graph data to Neo4j.

        Phase 2: MERGE nodes/relationships using neo4j driver.
        """
        pass

    async def _write_redis(
        self, record: ContextualRecord, decision: RoutingDecision
    ) -> None:
        """Write hot state to Redis.

        Phase 2: SET/HSET using redis-py.
        """
        pass

    def enable(self) -> None:
        """Enable shadow writing."""
        self._enabled = True
        logger.info("Shadow writer enabled")

    def disable(self) -> None:
        """Disable shadow writing (records will be skipped)."""
        self._enabled = False
        logger.info("Shadow writer disabled")

    @property
    def buffer_size(self) -> int:
        """Number of records in the in-memory buffer."""
        return len(self._buffer)

    def flush_buffer(self) -> list[tuple[ContextualRecord, RoutingDecision]]:
        """Drain the in-memory buffer and return all buffered items."""
        items = list(self._buffer)
        self._buffer.clear()
        return items
