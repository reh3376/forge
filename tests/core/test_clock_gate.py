"""Fail closed on a clock: the gate and the tolerance classes (FB-093).

One-clock record P-5 (three consecutive probes in, three out; owner, Q-4) and P-8 (the
tolerance of each link class; owner, Q-1).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import get_args

import pytest

from forge.core.clock import (
    CLOCK_OK,
    CLOCK_OUT_OF_TOLERANCE,
    CLOCK_UNREADABLE,
    FAIL_CLOSED_PROBES,
    SERVER_LINK,
    TOLERANCE_CLASS_SECONDS,
    ClockGate,
    ClockOffsetTracker,
    ClockRefusedError,
    tolerance_for_class,
)
from forge.core.models.adapter import ConnectionTimeGovernance, TimeGovernance, ToleranceClass

T = datetime(2026, 6, 1, 8, tzinfo=UTC)


def test_the_tolerance_classes_are_the_ones_the_owner_approved() -> None:
    # one-clock record P-8, approved as proposed (Q-1, 2026-11-03)
    assert tolerance_for_class("T1") == 0.001
    assert tolerance_for_class("T0") == 0.010
    assert tolerance_for_class("it-lan") == 0.010
    assert tolerance_for_class("it-wan") == 0.100
    assert tolerance_for_class("edge-mqtt") == 0.500
    # every class a manifest may declare has a tolerance, so no declared link is ungated
    assert set(get_args(ToleranceClass)) == set(TOLERANCE_CLASS_SECONDS)
    with pytest.raises(ValueError, match="unknown tolerance class 'T9'"):
        tolerance_for_class("T9")
    assert FAIL_CLOSED_PROBES == 3


def test_three_consecutive_unreadable_probes_refuse_and_three_good_ones_clear() -> None:
    gate = ClockGate("server:WHK01", tolerance_class="T0")
    assert gate.state == CLOCK_OK and gate.tolerance_seconds == 0.010
    assert gate.observe(None, T) is None
    assert gate.observe(None, T) is None
    assert not gate.refused  # two probes are not three

    entered = gate.observe(None, T, detail="the server answered without a clock value")
    assert entered is not None and entered.refused
    assert entered.previous == CLOCK_OK and entered.state == CLOCK_UNREADABLE
    assert entered.refusal_cause == "clock_unreadable" and entered.at == T
    assert "server:WHK01 could not be read for 3 consecutive probes" in entered.cause
    assert "the server answered without a clock value" in entered.cause
    assert gate.refused and gate.since == T and gate.cause == entered.cause
    assert gate.describe()["entries"] == 1

    assert gate.observe(None, T) is None  # still refused: no second transition
    assert gate.observe(0.001, T) is None
    assert gate.observe(0.001, T) is None
    assert gate.observe(None, T) is None  # a bad probe starts the count out over
    assert gate.observe(0.0, T) is None
    assert gate.observe(0.0, T) is None
    assert gate.refused
    later = T + timedelta(minutes=5)
    cleared = gate.observe(0.002, later)
    assert cleared is not None and not cleared.refused
    assert cleared.previous == CLOCK_UNREADABLE and cleared.state == CLOCK_OK
    assert "back inside tolerance class T0" in cleared.cause and cleared.at == later
    assert not gate.refused and gate.cause is None and gate.since is None


def test_out_of_tolerance_needs_three_in_a_row_and_names_the_offset_and_the_class() -> None:
    gate = ClockGate("device:WHK01", tolerance_class="T0")
    assert gate.observe(0.25, T) is None
    assert gate.observe(0.25, T) is None
    assert gate.observe(0.0, T) is None  # a good probe in between: not consecutive
    assert gate.observe(-0.25, T) is None
    assert gate.observe(-0.25, T) is None
    entered = gate.observe(-0.25, T)
    assert entered is not None and entered.state == CLOCK_OUT_OF_TOLERANCE
    assert entered.refusal_cause == "clock_out_of_tolerance"
    assert "device:WHK01 is -0.250000 s from Forge's clock" in entered.cause
    assert "tolerance class T0 allows 0.01 s" in entered.cause
    described = gate.describe()
    assert described["state"] == CLOCK_OUT_OF_TOLERANCE and described["tolerance_class"] == "T0"
    assert described["last_offset_seconds"] == -0.25 and described["threshold_probes"] == 3

    # an offset exactly at the tolerance is inside it
    edge = ClockGate("server:far", tolerance_class="it-wan")
    for _ in range(5):
        assert edge.observe(0.100, T) is None
    assert not edge.refused


def test_a_refused_clock_changes_cause_without_counting_a_second_entry() -> None:
    gate = ClockGate("server:WHK01", tolerance_class="T0")
    for _ in range(3):
        gate.observe(None, T)
    assert gate.state == CLOCK_UNREADABLE
    later = T + timedelta(minutes=2)
    assert gate.observe(0.5, later) is None
    assert gate.observe(0.5, later) is None
    changed = gate.observe(0.5, later)
    assert changed is not None and changed.refused
    assert changed.previous == CLOCK_UNREADABLE and changed.state == CLOCK_OUT_OF_TOLERANCE
    # one refusal that changed its cause: counted once, standing since the first entry
    assert gate.entries == 1 and gate.since == T


def test_the_tracker_holds_a_series_to_the_tolerance_of_its_class() -> None:
    tracker = ClockOffsetTracker(tolerance_seconds=1.0)
    stats = tracker.observe(
        "forge-ot-module", SERVER_LINK, 0.05, T, clock_id="server:WHK01", tolerance_seconds=0.010
    )
    assert stats.tolerance_seconds == 0.010 and stats.within_tolerance is False
    # a series measured without a declared class keeps the tracker's own tolerance
    other = tracker.observe("forge-ot-module", SERVER_LINK, 0.05, T)
    assert other.tolerance_seconds == 1.0 and other.within_tolerance is True
    # a class change (a device moving to PTP declares T1) takes effect on the next sample
    stats = tracker.observe(
        "forge-ot-module", SERVER_LINK, 0.005, T, clock_id="server:WHK01", tolerance_seconds=0.001
    )
    assert stats.tolerance_seconds == 0.001 and stats.within_tolerance is False


def test_time_governance_gives_the_class_each_connection_is_held_to() -> None:
    governance = TimeGovernance(
        time_source="hub-ntp",
        sync_protocol="ntp",
        source_timestamp_origin="server",
        tolerance_class="T0",
        connections=[
            ConnectionTimeGovernance(name="WHK02", tolerance_class="it-wan"),
            ConnectionTimeGovernance(name="WHK03"),
        ],
    )
    assert governance.tolerance_class_for("WHK01") == "T0"  # no entry: the spoke's default
    assert governance.tolerance_class_for("WHK02") == "it-wan"
    assert governance.tolerance_class_for("WHK03") == "T0"  # an entry without a class
    assert governance.tolerance_class_for(None) == "T0"


def test_a_clock_refusal_carries_its_cause() -> None:
    exc = ClockRefusedError("connection 'WHK01': clock unreadable", cause="clock_unreadable")
    assert exc.cause == "clock_unreadable" and isinstance(exc, ValueError)
    assert str(exc) == "connection 'WHK01': clock unreadable"
