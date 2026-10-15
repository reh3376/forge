"""PlcCipRunner: start the PLC CIP sequence through the write engine, watch it finish (FB-065)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from forge.modules.ot.control import (
    AreaChangeoverConfig,
    CipPolicy,
    ControlWriteEngine,
    DataType,
    InterlockEngine,
    PlcCipRunner,
    PlcCipSpec,
    TagWriteConfig,
    WriteAuthorizer,
    WritePermission,
    WriteRole,
    WriteStatus,
    WriteValidator,
)
from forge.modules.ot.control.cip_runner import _matches

START = "WH/WHK01/Cooker01/CIP/Start"
STATE = "WH/WHK01/Cooker01/CIP/State"
FAULT = "WH/WHK01/Cooker01/CIP/FaultCode"
FAULT_MSG = "WH/WHK01/Cooker01/CIP/FaultText"

AREA = AreaChangeoverConfig(
    area="cooker", equipment_id="Cooker01", cooker_number="1", cip_policy=CipPolicy.RUNNER
)


class ScriptedPlc:
    """TagWriter + TagReader: writes land in a dict, the state tag plays a script."""

    def __init__(self, states: list[Any], initial: Any = "Idle") -> None:
        self.values: dict[str, Any] = {STATE: initial, FAULT: 0, FAULT_MSG: ""}
        self.script = list(states)
        self.writes: list[tuple[str, Any]] = []
        self.explode_after: int | None = None
        self.reads = 0

    async def write_tag(self, tag_path: str, value: Any) -> None:
        self.writes.append((tag_path, value))
        self.values[tag_path] = value

    async def read_tag(self, tag_path: str) -> Any:
        self.reads += 1
        if self.explode_after is not None and self.reads > self.explode_after:
            msg = "OPC-UA session lost"
            raise ConnectionError(msg)
        if tag_path == STATE and self.script and self.writes:
            self.values[STATE] = self.script.pop(0)
        return self.values.get(tag_path)


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 6, 1, 8, tzinfo=UTC)
        self.slept: list[float] = []

    def now(self) -> datetime:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.t += timedelta(seconds=seconds)


def engine_for(plc: ScriptedPlc, *, permit: bool = True) -> ControlWriteEngine:
    validator = WriteValidator()
    validator.register_tag(TagWriteConfig(tag_path=START, data_type=DataType.BOOLEAN))
    authorizer = WriteAuthorizer()
    if permit:
        authorizer.add_permission(
            WritePermission(area_pattern="*", tag_pattern="*", min_role=WriteRole.ENGINEER)
        )
    return ControlWriteEngine(
        validator=validator,
        interlock_engine=InterlockEngine(tag_reader=plc),
        authorizer=authorizer,
        tag_writer=plc,
    )


def make(
    states: list[Any],
    *,
    initial: Any = "Idle",
    permit: bool = True,
    **spec_kw: Any,
) -> tuple[PlcCipRunner, ScriptedPlc, Clock, list[tuple[str, dict[str, Any]]]]:
    plc = ScriptedPlc(states, initial=initial)
    clock = Clock()
    published: list[tuple[str, dict[str, Any]]] = []

    async def on_state(area: str, payload: dict[str, Any]) -> None:
        published.append((area, payload))

    spec = PlcCipSpec(
        start_tag=START,
        state_tag=STATE,
        fault_code_tag=FAULT,
        fault_message_tag=FAULT_MSG,
        poll_interval_seconds=10,
        start_timeout_seconds=25,
        timeout_seconds=100,
        **spec_kw,
    )
    runner = PlcCipRunner(
        engine_for(plc, permit=permit),
        plc,
        {"cooker": spec},
        on_state=on_state,
        now=clock.now,
        sleep=clock.sleep,
    )
    return runner, plc, clock, published


async def test_successful_cycle_reports_times_and_publishes_states() -> None:
    runner, plc, clock, published = make(["Running", "Running", "Complete"])
    start = clock.now()

    result = await runner.run("cooker", AREA)

    assert result.success and result.started_at == start
    assert result.duration_seconds == 30.0  # three polls of 10 s
    assert plc.writes == [(START, True)]
    assert [p["state"] for _, p in published] == ["Running", "Complete"]
    assert published[-1][1]["duration"] == 30 and published[-1][1]["faultCode"] is None
    assert published[-1][1]["startTime"] == start.isoformat()
    status = runner.status()["cooker"]
    assert status["state"] == "Complete" and status["runs"] == 1 and status["failures"] == 0
    # The start write is in the journal like any other control write.
    journal = runner._engine.get_journal()
    assert journal[0]["tag_path"] == START and journal[0]["status"] == WriteStatus.CONFIRMED.value
    assert journal[0]["reason"].startswith("CIP start: cooker")


async def test_stale_complete_from_previous_cycle_is_not_trusted() -> None:
    runner, _plc, _clock, published = make(
        ["Complete", "Complete", "Running", "Complete"], initial="Complete"
    )
    result = await runner.run("cooker", AREA)
    assert result.success and result.duration_seconds == 40.0
    assert [p["state"] for _, p in published] == ["Running", "Complete"]


async def test_fault_carries_code_and_message() -> None:
    runner, plc, _clock, published = make(["Running", "Faulted"])
    plc.values[FAULT] = 17
    plc.values[FAULT_MSG] = "drain valve"

    result = await runner.run("cooker", AREA)

    assert not result.success
    assert result.detail == "PLC reported CIP fault 17: drain valve"
    assert published[-1][1]["state"] == "Faulted"
    assert published[-1][1]["faultCode"] == 17 and published[-1][1]["faultMessage"] == "drain valve"
    status = runner.status()["cooker"]
    assert status["failures"] == 1 and status["fault_code"] == 17


async def test_plc_that_never_starts_times_out() -> None:
    runner, _plc, clock, published = make(["Idle"] * 10)
    result = await runner.run("cooker", AREA)
    assert not result.success and "did not start CIP within 25s" in result.detail
    assert len(clock.slept) == 3  # 10 s polls until the 25 s start timeout
    assert published[-1][1]["state"] == "Faulted"


async def test_running_forever_hits_the_overall_timeout() -> None:
    runner, _plc, _clock, _published = make(["Running"] * 50)
    result = await runner.run("cooker", AREA)
    assert not result.success and "timed out after 100s" in result.detail
    assert result.duration_seconds == 100.0


async def test_rejected_start_write_fails_without_polling() -> None:
    runner, plc, clock, published = make(["Running", "Complete"], permit=False)
    result = await runner.run("cooker", AREA)
    assert not result.success
    assert result.detail.startswith("CIP start write REJECTED_AUTH")
    assert plc.writes == [] and clock.slept == []
    assert [p["state"] for _, p in published] == ["Faulted"]


async def test_read_failure_mid_run_fails_the_cycle() -> None:
    runner, plc, _clock, _published = make(["Running", "Running", "Complete"])
    plc.explode_after = 3  # initial read + pre-write read + first poll
    result = await runner.run("cooker", AREA)
    assert not result.success and "CIP monitoring failed" in result.detail


async def test_unknown_area_is_an_error() -> None:
    runner, _plc, _clock, _published = make(["Complete"])
    with pytest.raises(LookupError, match="fermentation"):
        await runner.run("fermentation", AREA)
    assert runner.areas == ["cooker"] and runner.spec_for("cooker") is not None


def test_spec_validation_and_value_matching() -> None:
    with pytest.raises(ValueError, match="positive"):
        PlcCipSpec(start_tag=START, state_tag=STATE, poll_interval_seconds=0)
    with pytest.raises(ValueError, match="required"):
        PlcCipSpec(start_tag="", state_tag=STATE)
    spec = PlcCipSpec(start_tag=START, state_tag=STATE, start_data_type="INT16")
    assert spec.start_data_type is DataType.INT16

    assert _matches("complete", "Complete") and _matches(2, "2") and _matches(2.0, 2)
    assert not _matches(None, "Idle") and not _matches("Running", "Complete")
    assert not _matches(True, "Complete") and not _matches("x", 1)
