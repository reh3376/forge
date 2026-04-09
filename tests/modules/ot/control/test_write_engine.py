"""Tests for the ControlWriteEngine.

Covers:
- Full success path (validation → interlock → auth → write → read-back → CONFIRMED)
- Rejection at each layer (REJECTED_VALIDATION, REJECTED_INTERLOCK, REJECTED_AUTH)
- Write failure (FAILED_WRITE)
- Read-back failure (FAILED_READBACK)
- Unconfirmed write (read-back mismatch)
- Float tolerance in read-back comparison
- Boolean, integer, string read-back matching
- Journal (bounded deque, ordering)
- Stats
- Listener notification
"""

import pytest
from unittest.mock import AsyncMock

from forge.modules.ot.control.models import (
    DataType,
    InterlockCondition,
    InterlockRule,
    TagWriteConfig,
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.write_engine import ControlWriteEngine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_writer(values: dict | None = None, write_error: Exception | None = None, read_error: Exception | None = None):
    """Create a mock tag writer."""
    store = dict(values or {})
    writer = AsyncMock()

    async def _write(tag_path, value):
        if write_error:
            raise write_error
        store[tag_path] = value

    async def _read(tag_path):
        if read_error:
            raise read_error
        return store.get(tag_path)

    writer.write_tag = AsyncMock(side_effect=_write)
    writer.read_tag = AsyncMock(side_effect=_read)
    return writer


def _build_engine(
    tag_reader=None,
    tag_writer=None,
    interlock_values=None,
    add_interlock=False,
) -> ControlWriteEngine:
    """Build a fully wired engine with standard test config."""
    validator = WriteValidator()
    validator.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
        data_type=DataType.FLOAT,
        min_value=0.0,
        max_value=200.0,
        engineering_units="°F",
    ))
    validator.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/Valve01/Open",
        data_type=DataType.BOOLEAN,
    ))
    validator.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/Counter/Value",
        data_type=DataType.INT32,
        min_value=-1000,
        max_value=1000,
    ))
    validator.register_tag(TagWriteConfig(
        tag_path="WH/WHK01/Distillery01/Label/Text",
        data_type=DataType.STRING,
    ))

    # Interlock engine
    il_reader = AsyncMock()
    il_store = interlock_values or {}
    il_reader.read_tag = AsyncMock(side_effect=lambda p: il_store.get(p))
    interlock_engine = InterlockEngine(tag_reader=tag_reader or il_reader)

    if add_interlock:
        interlock_engine.add_rule(InterlockRule(
            rule_id="IL-001",
            name="Pump guard",
            target_tag_pattern="WH/WHK01/Distillery01/*/SP",
            check_tag="WH/WHK01/Distillery01/Pump01/Running",
            condition=InterlockCondition.IS_TRUE,
        ))

    # Authorizer
    authorizer = WriteAuthorizer()
    authorizer.add_permission(WritePermission(
        permission_id="perm-all",
        area_pattern="*",
        tag_pattern="**",
        min_role=WriteRole.OPERATOR,
    ))

    return ControlWriteEngine(
        validator=validator,
        interlock_engine=interlock_engine,
        authorizer=authorizer,
        tag_writer=tag_writer,
    )


def _make_request(
    tag_path: str = "WH/WHK01/Distillery01/TIT_2010/SP",
    value=100.0,
    **kw,
):
    defaults = dict(
        requestor="op1",
        role=WriteRole.OPERATOR,
        area="Distillery01",
    )
    defaults.update(kw)
    return WriteRequest(tag_path=tag_path, value=value, **defaults)


# ---------------------------------------------------------------------------
# Full success path
# ---------------------------------------------------------------------------


