"""Tests for ScriptAuditTrail — append-only audit logging for script operations."""

import pytest
from datetime import datetime, timezone

from forge.sdk.scripting.audit import (
    AuditEntry,
    ScriptAuditTrail,
    ScriptExecutionContext,
    set_execution_context,
    get_execution_context,
    clear_execution_context,
    _safe_serialize,
    _truncate_sql,
    _count_by_field,
)


# ---------------------------------------------------------------------------
# Execution context
# ---------------------------------------------------------------------------


class TestExecutionContext:

    def test_default_context_is_empty(self):
        clear_execution_context()
        ctx = get_execution_context()
        assert ctx.script_name == ""
        assert ctx.script_owner == ""

    def test_set_and_get(self):
        ctx = ScriptExecutionContext(
            script_name="temp_monitor",
            script_owner="commissioning",
            handler_name="on_temp_change",
            trigger_type="tag_change",
            trigger_detail="WH/WHK01/TIT/Out_PV",
        )
        set_execution_context(ctx)
        retrieved = get_execution_context()
        assert retrieved.script_name == "temp_monitor"
        assert retrieved.trigger_type == "tag_change"

    def test_clear_resets(self):
        set_execution_context(ScriptExecutionContext(script_name="test"))
        clear_execution_context()
        assert get_execution_context().script_name == ""

    def teardown_method(self):
        clear_execution_context()


# ---------------------------------------------------------------------------
# AuditEntry
# ---------------------------------------------------------------------------


class TestAuditEntry:

    def test_frozen(self):
        entry = AuditEntry(
            timestamp="2026-04-08T12:00:00Z",
            operation="tag_write",
            script_name="test",
            script_owner="owner",
            handler_name="handler",
            trigger_type="tag_change",
            target="WH/TIT/Out_PV",
        )
        with pytest.raises(AttributeError):
            entry.operation = "tag_read"  # type: ignore

    def test_to_dict(self):
        entry = AuditEntry(
            timestamp="2026-04-08T12:00:00Z",
            operation="tag_write",
            script_name="test",
            script_owner="owner",
            handler_name="handler",
            trigger_type="tag_change",
            target="WH/TIT/Out_PV",
            old_value=77.0,
            new_value=78.4,
        )
        d = entry.to_dict()
        assert d["operation"] == "tag_write"
        assert d["old_value"] == 77.0
        assert d["new_value"] == 78.4

    def test_defaults(self):
        entry = AuditEntry(
            timestamp="t", operation="op", script_name="s",
            script_owner="o", handler_name="h", trigger_type="tt",
            target="tgt",
        )
        assert entry.rbac_allowed is True
        assert entry.success is True
        assert entry.error == ""
        assert entry.duration_ms == 0.0


# ---------------------------------------------------------------------------
# ScriptAuditTrail — recording
# ---------------------------------------------------------------------------


class TestAuditTrailRecording:

    @pytest.fixture(autouse=True)
    def setup_context(self):
        set_execution_context(ScriptExecutionContext(
            script_name="temp_monitor",
            script_owner="commissioning",
            handler_name="on_temp_change",
            trigger_type="tag_change",
        ))
        yield
        clear_execution_context()

    def test_record_tag_write(self):
        trail = ScriptAuditTrail()
        entry = trail.record_tag_write(
            "WH/TIT/Out_PV", old_value=77.0, new_value=78.4,
            area="Distillery01",
        )
        assert entry.operation == "tag_write"
        assert entry.script_name == "temp_monitor"
        assert entry.script_owner == "commissioning"
        assert entry.target == "WH/TIT/Out_PV"
        assert entry.old_value == 77.0
        assert entry.new_value == 78.4
        assert entry.area == "Distillery01"
        assert trail.total_entries == 1

    def test_record_tag_write_denied(self):
        trail = ScriptAuditTrail()
        entry = trail.record_tag_write(
            "WH/TIT/Out_PV", old_value=77.0, new_value=78.4,
            rbac_allowed=False, rbac_reason="No permission",
        )
        assert entry.rbac_allowed is False
        assert trail.total_denied == 1

    def test_record_db_query(self):
        trail = ScriptAuditTrail()
        entry = trail.record_db_query(
            "SELECT * FROM batches", row_count=42,
        )
        assert entry.operation == "db_query"
        assert entry.target == "SELECT * FROM batches"
        assert entry.new_value == {"row_count": 42, "db": "default"}

    def test_record_db_mutate(self):
        trail = ScriptAuditTrail()
        entry = trail.record_db_query(
            "UPDATE batches SET status='done'", is_mutation=True,
        )
        assert entry.operation == "db_mutate"

    def test_record_tag_read(self):
        trail = ScriptAuditTrail()
        entry = trail.record_tag_read("WH/TIT/Out_PV", value=78.4)
        assert entry.operation == "tag_read"
        assert entry.new_value == 78.4

    def test_multiple_records(self):
        trail = ScriptAuditTrail()
        trail.record_tag_write("tag/a", 1, 2)
        trail.record_tag_write("tag/b", 3, 4)
        trail.record_tag_read("tag/c", 5)
        assert trail.total_entries == 3
        assert trail.buffer_size == 3


# ---------------------------------------------------------------------------
# Ring buffer eviction
# ---------------------------------------------------------------------------


