"""Durable adapter registry and ingest log (BACKLOG FB-060).

Migration 001 created ``forge_core.adapters`` and ``forge_core.records_log``
but nothing wrote to them: the hub's adapter registry lived in a dict and
every restart forgot which spokes had registered. This module is the
storage half of the fix:

* :class:`AdapterRow` / :class:`IngestBatchRow` — what is persisted.
* :class:`AdapterRegistryStore` — the protocol the hub registry talks to.
* :class:`InMemoryAdapterRegistryStore` — tests and the dev stack without
  PostgreSQL (bounded log).
* :class:`PostgresAdapterRegistryStore` — asyncpg-backed; upserts the
  adapter row on Register and heartbeat, appends one ``records_log`` row
  per ingested batch (migration 007 adds the batch counters).

Store failures are logged and counted, never raised into the ingest path:
a database hiccup must not reject a spoke's records.
"""

from __future__ import annotations

import json
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


@dataclass
class AdapterRow:
    """One ``forge_core.adapters`` row."""

    adapter_id: str
    name: str
    version: str = "0.1.0"
    type: str = "INGESTION"
    tier: str = "MES_MOM"
    protocol: str = "grpc"
    state: str = "REGISTERED"
    manifest: dict[str, Any] = field(default_factory=dict)
    health: dict[str, Any] | None = None
    registered_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_health_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter_id": self.adapter_id,
            "name": self.name,
            "version": self.version,
            "type": self.type,
            "tier": self.tier,
            "protocol": self.protocol,
            "state": self.state,
            "manifest": self.manifest,
            "health": self.health,
            "registered_at": self.registered_at.isoformat(),
            "last_health_at": self.last_health_at.isoformat() if self.last_health_at else None,
        }


@dataclass
class IngestBatchRow:
    """One ``forge_core.records_log`` row: the outcome of one ingested batch."""

    adapter_id: str
    session_id: str
    batch_size: int
    accepted: int = 0
    rejected: int = 0
    persisted: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)
    ingested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "adapter_id": self.adapter_id,
            "session_id": self.session_id,
            "batch_size": self.batch_size,
            "accepted": self.accepted,
            "rejected": self.rejected,
            "persisted": self.persisted,
            "failed": self.failed,
            "errors": list(self.errors),
            "ingested_at": self.ingested_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


class AdapterRegistryStore(Protocol):
    """Persistence for registrations, heartbeats and the ingest log."""

    async def save_adapter(self, row: AdapterRow) -> None: ...

    async def list_adapters(self) -> list[AdapterRow]: ...

    async def log_batch(self, batch: IngestBatchRow) -> None: ...

    async def list_batches(
        self, adapter_id: str | None = None, *, limit: int = 100
    ) -> list[IngestBatchRow]: ...


# ---------------------------------------------------------------------------
# In-memory
# ---------------------------------------------------------------------------


class InMemoryAdapterRegistryStore:
    """Dict-backed store: survives nothing, but behaves like the real one."""

    def __init__(self, max_batches: int = 10_000) -> None:
        self._adapters: dict[str, AdapterRow] = {}
        self._batches: deque[IngestBatchRow] = deque(maxlen=max_batches)
        self._next_id = 1

    async def save_adapter(self, row: AdapterRow) -> None:
        existing = self._adapters.get(row.adapter_id)
        if existing is not None:
            row.registered_at = existing.registered_at
        self._adapters[row.adapter_id] = row

    async def list_adapters(self) -> list[AdapterRow]:
        return [self._adapters[k] for k in sorted(self._adapters)]

    async def log_batch(self, batch: IngestBatchRow) -> None:
        batch.id = self._next_id
        self._next_id += 1
        self._batches.append(batch)

    async def list_batches(
        self, adapter_id: str | None = None, *, limit: int = 100
    ) -> list[IngestBatchRow]:
        rows = [
            b for b in reversed(self._batches) if adapter_id is None or b.adapter_id == adapter_id
        ]
        return rows[: max(limit, 0)]

    def __len__(self) -> int:
        return len(self._adapters)


# ---------------------------------------------------------------------------
# PostgreSQL (asyncpg)
# ---------------------------------------------------------------------------

