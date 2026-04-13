"""Tests for the store-and-forward SQLite buffer."""

import asyncio
from datetime import UTC, datetime

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
from forge.modules.ot.context.store_forward import StoreForwardBuffer

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_record(tag_path: str = "WH/WHK01/Distillery01/TIT_2010/Out_PV") -> ContextualRecord:
    """Create a minimal ContextualRecord for testing."""
    now = datetime.now(tz=UTC)
    return ContextualRecord(
        source=RecordSource(
            adapter_id="forge-ot-module",
            system="forge-ot",
            tag_path=tag_path,
        ),
        timestamp=RecordTimestamp(
            source_time=now,
            server_time=now,
            ingestion_time=now,
        ),
        value=RecordValue(raw=78.4, quality=QualityCode.GOOD, data_type="DOUBLE"),
        context=RecordContext(area="Distillery01", equipment_id="TIT_2010"),
        lineage=RecordLineage(
            schema_ref="forge://schemas/ot-module/v0.1.0",
            adapter_id="forge-ot-module",
            adapter_version="0.1.0",
        ),
    )


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestBufferLifecycle:

    def test_open_creates_db_file(self, tmp_path):
        db = tmp_path / "buffer.db"
        buf = StoreForwardBuffer(db_path=db)
        buf.open()
        assert db.exists()
        buf.close()

    def test_is_open_after_open(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        assert not buf.is_open
        buf.open()
        assert buf.is_open
        buf.close()
        assert not buf.is_open

    def test_open_creates_parent_dirs(self, tmp_path):
        db = tmp_path / "deep" / "nested" / "buffer.db"
        buf = StoreForwardBuffer(db_path=db)
        buf.open()
        assert db.exists()
        buf.close()


# ---------------------------------------------------------------------------
# Enqueue / Pending
# ---------------------------------------------------------------------------


class TestEnqueue:

    def test_enqueue_single(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        buf.enqueue(_make_record())
        assert buf.pending_count() == 1
        buf.close()

    def test_enqueue_batch(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        records = [_make_record(f"tag/{i}") for i in range(5)]
        count = buf.enqueue_batch(records)
        assert count == 5
        assert buf.pending_count() == 5
        buf.close()

    def test_enqueue_not_open_raises(self):
        buf = StoreForwardBuffer(db_path="/tmp/never_opened.db")
        with pytest.raises(RuntimeError, match="not open"):
            buf.enqueue(_make_record())

    def test_pending_count_zero_when_not_open(self):
        buf = StoreForwardBuffer(db_path="/tmp/not_opened.db")
        assert buf.pending_count() == 0

    def test_peek_returns_records(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        buf.enqueue(_make_record("tag/a"))
        buf.enqueue(_make_record("tag/b"))
        peeked = buf.peek(limit=10)
        assert len(peeked) == 2
        assert all(isinstance(r, ContextualRecord) for r in peeked)
        # Peek should NOT mark as sent
        assert buf.pending_count() == 2
        buf.close()


# ---------------------------------------------------------------------------
# Flush
# ---------------------------------------------------------------------------


class TestFlush:

    @pytest.mark.asyncio
    async def test_flush_sends_records(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db", batch_size=10)
        buf.open()
        for i in range(3):
            buf.enqueue(_make_record(f"tag/{i}"))

        sent = []

        async def mock_send(records):
            sent.extend(records)

        flushed = await buf.flush(mock_send)
        assert flushed == 3
        assert len(sent) == 3
        assert buf.pending_count() == 0
        buf.close()

    @pytest.mark.asyncio
    async def test_flush_empty_buffer(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()

        async def mock_send(records):
            pass

        flushed = await buf.flush(mock_send)
        assert flushed == 0
        buf.close()

    @pytest.mark.asyncio
    async def test_flush_stops_on_send_failure(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db", batch_size=2)
        buf.open()
        for i in range(5):
            buf.enqueue(_make_record(f"tag/{i}"))

        call_count = 0

        async def failing_send(records):
            nonlocal call_count
            call_count += 1
            if call_count > 1:
                raise ConnectionError("Hub unreachable")

        flushed = await buf.flush(failing_send)
        # First batch of 2 succeeded, second batch failed
        assert flushed == 2
        assert buf.pending_count() == 3
        buf.close()

    @pytest.mark.asyncio
    async def test_flush_not_open_returns_zero(self):
        buf = StoreForwardBuffer(db_path="/tmp/not_opened.db")

        async def mock_send(records):
            pass

        assert await buf.flush(mock_send) == 0

    @pytest.mark.asyncio
    async def test_flush_batches_correctly(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db", batch_size=3)
        buf.open()
        for i in range(7):
            buf.enqueue(_make_record(f"tag/{i}"))

        batch_sizes = []

        async def tracking_send(records):
            batch_sizes.append(len(records))

        flushed = await buf.flush(tracking_send)
        assert flushed == 7
        # Should be 3, 3, 1
        assert batch_sizes == [3, 3, 1]
        buf.close()


# ---------------------------------------------------------------------------
# Prune
# ---------------------------------------------------------------------------


class TestPrune:

    def test_prune_removes_sent_records(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db", batch_size=100)
        buf.open()
        for i in range(5):
            buf.enqueue(_make_record(f"tag/{i}"))

        # Flush to mark as sent
        async def mock_send(records):
            pass

        asyncio.run(buf.flush(mock_send))
        assert buf.pending_count() == 0

        pruned = buf.prune()
        assert pruned == 5
        buf.close()

    def test_prune_not_open_returns_zero(self):
        buf = StoreForwardBuffer(db_path="/tmp/not_opened.db")
        assert buf.prune() == 0


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class TestHealth:

    def test_health_returns_metrics(self, tmp_path):
        buf = StoreForwardBuffer(db_path=tmp_path / "buffer.db")
        buf.open()
        buf.enqueue(_make_record())
        h = buf.health()
        assert h["is_open"] is True
        assert h["pending_count"] == 1
        assert h["total_buffered"] == 1
        assert h["total_flushed"] == 0
        assert h["max_age_hours"] == 72.0
        buf.close()
