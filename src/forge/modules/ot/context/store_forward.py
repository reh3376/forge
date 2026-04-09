"""Store-and-forward buffer — local persistence for connectivity loss.

When the Forge hub or MQTT broker is unreachable, ContextualRecords
are buffered locally in SQLite. When connectivity resumes, buffered
records are automatically flushed in chronological order.

Design decisions:
    D1: SQLite (stdlib) — no external dependencies, ACID, single file
    D2: Records stored as JSON blobs — schema-flexible, avoids migration
    D3: Chronological flush — oldest records sent first (FIFO order)
    D4: Configurable retention: max_age_hours (default 72h) and
        max_size_mb (default 100MB)
    D5: Thread-safe — SQLite handles concurrent reads; writes are
        serialized through a single connection
    D6: Flush callback is async — the adapter provides its own send
        function that the buffer calls during flush
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from forge.core.models.contextual_record import ContextualRecord

logger = logging.getLogger(__name__)

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL,
    created_at REAL NOT NULL,
    payload TEXT NOT NULL,
    sent INTEGER DEFAULT 0
);
"""

_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_buffer_unsent
ON buffer (sent, created_at);
"""


class StoreForwardBuffer:
    """Local SQLite buffer for ContextualRecords.

    Args:
        db_path: Path to SQLite database file (created if absent).
        max_age_hours: Records older than this are pruned (default 72h).
        max_size_mb: Max database size before oldest records are pruned (default 100MB).
        batch_size: Number of records flushed per batch (default 100).
    """

    def __init__(
        self,
        db_path: str | Path = "~/.forge/ot/buffer.db",
        max_age_hours: float = 72.0,
        max_size_mb: float = 100.0,
        batch_size: int = 100,
    ) -> None:
        self._db_path = Path(db_path).expanduser()
        self._max_age_hours = max_age_hours
        self._max_size_mb = max_size_mb
        self._batch_size = batch_size
        self._conn: sqlite3.Connection | None = None

        # Metrics
        self._buffered_count: int = 0
        self._flushed_count: int = 0
        self._pruned_count: int = 0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def open(self) -> None:
        """Open (or create) the SQLite database."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(
            str(self._db_path),
            timeout=5.0,
            isolation_level="DEFERRED",
        )
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute(_CREATE_TABLE)
        self._conn.execute(_CREATE_INDEX)
        self._conn.commit()
        logger.info("StoreForwardBuffer opened: %s", self._db_path)

    def close(self) -> None:
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    @property
    def is_open(self) -> bool:
        return self._conn is not None

    # ------------------------------------------------------------------
    # Buffer operations
    # ------------------------------------------------------------------

    def enqueue(self, record: ContextualRecord) -> None:
        """Add a record to the buffer.

        Called when hub connectivity is lost.
        """
        if not self._conn:
            raise RuntimeError("Buffer not open — call open() first")

        payload = record.model_dump_json()
        now = time.time()
        self._conn.execute(
            "INSERT INTO buffer (record_id, created_at, payload) VALUES (?, ?, ?)",
            (str(record.record_id), now, payload),
        )
        self._conn.commit()
        self._buffered_count += 1

    def enqueue_batch(self, records: list[ContextualRecord]) -> int:
        """Add multiple records in a single transaction.

        Returns the number of records enqueued.
        """
        if not self._conn:
            raise RuntimeError("Buffer not open — call open() first")

        now = time.time()
        rows = [
            (str(r.record_id), now, r.model_dump_json())
            for r in records
        ]
        self._conn.executemany(
            "INSERT INTO buffer (record_id, created_at, payload) VALUES (?, ?, ?)",
            rows,
        )
        self._conn.commit()
        self._buffered_count += len(rows)
        return len(rows)

    def pending_count(self) -> int:
        """Count of unsent records in the buffer."""
        if not self._conn:
            return 0
        cursor = self._conn.execute(
            "SELECT COUNT(*) FROM buffer WHERE sent = 0"
        )
        return cursor.fetchone()[0]

    def peek(self, limit: int = 10) -> list[ContextualRecord]:
        """Preview the oldest unsent records without marking them sent."""
        if not self._conn:
            return []
        cursor = self._conn.execute(
            "SELECT payload FROM buffer WHERE sent = 0 ORDER BY created_at LIMIT ?",
            (limit,),
        )
        return [ContextualRecord.model_validate_json(row[0]) for row in cursor]

    # ------------------------------------------------------------------
    # Flush
    # ------------------------------------------------------------------

    async def flush(
        self,
        send_fn: Callable[[list[ContextualRecord]], Any],
    ) -> int:
        """Flush buffered records to the hub via the provided send function.

        Reads a batch, calls send_fn, marks as sent on success.
        Repeats until buffer is empty or send_fn raises.

        Args:
            send_fn: Async callable that sends a batch of records to the hub.
                     Should raise on failure (records stay in buffer for retry).

        Returns:
            Total number of records successfully flushed.
        """
        if not self._conn:
            return 0

        total_flushed = 0

        while True:
            # Fetch a batch of unsent records
            cursor = self._conn.execute(
                "SELECT id, payload FROM buffer WHERE sent = 0 "
                "ORDER BY created_at LIMIT ?",
                (self._batch_size,),
            )
            rows = cursor.fetchall()
            if not rows:
                break

            # Deserialize
            records = []
            row_ids = []
            for row_id, payload in rows:
                try:
                    records.append(ContextualRecord.model_validate_json(payload))
                    row_ids.append(row_id)
                except Exception:
                    # Corrupt record — mark as sent to skip it
                    logger.warning("Skipping corrupt buffer record id=%d", row_id)
                    self._conn.execute(
                        "UPDATE buffer SET sent = 1 WHERE id = ?", (row_id,)
                    )

            if not records:
                self._conn.commit()
                continue

            # Send
            try:
                await send_fn(records)
            except Exception:
                logger.warning(
                    "Flush failed — %d records remain buffered", len(records)
                )
                self._conn.commit()
                break

            # Mark as sent
            placeholders = ",".join("?" for _ in row_ids)
            self._conn.execute(
                f"UPDATE buffer SET sent = 1 WHERE id IN ({placeholders})",
                row_ids,
            )
            self._conn.commit()
            total_flushed += len(records)

        self._flushed_count += total_flushed
        return total_flushed

    # ------------------------------------------------------------------
    # Pruning
    # ------------------------------------------------------------------

    def prune(self) -> int:
        """Remove old and sent records per retention policy.

        Pruning strategy:
            1. Delete all records marked as sent
            2. Delete unsent records older than max_age_hours
            3. If DB size exceeds max_size_mb, delete oldest unsent records
               until under limit

        Returns:
            Number of records pruned.
        """
        if not self._conn:
            return 0

        pruned = 0

        # Step 1: Remove sent records
        cursor = self._conn.execute("DELETE FROM buffer WHERE sent = 1")
        pruned += cursor.rowcount

        # Step 2: Remove expired unsent records
        cutoff = time.time() - (self._max_age_hours * 3600)
        cursor = self._conn.execute(
            "DELETE FROM buffer WHERE sent = 0 AND created_at < ?",
            (cutoff,),
        )
        pruned += cursor.rowcount

        # Step 3: Size-based pruning
        db_size_mb = self._get_db_size_mb()
        if db_size_mb > self._max_size_mb:
            # Delete oldest 10% of remaining records
            total = self._conn.execute(
                "SELECT COUNT(*) FROM buffer"
            ).fetchone()[0]
            delete_count = max(1, total // 10)
            cursor = self._conn.execute(
                "DELETE FROM buffer WHERE id IN ("
                "  SELECT id FROM buffer ORDER BY created_at LIMIT ?"
                ")",
                (delete_count,),
            )
            pruned += cursor.rowcount

        self._conn.commit()

        if pruned > 0:
            self._conn.execute("VACUUM")
            self._pruned_count += pruned
            logger.info("StoreForwardBuffer: pruned %d records", pruned)

        return pruned

    def _get_db_size_mb(self) -> float:
        """Get current database file size in MB."""
        try:
            return self._db_path.stat().st_size / (1024 * 1024)
        except OSError:
            return 0.0

    # ------------------------------------------------------------------
    # Health / metrics
    # ------------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """Return buffer health metrics."""
        return {
            "db_path": str(self._db_path),
            "is_open": self.is_open,
            "pending_count": self.pending_count(),
            "db_size_mb": round(self._get_db_size_mb(), 2),
            "total_buffered": self._buffered_count,
            "total_flushed": self._flushed_count,
            "total_pruned": self._pruned_count,
            "max_age_hours": self._max_age_hours,
            "max_size_mb": self._max_size_mb,
        }