class TestSuccessPath:
    @pytest.mark.asyncio
    async def test_confirmed_write(self):
        writer = _make_writer({"WH/WHK01/Distillery01/TIT_2010/SP": 50.0})
        engine = _build_engine(tag_writer=writer)

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.CONFIRMED
        assert result.validation_passed is True
        assert result.interlock_passed is True
        assert result.auth_passed is True
        assert result.readback_matched is True
        assert result.old_value == 50.0
        assert result.new_value == 100.0

    @pytest.mark.asyncio
    async def test_boolean_write(self):
        writer = _make_writer({"WH/WHK01/Distillery01/Valve01/Open": False})
        engine = _build_engine(tag_writer=writer)

        req = _make_request(
            tag_path="WH/WHK01/Distillery01/Valve01/Open",
            value=True,
            data_type=DataType.BOOLEAN,
        )
        result = await engine.execute(req)

        assert result.status == WriteStatus.CONFIRMED
        assert result.old_value is False
        assert result.new_value is True

    @pytest.mark.asyncio
    async def test_int32_write(self):
        writer = _make_writer({"WH/WHK01/Distillery01/Counter/Value": 0})
        engine = _build_engine(tag_writer=writer)

        req = _make_request(
            tag_path="WH/WHK01/Distillery01/Counter/Value",
            value=500,
            data_type=DataType.INT32,
        )
        result = await engine.execute(req)

        assert result.status == WriteStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_string_write(self):
        writer = _make_writer({"WH/WHK01/Distillery01/Label/Text": "old"})
        engine = _build_engine(tag_writer=writer)

        req = _make_request(
            tag_path="WH/WHK01/Distillery01/Label/Text",
            value="new_label",
            data_type=DataType.STRING,
        )
        result = await engine.execute(req)

        assert result.status == WriteStatus.CONFIRMED


# ---------------------------------------------------------------------------
# Rejections at each layer
# ---------------------------------------------------------------------------


class TestRejections:
    @pytest.mark.asyncio
    async def test_validation_rejection(self):
        engine = _build_engine()

        req = _make_request(value=999.0)  # Above max
        result = await engine.execute(req)

        assert result.status == WriteStatus.REJECTED_VALIDATION
        assert result.validation_passed is False
        # Interlock/auth should not have been checked
        assert result.interlock_passed is False
        assert result.auth_passed is False

    @pytest.mark.asyncio
    async def test_interlock_rejection(self):
        il_reader = AsyncMock()
        il_reader.read_tag = AsyncMock(return_value=True)  # Pump is running
        engine = _build_engine(tag_reader=il_reader, add_interlock=True)

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.REJECTED_INTERLOCK
        assert result.validation_passed is True
        assert result.interlock_passed is False
        assert result.auth_passed is False  # Skipped

    @pytest.mark.asyncio
    async def test_auth_rejection(self):
        engine = _build_engine()
        # Replace authorizer with one that has no permissions
        engine._authorizer = WriteAuthorizer()

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.REJECTED_AUTH
        assert result.validation_passed is True
        assert result.interlock_passed is True
        assert result.auth_passed is False


# ---------------------------------------------------------------------------
# Write/read-back failures
# ---------------------------------------------------------------------------


class TestWriteFailures:
    @pytest.mark.asyncio
    async def test_write_failure(self):
        writer = _make_writer(write_error=ConnectionError("PLC timeout"))
        engine = _build_engine(tag_writer=writer)

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.FAILED_WRITE
        assert "PLC timeout" in result.write_error
        assert result.completed_at is not None

    @pytest.mark.asyncio
    async def test_readback_failure(self):
        writer = _make_writer(read_error=ConnectionError("Read timeout"))
        engine = _build_engine(tag_writer=writer)

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.FAILED_READBACK
        assert "Read timeout" in result.readback_error

    @pytest.mark.asyncio
    async def test_unconfirmed_readback_mismatch(self):
        """Write succeeds but read-back returns a different value."""
        writer = AsyncMock()
        # read_tag returns different value than what was written
        writer.read_tag = AsyncMock(side_effect=[50.0, 99.0])  # old, then mismatched new
        writer.write_tag = AsyncMock()

        engine = _build_engine(tag_writer=writer)
        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.UNCONFIRMED
        assert result.readback_matched is False


# ---------------------------------------------------------------------------
# Float tolerance
# ---------------------------------------------------------------------------


class TestFloatTolerance:
    @pytest.mark.asyncio
    async def test_within_tolerance(self):
        """Read-back 100.0005 should match requested 100.0."""
        writer = AsyncMock()
        writer.read_tag = AsyncMock(side_effect=[50.0, 100.0005])
        writer.write_tag = AsyncMock()

        engine = _build_engine(tag_writer=writer)
        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_outside_tolerance(self):
        """Read-back 100.01 should NOT match requested 100.0."""
        writer = AsyncMock()
        writer.read_tag = AsyncMock(side_effect=[50.0, 100.01])
        writer.write_tag = AsyncMock()

        engine = _build_engine(tag_writer=writer)
        req = _make_request(value=100.0)
        result = await engine.execute(req)

        assert result.status == WriteStatus.UNCONFIRMED


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------


