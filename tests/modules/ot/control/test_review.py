"""Write review gate (FB-074): server-side two-step review tokens and reason codes."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from forge.modules.ot.control import (
    ConfirmationMode,
    ControlWriteEngine,
    DataType,
    InterlockCondition,
    InterlockEngine,
    InterlockRule,
    TagWriteConfig,
    WriteAuthorizer,
    WriteOrigin,
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteReviewer,
    WriteRole,
    WriteStatus,
    WriteValidator,
)

SP = "WH/WHK01/Cooker01/TIT_2010/SP"  # two-step review + reason code
RR = "WH/WHK01/Cooker01/TIT_2010/RampRate"  # one step, no reason code
PUMP = "WH/WHK01/Cooker01/Pump01/Running"


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


class Plc:
    def __init__(self) -> None:
        self.values: dict[str, Any] = {SP: 150.0, RR: 2.0, PUMP: False}
        self.unreadable: set[str] = set()

    async def read_tag(self, tag_path: str) -> Any:
        if tag_path in self.unreadable:
            msg = f"{tag_path} unreadable"
            raise ConnectionError(msg)
        return self.values.get(tag_path)

    async def write_tag(self, tag_path: str, value: Any) -> None:
        self.values[tag_path] = value


def validator() -> WriteValidator:
    v = WriteValidator()
    v.register_tag(
        TagWriteConfig(
            tag_path=SP,
            data_type=DataType.FLOAT,
            min_value=0.0,
            max_value=212.0,
            engineering_units="degF",
            confirmation=ConfirmationMode.TWO_STEP_WITH_REVIEW,
            reason_code_required=True,
        )
    )
    v.register_tag(TagWriteConfig(tag_path=RR, data_type=DataType.FLOAT, min_value=0, max_value=10))
    return v


def build(
    *,
    reason_codes: tuple[str, ...] = ("setpoint_tune", "quality_hold"),
    timeout: float = 120.0,
    max_pending: int = 1000,
    permissions: bool = True,
) -> tuple[ControlWriteEngine, Plc, Clock]:
    clock = Clock()
    plc = Plc()
    v = validator()
    interlocks = InterlockEngine(tag_reader=plc)
    interlocks.add_rule(
        InterlockRule(
            rule_id="IL-PUMP",
            name="No setpoint change while the pump runs",
            target_tag_pattern="WH/WHK01/Cooker01/TIT_2010/*",
            check_tag=PUMP,
            condition=InterlockCondition.IS_TRUE,
        )
    )
    authorizer = WriteAuthorizer()
    if permissions:
        authorizer.add_permission(
            WritePermission(permission_id="ops", area_pattern="*", tag_pattern="**")
        )
    reviewer = WriteReviewer(
        v, timeout_seconds=timeout, reason_codes=reason_codes, max_pending=max_pending, now=clock
    )
    engine = ControlWriteEngine(
        validator=v,
        interlock_engine=interlocks,
        authorizer=authorizer,
        tag_writer=plc,
        reviewer=reviewer,
    )
    return engine, plc, clock


def req(tag_path: str = SP, value: Any = 152.0, **kw: Any) -> WriteRequest:
    fields: dict[str, Any] = {
        "requestor": "op1",
        "role": WriteRole.OPERATOR,
        "area": "cooker",
        "equipment_id": "Cooker01",
        "reason": "tune after product change",
        "reason_code": "setpoint_tune",
    }
    fields.update(kw)
    return WriteRequest(tag_path=tag_path, value=value, **fields)


# ---------------------------------------------------------------------------
# WriteReviewer
# ---------------------------------------------------------------------------


class TestReviewer:
    def test_stage_issues_a_bound_ticket(self) -> None:
        engine, _plc, clock = build(timeout=60)
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(value=152), current_value=150.0)

        assert len(ticket.review_token) >= 32
        assert ticket.tag_path == SP and ticket.value == 152.0 and ticket.current_value == 150.0
        assert ticket.requestor == "op1" and ticket.reason_code == "setpoint_tune"
        assert ticket.staged_at == clock.now
        assert ticket.expires_at == clock.now + timedelta(seconds=60)
        assert ticket.engineering_units == "degF" and ticket.max_value == 212.0
        assert ticket.confirmation is ConfirmationMode.TWO_STEP_WITH_REVIEW
        assert ticket.reason_code_required is True

        payload = ticket.to_dict()
        assert payload["status"] == "STAGED" and payload["review_token"] == ticket.review_token
        listed = reviewer.pending()
        assert len(listed) == 1 and "review_token" not in listed[0]
        assert listed[0]["requested_value"] == 152.0 and listed[0]["current_value"] == 150.0
        assert reviewer.pending_count == 1
        assert reviewer.get(ticket.review_token) is ticket
        assert reviewer.stats() == {
            "pending": 1,
            "staged": 1,
            "committed": 0,
            "expired": 0,
            "rejected": 0,
            "cancelled": 0,
            "timeout_seconds": 60.0,
            "reason_codes": ["quality_hold", "setpoint_tune"],
        }

    def test_token_is_single_use(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(), current_value=150.0)
        commit = req(review_token=ticket.review_token)

        first = reviewer.check(commit, WriteResult(request=commit))
        assert first.review_passed is True and first.staged_at == ticket.staged_at
        assert reviewer.pending_count == 0

        second = reviewer.check(commit, WriteResult(request=commit))
        assert second.status is WriteStatus.REJECTED_REVIEW
        assert "already used" in second.review_error
        assert reviewer.stats()["committed"] == 1 and reviewer.stats()["rejected"] == 1

    def test_token_expires(self) -> None:
        engine, _plc, clock = build(timeout=30)
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(), current_value=150.0)
        clock.advance(31)
        commit = req(review_token=ticket.review_token)
        result = reviewer.check(commit, WriteResult(request=commit))
        assert result.status is WriteStatus.REJECTED_REVIEW
        assert "expired at" in result.review_error
        assert reviewer.stats()["expired"] == 1 and reviewer.pending_count == 0

    def test_expired_tickets_are_evicted_from_listings(self) -> None:
        engine, _plc, clock = build(timeout=30)
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(), current_value=150.0)
        clock.advance(30)  # expiry is inclusive
        assert reviewer.get(ticket.review_token) is None
        assert reviewer.pending() == [] and reviewer.pending_count == 0
        assert reviewer.stats()["expired"] == 1

    @pytest.mark.parametrize(
        "change",
        [
            {"value": 160.0},
            {"requestor": "op2"},
            {"tag_path": RR, "value": 2.0},
        ],
    )
    def test_token_is_bound_to_tag_value_and_requestor(self, change: dict[str, Any]) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(), current_value=150.0)
        # RR is one-step: give it the two-step policy so the token path is exercised.
        engine.reviewer.policy_for(RR).confirmation = ConfirmationMode.TWO_STEP_WITH_REVIEW
        commit = req(review_token=ticket.review_token, **change)
        result = reviewer.check(commit, WriteResult(request=commit))
        assert result.status is WriteStatus.REJECTED_REVIEW
        assert "different write" in result.review_error
        assert reviewer.pending_count == 0  # consumed regardless

    def test_values_compare_after_coercion(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(value=152), current_value=150.0)
        commit = req(value="152.0", review_token=ticket.review_token)
        assert reviewer.check(commit, WriteResult(request=commit)).review_passed is True

    def test_reason_code_required(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        missing = req(reason_code="   ")
        result = reviewer.check(missing, WriteResult(request=missing))
        assert result.status is WriteStatus.REJECTED_REVIEW
        assert result.review_error == f"Tag {SP} requires a reason code"

        unknown = req(reason_code="because")
        result = reviewer.check(unknown, WriteResult(request=unknown))
        assert result.status is WriteStatus.REJECTED_REVIEW
        assert "'because' is not one of ['quality_hold', 'setpoint_tune']" in result.review_error

    def test_empty_vocabulary_accepts_any_code(self) -> None:
        engine, _plc, _clock = build(reason_codes=())
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(reason_code="anything"), current_value=150.0)
        commit = req(reason_code="anything", review_token=ticket.review_token)
        assert reviewer.check(commit, WriteResult(request=commit)).review_passed is True
        assert reviewer.reason_codes == frozenset()

    def test_one_step_tag_needs_no_token(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        one_step = req(tag_path=RR, value=3.0, reason_code="")
        result = reviewer.check(one_step, WriteResult(request=one_step))
        assert result.review_passed is True and result.review_error == ""
        assert reviewer.requires_two_step(RR) is False and reviewer.requires_two_step(SP) is True

    def test_system_origin_passes_the_gate(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        system = req(reason_code="", origin=WriteOrigin.SYSTEM)
        result = reviewer.check(system, WriteResult(request=system))
        assert result.review_passed is True
        assert reviewer.check_reason(system, WriteResult(request=system)) is True

    def test_pending_set_is_bounded_oldest_first(self) -> None:
        engine, _plc, _clock = build(max_pending=2)
        reviewer = engine.reviewer
        first = reviewer.stage(req(value=151), current_value=150.0)
        reviewer.stage(req(value=152), current_value=150.0)
        reviewer.stage(req(value=153), current_value=150.0)
        assert reviewer.pending_count == 2
        assert reviewer.get(first.review_token) is None
        assert reviewer.stats()["expired"] == 1

    def test_cancel(self) -> None:
        engine, _plc, _clock = build()
        reviewer = engine.reviewer
        ticket = reviewer.stage(req(), current_value=150.0)
        assert reviewer.cancel(ticket.review_token) is True
        assert reviewer.cancel(ticket.review_token) is False
        assert reviewer.stats()["cancelled"] == 1 and reviewer.pending_count == 0

    def test_stage_unknown_tag_raises(self) -> None:
        engine, _plc, _clock = build()
        with pytest.raises(LookupError, match="No write config registered"):
            engine.reviewer.stage(req(tag_path="WH/nope"), current_value=None)

    def test_rejects_invalid_settings(self) -> None:
        with pytest.raises(ValueError, match="timeout"):
            WriteReviewer(validator(), timeout_seconds=0)
        with pytest.raises(ValueError, match="max_pending"):
            WriteReviewer(validator(), max_pending=0)

    def test_engine_builds_a_default_reviewer(self) -> None:
        engine = ControlWriteEngine(
            validator=validator(), interlock_engine=InterlockEngine(), authorizer=WriteAuthorizer()
        )
        assert engine.reviewer.timeout == timedelta(seconds=120)
        assert engine.reviewer.reason_codes == frozenset()


# ---------------------------------------------------------------------------
# Through the engine
# ---------------------------------------------------------------------------


class TestEngineTwoStep:
    async def test_stage_then_commit(self) -> None:
        engine, plc, _clock = build()
        listener = AsyncMock()
        engine.add_listener(listener)

        staged = await engine.stage(req(value=152.0))
        assert staged.accepted and staged.result is None
        ticket = staged.ticket
        assert ticket is not None and ticket.current_value == 150.0
        assert engine.get_journal() == []  # nothing written, nothing journaled
        listener.on_write_result.assert_not_called()
        assert staged.to_dict()["status"] == "STAGED"

        result = await engine.execute(req(value=152.0, review_token=ticket.review_token))
        assert result.status is WriteStatus.CONFIRMED
        assert result.review_passed is True and result.staged_at == ticket.staged_at
        assert plc.values[SP] == 152.0
        journal = engine.get_journal()
        assert len(journal) == 1 and journal[0]["status"] == "CONFIRMED"
        assert journal[0]["review_passed"] is True
        assert journal[0]["staged_at"] == ticket.staged_at.isoformat()
        assert journal[0]["reason_code"] == "setpoint_tune" and journal[0]["origin"] == "OPERATOR"
        assert journal[0]["stage_attempt"] is False
        stats = engine.get_stats()
        assert stats["confirmed"] == 1 and stats["review"]["committed"] == 1
        assert stats["review"]["pending"] == 0

    async def test_commit_without_stage_is_rejected_before_interlocks(self) -> None:
        engine, plc, _clock = build()
        result = await engine.execute(req(value=152.0))
        assert result.status is WriteStatus.REJECTED_REVIEW
        assert result.validation_passed is True
        assert result.review_passed is False and "stage the write" in result.review_error
        assert result.interlock_passed is False and result.auth_passed is False
        assert plc.values[SP] == 150.0
        assert engine.get_journal()[0]["status"] == "REJECTED_REVIEW"
        assert engine.get_stats()["rejected"] == 1

    async def test_rejected_stage_is_journaled_and_audited(self) -> None:
        engine, _plc, _clock = build()
        listener = AsyncMock()
        engine.add_listener(listener)

        staged = await engine.stage(req(value=999.0))
        assert not staged.accepted and staged.ticket is None
        assert staged.result is not None
        assert staged.result.status is WriteStatus.REJECTED_VALIDATION
        assert staged.result.stage_attempt is True
        assert staged.to_dict()["status"] == "REJECTED_VALIDATION"
        journal = engine.get_journal()
        assert len(journal) == 1 and journal[0]["stage_attempt"] is True
        listener.on_write_result.assert_called_once_with(staged.result)
        assert engine.reviewer.pending_count == 0

    async def test_stage_enforces_reason_interlocks_and_authorization(self) -> None:
        engine, plc, _clock = build()
        no_reason = await engine.stage(req(reason_code=""))
        assert no_reason.result is not None
        assert no_reason.result.status is WriteStatus.REJECTED_REVIEW
        assert no_reason.result.stage_attempt is True

        plc.values[PUMP] = True
        blocked = await engine.stage(req())
        assert blocked.result is not None
        assert blocked.result.status is WriteStatus.REJECTED_INTERLOCK
        assert blocked.result.interlock_rule_id == "IL-PUMP"
        plc.values[PUMP] = False

        unauthorised, _plc2, _clock2 = build(permissions=False)
        denied = await unauthorised.stage(req())
        assert denied.result is not None and denied.result.status is WriteStatus.REJECTED_AUTH

        assert engine.reviewer.pending_count == 0

    async def test_interlock_change_between_stage_and_commit_consumes_the_token(self) -> None:
        engine, plc, _clock = build()
        staged = await engine.stage(req())
        assert staged.ticket is not None
        token = staged.ticket.review_token

        plc.values[PUMP] = True
        result = await engine.execute(req(review_token=token))
        assert result.status is WriteStatus.REJECTED_INTERLOCK
        assert result.review_passed is True  # the gate passed; the interlock did not
        assert plc.values[SP] == 150.0

        plc.values[PUMP] = False
        again = await engine.execute(req(review_token=token))
        assert again.status is WriteStatus.REJECTED_REVIEW
        assert "already used" in again.review_error

    async def test_stage_reads_the_current_value_best_effort(self) -> None:
        engine, plc, _clock = build()
        plc.unreadable.add(SP)  # the interlock's check tag still reads
        staged = await engine.stage(req())
        assert staged.accepted and staged.ticket is not None
        assert staged.ticket.current_value is None

    async def test_system_writes_skip_review_not_the_rest_of_the_chain(self) -> None:
        engine, plc, _clock = build()
        confirmed = await engine.execute(req(reason_code="", origin=WriteOrigin.SYSTEM))
        assert confirmed.status is WriteStatus.CONFIRMED and plc.values[SP] == 152.0
        assert confirmed.review_passed is True
        assert engine.get_journal()[0]["origin"] == "SYSTEM"

        out_of_range = await engine.execute(req(value=999.0, origin=WriteOrigin.SYSTEM))
        assert out_of_range.status is WriteStatus.REJECTED_VALIDATION

        plc.values[PUMP] = True
        blocked = await engine.execute(req(value=151.0, origin=WriteOrigin.SYSTEM))
        assert blocked.status is WriteStatus.REJECTED_INTERLOCK

    async def test_one_step_tag_commits_directly(self) -> None:
        engine, plc, _clock = build()
        result = await engine.execute(req(tag_path=RR, value=3.5, reason_code=""))
        assert result.status is WriteStatus.CONFIRMED and plc.values[RR] == 3.5
        assert result.review_passed is True and result.staged_at is None

    async def test_replace_keeps_the_request_frozen(self) -> None:
        engine, _plc, _clock = build()
        original = req()
        staged = await engine.stage(original)
        assert staged.ticket is not None
        commit = replace(original, review_token=staged.ticket.review_token)
        assert original.review_token == "" and commit.request_id == original.request_id
        assert (await engine.execute(commit)).status is WriteStatus.CONFIRMED
