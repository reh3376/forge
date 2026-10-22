"""RecordContext: the registry's slots, the shift alias and the lift from extra (FB-013)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from forge.core.models.contextual_record import RecordContext

T0 = datetime(2026, 4, 5, 14, 30, tzinfo=UTC)
NAIVE = datetime(2026, 4, 5, 14, 30)  # noqa: DTZ001


class TestShiftAlias:
    def test_shift_is_accepted_for_shift_id(self) -> None:
        assert RecordContext(shift="B").shift_id == "B"
        assert RecordContext(shift_id="B").shift == "B"
        assert RecordContext.model_validate({"shift": "B"}).shift_id == "B"

    def test_shift_attribute_writes_shift_id(self) -> None:
        ctx = RecordContext()
        ctx.shift = "Night"
        assert ctx.shift_id == "Night"
        assert ctx.model_dump()["shift_id"] == "Night"
        assert "shift" not in ctx.model_dump()


class TestRegistrySlots:
    def test_three_new_slots(self) -> None:
        ctx = RecordContext(event_type="step.started", event_timestamp=T0, work_order_id="WO-1")
        assert (ctx.event_type, ctx.event_timestamp, ctx.work_order_id) == (
            "step.started",
            T0,
            "WO-1",
        )

    def test_naive_event_timestamp_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            RecordContext(event_timestamp=NAIVE)


class TestLiftFromExtra:
    def test_registry_fields_leave_extra(self) -> None:
        ctx = RecordContext(
            extra={
                "shift": "B",
                "event_type": "x",
                "work_order_id": "WO-1",
                "event_timestamp": "2026-04-05T14:30:00Z",
                "line": "L1",
            }
        )
        assert ctx.shift_id == "B"
        assert ctx.event_type == "x"
        assert ctx.work_order_id == "WO-1"
        assert ctx.event_timestamp == T0
        assert ctx.extra == {"line": "L1"}

    def test_slot_wins_and_extra_keeps_its_copy(self) -> None:
        ctx = RecordContext(event_type="slot", extra={"event_type": "extra"})
        assert ctx.event_type == "slot"
        assert ctx.extra == {"event_type": "extra"}

    def test_naive_or_unparseable_event_timestamp_stays(self) -> None:
        for sent in ("2026-04-05T14:30:00", "not a time", NAIVE):
            ctx = RecordContext(extra={"event_timestamp": sent})
            assert ctx.event_timestamp is None
            assert ctx.extra == {"event_timestamp": sent}

    def test_empty_values_are_not_lifted(self) -> None:
        ctx = RecordContext(extra={"event_type": "", "work_order_id": None})
        assert ctx.event_type is None and ctx.work_order_id is None
        assert ctx.extra == {"event_type": "", "work_order_id": None}
