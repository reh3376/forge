"""TimescaleDB storage engine — time-series record writer and reader.

Writes ContextualRecords to the ``forge_ts.contextual_records`` hypertable
using asyncpg batch inserts. Reads support time-range and equipment-based
queries.

The hypertable schema:
    time           TIMESTAMPTZ NOT NULL,
    record_id      UUID,
    adapter_id     TEXT,
    system         TEXT,
    tag_path       TEXT,
    raw_value      JSONB,
    engineering_units TEXT,
    quality        TEXT,
    data_type      TEXT,
    equipment_id   TEXT,
    area           TEXT,
    batch_id       TEXT,
    operating_mode TEXT,
    context_extra  JSONB,
    schema_ref     TEXT,
    adapter_version TEXT
"""

from __future__ import annotations

import json
import logging
from datetime import datetime  # noqa: TC003
from typing import Any

from forge.core.models.contextual_record import ContextualRecord  # noqa: TC001

logger = logging.getLogger(__name__)


class TimescaleRecordWriter:
    """Batch writer for ContextualRecords → TimescaleDB hypertable.

    Uses asyncpg ``copy_records_to_table`` for efficient bulk inserts
    when writing large batches, and regular inserts for small batches.
    """

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    async def write_record(self, record: ContextualRecord) -> bool:
        """Write a single record to the hypertable."""
        if not self._pool_ok():
            return False

        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO forge_ts.contextual_records
                        (time, record_id, adapter_id, system, tag_path,
                         raw_value, engineering_units, quality, data_type,
                         equipment_id, area, batch_id, operating_mode,
                         context_extra, schema_ref, adapter_version)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                            $10, $11, $12, $13, $14, $15, $16)
                    """,
                    *self._record_to_row(record),
                )
            return True
        except Exception:
            logger.exception("Failed to write record %s to TimescaleDB", record.record_id)
            return False

    async def write_batch(self, records: list[ContextualRecord]) -> int:
        """Write a batch of records. Returns number successfully written."""
        if not self._pool_ok() or not records:
            return 0

        rows = [self._record_to_row(r) for r in records]
        written = 0

        try:
            async with self._pool.acquire() as conn:
                # Use executemany for batch efficiency
                await conn.executemany(
                    """
                    INSERT INTO forge_ts.contextual_records
                        (time, record_id, adapter_id, system, tag_path,
                         raw_value, engineering_units, quality, data_type,
                         equipment_id, area, batch_id, operating_mode,
                         context_extra, schema_ref, adapter_version)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                            $10, $11, $12, $13, $14, $15, $16)
                    """,
                    rows,
                )
                written = len(records)
        except Exception:
            logger.exception("Batch write to TimescaleDB failed (%d records)", len(records))

        return written

    @staticmethod
    def _record_to_row(record: ContextualRecord) -> tuple[Any, ...]:
        """Convert a ContextualRecord to a row tuple for INSERT."""
        ctx = record.context
        return (
            record.timestamp.source_time,
            record.record_id,
            record.source.adapter_id,
            record.source.system,
            record.source.tag_path,
            json.dumps(record.value.raw)
            if not isinstance(record.value.raw, str)
            else record.value.raw,
            record.value.engineering_units,
            record.value.quality.value,
            record.value.data_type,
            ctx.equipment_id if ctx else None,
            ctx.area if ctx else None,
            ctx.batch_id if ctx else None,
            ctx.operating_mode if ctx else None,
            json.dumps(ctx.extra) if ctx and ctx.extra else None,
            record.lineage.schema_ref,
            record.lineage.adapter_version,
        )


class TimescaleRecordReader:
    """Query reader for ContextualRecords from TimescaleDB.

    Supports time-range, equipment, and adapter-based queries.
    Returns raw dicts (not ContextualRecord) for flexibility —
    callers decide how to materialize results.
    """

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    def _pool_ok(self) -> bool:
        return self._pool is not None

    async def query_time_range(
        self,
        start: datetime,
        end: datetime,
        *,
        equipment_id: str | None = None,
        adapter_id: str | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Query records within a time range."""
        if not self._pool_ok():
            return []

        try:
            conditions = ["time >= $1 AND time < $2"]
            params: list[Any] = [start, end]
            idx = 3

            if equipment_id:
                conditions.append(f"equipment_id = ${idx}")
                params.append(equipment_id)
                idx += 1
            if adapter_id:
                conditions.append(f"adapter_id = ${idx}")
                params.append(adapter_id)
                idx += 1

            where = " AND ".join(conditions)
            params.append(limit)

            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    f"SELECT * FROM forge_ts.contextual_records "
                    f"WHERE {where} ORDER BY time DESC LIMIT ${idx}",
                    *params,
                )
                return [dict(r) for r in rows]
        except Exception:
            logger.exception("TimescaleDB time-range query failed")
            return []

    async def query_by_equipment(
        self,
        equipment_id: str,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query latest records for a specific piece of equipment."""
        if not self._pool_ok():
            return []

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT * FROM forge_ts.contextual_records "
                    "WHERE equipment_id = $1 ORDER BY time DESC LIMIT $2",
                    equipment_id,
                    limit,
                )
                return [dict(r) for r in rows]
        except Exception:
            logger.exception("TimescaleDB equipment query failed")
            return []

    async def count_records(
        self,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> int:
        """Count records, optionally within a time range."""
        if not self._pool_ok():
            return 0

        try:
            async with self._pool.acquire() as conn:
                if start and end:
                    row = await conn.fetchval(
                        "SELECT COUNT(*) FROM forge_ts.contextual_records "
                        "WHERE time >= $1 AND time < $2",
                        start,
                        end,
                    )
                else:
                    row = await conn.fetchval(
                        "SELECT COUNT(*) FROM forge_ts.contextual_records",
                    )
                return row or 0
        except Exception:
            logger.exception("TimescaleDB count query failed")
            return 0