class TestRingBuffer:

    @pytest.fixture(autouse=True)
    def setup_context(self):
        set_execution_context(ScriptExecutionContext(
            script_name="test", script_owner="owner",
            handler_name="handler", trigger_type="timer",
        ))
        yield
        clear_execution_context()

    def test_buffer_evicts_oldest(self):
        trail = ScriptAuditTrail(max_buffer_size=5)
        for i in range(10):
            trail.record_tag_write(f"tag/{i}", i, i + 1)
        assert trail.buffer_size == 5
        assert trail.total_entries == 10
        # Oldest entries should be evicted
        targets = [e.target for e in trail._buffer]
        assert "tag/0" not in targets
        assert "tag/9" in targets

    def test_clear_buffer(self):
        trail = ScriptAuditTrail()
        trail.record_tag_write("tag/a", 1, 2)
        trail.clear_buffer()
        assert trail.buffer_size == 0
        # total_entries is NOT reset by clear_buffer
        assert trail.total_entries == 1


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


class TestAuditQuery:

    @pytest.fixture
    def populated_trail(self):
        trail = ScriptAuditTrail()

        set_execution_context(ScriptExecutionContext(
            script_name="script_a", script_owner="owner_a",
            handler_name="h1", trigger_type="tag_change",
        ))
        trail.record_tag_write("tag/1", 0, 1)
        trail.record_tag_write("tag/2", 0, 1, rbac_allowed=False, rbac_reason="denied")

        set_execution_context(ScriptExecutionContext(
            script_name="script_b", script_owner="owner_b",
            handler_name="h2", trigger_type="timer",
        ))
        trail.record_db_query("SELECT 1")
        trail.record_tag_read("tag/3", 42)

        clear_execution_context()
        return trail

    def test_query_all(self, populated_trail):
        results = populated_trail.query()
        assert len(results) == 4

    def test_query_by_script_name(self, populated_trail):
        results = populated_trail.query(script_name="script_a")
        assert len(results) == 2
        assert all(e.script_name == "script_a" for e in results)

    def test_query_by_operation(self, populated_trail):
        results = populated_trail.query(operation="tag_write")
        assert len(results) == 2

    def test_query_by_owner(self, populated_trail):
        results = populated_trail.query(owner="owner_b")
        assert len(results) == 2

    def test_query_denied_only(self, populated_trail):
        results = populated_trail.query(denied_only=True)
        assert len(results) == 1
        assert results[0].rbac_allowed is False

    def test_query_with_limit(self, populated_trail):
        results = populated_trail.query(limit=2)
        assert len(results) == 2

    def test_query_returns_newest_first(self, populated_trail):
        results = populated_trail.query()
        # Most recent entry is tag_read from script_b
        assert results[0].operation == "tag_read"


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestAuditStats:

    def test_get_stats(self):
        trail = ScriptAuditTrail()

        set_execution_context(ScriptExecutionContext(
            script_name="s1", script_owner="o", handler_name="h",
            trigger_type="tag_change",
        ))
        trail.record_tag_write("t1", 0, 1)
        trail.record_tag_write("t2", 0, 1, rbac_allowed=False, rbac_reason="no")

        set_execution_context(ScriptExecutionContext(
            script_name="s2", script_owner="o", handler_name="h",
            trigger_type="timer",
        ))
        trail.record_db_query("SELECT 1")

        clear_execution_context()

        stats = trail.get_stats()
        assert stats["total_entries"] == 3
        assert stats["total_denied"] == 1
        assert stats["operations"]["tag_write"] == 2
        assert stats["operations"]["db_query"] == 1
        assert stats["scripts"]["s1"] == 2
        assert stats["scripts"]["s2"] == 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class TestHelpers:

    def test_safe_serialize_primitives(self):
        assert _safe_serialize(None) is None
        assert _safe_serialize(True) is True
        assert _safe_serialize(42) == 42
        assert _safe_serialize(3.14) == 3.14
        assert _safe_serialize("hello") == "hello"

    def test_safe_serialize_dict(self):
        d = {"key": "value", "num": 42}
        assert _safe_serialize(d) == d

    def test_safe_serialize_passes_through_jsonable(self):
        # object() is handled by json.dumps(default=str), so it passes through
        obj = object()
        result = _safe_serialize(obj)
        # The function returns the original value since json.dumps succeeds with default=str
        assert result is obj

    def test_truncate_sql_short(self):
        assert _truncate_sql("SELECT 1") == "SELECT 1"

    def test_truncate_sql_long(self):
        long_sql = "SELECT " + "x" * 300
        result = _truncate_sql(long_sql, max_length=200)
        assert len(result) == 203  # 200 + "..."
        assert result.endswith("...")

    def test_truncate_sql_strips_whitespace(self):
        assert _truncate_sql("  SELECT 1  ") == "SELECT 1"

    def test_count_by_field(self):
        from collections import deque
        entries = deque([
            AuditEntry(timestamp="t", operation="tag_write", script_name="a",
                       script_owner="o", handler_name="h", trigger_type="tt", target="t"),
            AuditEntry(timestamp="t", operation="db_query", script_name="a",
                       script_owner="o", handler_name="h", trigger_type="tt", target="t"),
            AuditEntry(timestamp="t", operation="tag_write", script_name="b",
                       script_owner="o", handler_name="h", trigger_type="tt", target="t"),
        ])
        counts = _count_by_field(entries, "operation")
        assert counts == {"tag_write": 2, "db_query": 1}