_UPSERT_ADAPTER = """
INSERT INTO forge_core.adapters
    (adapter_id, name, version, type, tier, protocol, state, manifest, health,
     registered_at, last_health_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::json, $9::json, $10, $11)
ON CONFLICT (adapter_id) DO UPDATE SET
    name = EXCLUDED.name,
    version = EXCLUDED.version,
    type = EXCLUDED.type,
    tier = EXCLUDED.tier,
    protocol = EXCLUDED.protocol,
    state = EXCLUDED.state,
    manifest = EXCLUDED.manifest,
    health = EXCLUDED.health,
    last_health_at = EXCLUDED.last_health_at
"""

_SELECT_ADAPTERS = """
SELECT adapter_id, name, version, type, tier, protocol, state, manifest, health,
       registered_at, last_health_at
FROM forge_core.adapters
ORDER BY adapter_id
"""

_INSERT_BATCH = """
INSERT INTO forge_core.records_log
    (adapter_id, session_id, batch_size, accepted, rejected, persisted, failed, errors,
     ingested_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::json, $9)
"""

_SELECT_BATCHES = """
SELECT id, adapter_id, session_id, batch_size, accepted, rejected, persisted, failed,
       errors, ingested_at
FROM forge_core.records_log
WHERE ($1::text IS NULL OR adapter_id = $1)
ORDER BY ingested_at DESC, id DESC
LIMIT $2
"""


def _json_value(value: Any) -> Any:
    """asyncpg hands ``json`` columns back as text unless a codec is set."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


class PostgresAdapterRegistryStore:
    """asyncpg-backed :class:`AdapterRegistryStore` over ``forge_core``."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool
        self.write_failures = 0
        self.read_failures = 0

    def _pool_ok(self) -> bool:
        return self._pool is not None

    async def save_adapter(self, row: AdapterRow) -> None:
        if not self._pool_ok():
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    _UPSERT_ADAPTER,
                    row.adapter_id,
                    row.name,
                    row.version,
                    row.type,
                    row.tier,
                    row.protocol,
                    row.state,
                    json.dumps(row.manifest, default=str),
                    json.dumps(row.health, default=str) if row.health is not None else None,
                    row.registered_at,
                    row.last_health_at,
                )
        except Exception:
            self.write_failures += 1
            logger.exception("Failed to persist adapter %s", row.adapter_id)

    async def list_adapters(self) -> list[AdapterRow]:
        if not self._pool_ok():
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(_SELECT_ADAPTERS)
        except Exception:
            self.read_failures += 1
            logger.exception("Failed to load the adapter registry")
            return []
        return [
            AdapterRow(
                adapter_id=r["adapter_id"],
                name=r["name"],
                version=r["version"],
                type=r["type"],
                tier=r["tier"],
                protocol=r["protocol"],
                state=r["state"],
                manifest=_json_value(r["manifest"]) or {},
                health=_json_value(r["health"]),
                registered_at=r["registered_at"],
                last_health_at=r["last_health_at"],
            )
            for r in rows
        ]

    async def log_batch(self, batch: IngestBatchRow) -> None:
        if not self._pool_ok():
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    _INSERT_BATCH,
                    batch.adapter_id,
                    batch.session_id,
                    batch.batch_size,
                    batch.accepted,
                    batch.rejected,
                    batch.persisted,
                    batch.failed,
                    json.dumps(batch.errors, default=str),
                    batch.ingested_at,
                )
        except Exception:
            self.write_failures += 1
            logger.exception("Failed to log ingest batch for %s", batch.adapter_id)

    async def list_batches(
        self, adapter_id: str | None = None, *, limit: int = 100
    ) -> list[IngestBatchRow]:
        if not self._pool_ok():
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(_SELECT_BATCHES, adapter_id, max(limit, 0))
        except Exception:
            self.read_failures += 1
            logger.exception("Failed to read the ingest log")
            return []
        return [
            IngestBatchRow(
                id=r["id"],
                adapter_id=r["adapter_id"],
                session_id=r["session_id"] or "",
                batch_size=r["batch_size"],
                accepted=r["accepted"] or 0,
                rejected=r["rejected"] or 0,
                persisted=r["persisted"] or 0,
                failed=r["failed"] or 0,
                errors=list(_json_value(r["errors"]) or []),
                ingested_at=r["ingested_at"],
            )
            for r in rows
        ]