class TestJournal:
    @pytest.mark.asyncio
    async def test_journal_records_writes(self):
        engine = _build_engine()

        await engine.execute(_make_request(value=100.0))
        await engine.execute(_make_request(value=150.0))

        journal = engine.get_journal()
        assert len(journal) == 2
        # Newest first
        assert journal[0]["requested_value"] == 150.0
        assert journal[1]["requested_value"] == 100.0

    @pytest.mark.asyncio
    async def test_journal_bounded(self):
        engine = ControlWriteEngine(
            validator=WriteValidator(),
            interlock_engine=InterlockEngine(),
            authorizer=WriteAuthorizer(),
            journal_size=3,
        )
        # All writes will be rejected (no tag config) but still journaled
        for i in range(5):
            await engine.execute(_make_request(value=float(i)))

        journal = engine.get_journal()
        assert len(journal) == 3

    @pytest.mark.asyncio
    async def test_journal_records_rejections(self):
        engine = _build_engine()

        # This will be rejected (value out of range)
        await engine.execute(_make_request(value=999.0))

        journal = engine.get_journal()
        assert len(journal) == 1
        assert journal[0]["status"] == "REJECTED_VALIDATION"

    @pytest.mark.asyncio
    async def test_journal_limit(self):
        engine = _build_engine()

        for i in range(5):
            await engine.execute(_make_request(value=float(i * 10)))

        journal = engine.get_journal(limit=2)
        assert len(journal) == 2


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStats:
    @pytest.mark.asyncio
    async def test_stats_after_mixed_writes(self):
        engine = _build_engine()

        # Confirmed write
        await engine.execute(_make_request(value=100.0))
        # Rejected write (out of range)
        await engine.execute(_make_request(value=999.0))

        stats = engine.get_stats()
        assert stats["confirmed"] == 1
        assert stats["rejected"] == 1
        assert stats["total_writes"] == 2
        assert stats["tag_configs"] == 4
        assert stats["permissions"] == 1


# ---------------------------------------------------------------------------
# Listeners
# ---------------------------------------------------------------------------


class TestListeners:
    @pytest.mark.asyncio
    async def test_listener_notified(self):
        engine = _build_engine()
        listener = AsyncMock()
        engine.add_listener(listener)

        req = _make_request(value=100.0)
        result = await engine.execute(req)

        await engine.notify_listeners(result)
        listener.on_write_result.assert_called_once_with(result)

    @pytest.mark.asyncio
    async def test_listener_exception_isolated(self):
        engine = _build_engine()
        bad_listener = AsyncMock()
        bad_listener.on_write_result = AsyncMock(side_effect=RuntimeError("boom"))
        good_listener = AsyncMock()

        engine.add_listener(bad_listener)
        engine.add_listener(good_listener)

        result = await engine.execute(_make_request(value=100.0))
        await engine.notify_listeners(result)

        # Bad listener threw, but good listener still called
        good_listener.on_write_result.assert_called_once()

    @pytest.mark.asyncio
    async def test_remove_listener(self):
        engine = _build_engine()
        listener = AsyncMock()
        engine.add_listener(listener)
        engine.remove_listener(listener)

        result = await engine.execute(_make_request(value=100.0))
        await engine.notify_listeners(result)

        listener.on_write_result.assert_not_called()


# ---------------------------------------------------------------------------
# Timing fields
# ---------------------------------------------------------------------------


class TestTiming:
    @pytest.mark.asyncio
    async def test_timing_populated_on_success(self):
        engine = _build_engine()
        result = await engine.execute(_make_request(value=100.0))

        assert result.write_sent_at is not None
        assert result.readback_at is not None
        assert result.completed_at is not None
        assert result.write_sent_at <= result.readback_at <= result.completed_at

    @pytest.mark.asyncio
    async def test_timing_populated_on_rejection(self):
        engine = _build_engine()
        result = await engine.execute(_make_request(value=999.0))

        # Rejected before write — no timing
        assert result.write_sent_at is None
        assert result.completed_at is None
