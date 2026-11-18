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
    SPOKE_MEASURED_AT_HEADER,
    SPOKE_OFFSET_HEADER,
    SPOKE_PROBE_MIN_INTERVAL_SECONDS,
    SPOKE_ROUND_TRIP_HEADER,
    SPOKE_TRANSMIT_TIME_HEADER,
    TOLERANCE_CLASS_SECONDS,
    ClockGate,
    ClockOffsetTracker,
    ClockRefusedError,
    SpokeClockGates,
    spoke_clock_id,
    tolerance_for_class,
)
from forge.core.models.adapter import (
    ConnectionTimeGovernance,
    SpokeTime,
    TimeGovernance,
    ToleranceClass,
)
from forge.transport.serialization import headers_to_spoke_time, spoke_time_to_headers

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
        "forge-ot", SERVER_LINK, 0.05, T, clock_id="server:WHK01", tolerance_seconds=0.010
    )
    assert stats.tolerance_seconds == 0.010 and stats.within_tolerance is False
    # a series measured without a declared class keeps the tracker's own tolerance
    other = tracker.observe("forge-ot", SERVER_LINK, 0.05, T)
    assert other.tolerance_seconds == 1.0 and other.within_tolerance is True
    # a class change (a device moving to PTP declares T1) takes effect on the next sample
    stats = tracker.observe(
        "forge-ot", SERVER_LINK, 0.005, T, clock_id="server:WHK01", tolerance_seconds=0.001
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


# ---------------------------------------------------------------------------
# The hub's gate on each spoke's clock (FB-093, hub half)
# ---------------------------------------------------------------------------


def _probe(gates: SpokeClockGates, n: int, offset: float | None, **kw: object):
    """The ``n``-th request of forge-mes, 30 s after the one before, reporting ``offset``."""
    at = T + timedelta(seconds=30 * n)
    if offset is None:
        return gates.probe("forge-mes", at, **kw)  # type: ignore[arg-type]
    return gates.probe(
        "forge-mes",
        at,
        offset_seconds=offset,
        round_trip_seconds=0.004,
        measured_at=at - timedelta(seconds=1),
        **kw,  # type: ignore[arg-type]
    )


def test_a_spoke_is_gated_from_its_first_register_on_the_class_it_declared() -> None:
    gates = SpokeClockGates()
    assert gates.state("forge-mes") == CLOCK_OK and gates.refusal("forge-mes") is None
    assert gates.probe("forge-mes", T).counted is False  # not declared: nothing to judge
    gate = gates.declare("forge-mes", "it-lan")
    assert gate.clock_id == spoke_clock_id("forge-mes") == "spoke:forge-mes"
    assert gate.tolerance_seconds == 0.010 and gate.threshold == FAIL_CLOSED_PROBES
    # registering again keeps the gate, so a refusal is not shed; a new class is taken up
    assert gates.declare("forge-mes", "it-lan") is gate
    assert gates.declare("forge-mes", "it-wan") is gate and gate.tolerance_seconds == 0.100


def test_three_reported_offsets_outside_the_class_refuse_the_spoke_and_three_good_clear() -> None:
    gates = SpokeClockGates()
    gates.declare("forge-mes", "it-lan")
    # the spoke reports hub minus spoke: -0.25 means its clock is 250 ms ahead of the hub's
    assert _probe(gates, 1, -0.25).transition is None
    assert _probe(gates, 2, -0.25).transition is None
    entered = _probe(gates, 3, -0.25).transition
    assert entered is not None and entered.state == CLOCK_OUT_OF_TOLERANCE
    refusal = gates.refusal("forge-mes")
    assert refusal is not None and refusal.cause == "clock_out_of_tolerance"
    assert str(refusal).startswith("CLOCK_OUT_OF_TOLERANCE: clock spoke:forge-mes is +0.250000 s")
    assert gates.refused() == {"forge-mes": CLOCK_OUT_OF_TOLERANCE}

    assert _probe(gates, 4, 0.002).transition is None
    assert _probe(gates, 5, 0.002).transition is None
    cleared = _probe(gates, 6, 0.002).transition
    assert cleared is not None and cleared.state == CLOCK_OK and not cleared.refused
    assert gates.refusal("forge-mes") is None and gates.refused() == {}


def test_requests_without_a_measurement_are_a_clock_the_hub_cannot_read() -> None:
    gates = SpokeClockGates()
    gates.declare("forge-mes", "it-lan")
    # a first Register cannot carry a measurement: it is not held against the spoke
    first = _probe(gates, 0, None, first_contact=True)
    assert first.counted is False and first.transition is None
    assert _probe(gates, 1, None).counted is True
    assert _probe(gates, 2, None).transition is None
    entered = _probe(gates, 3, None).transition
    assert entered is not None and entered.state == CLOCK_UNREADABLE
    refusal = gates.refusal("forge-mes")
    assert refusal is not None and refusal.cause == "clock_unreadable"
    assert "carried no time-exchange measurement" in str(refusal)
    # a Register that reports one is a probe: this is how a refused spoke comes back
    assert _probe(gates, 4, 0.001, first_contact=True).counted is True


def test_a_measurement_already_judged_is_not_a_new_probe() -> None:
    gates = SpokeClockGates()
    gates.declare("forge-mes", "it-lan")
    measured_at = T
    for n in range(1, 6):  # the same report five times over, 30 s apart
        probe = gates.probe(
            "forge-mes",
            T + timedelta(seconds=30 * n),
            offset_seconds=-0.25,
            round_trip_seconds=0.004,
            measured_at=measured_at,
        )
        assert probe.fresh is (n == 1) and probe.counted is (n == 1)
    assert gates.state("forge-mes") == CLOCK_OK


def test_at_most_one_probe_a_second_is_counted() -> None:
    assert SPOKE_PROBE_MIN_INTERVAL_SECONDS == 1.0  # the record's floor for a probe cadence
    gates = SpokeClockGates()
    gates.declare("forge-mes", "it-lan")
    for i in range(5):  # five bad measurements inside one second
        at = T + timedelta(milliseconds=100 * i)
        probe = gates.probe(
            "forge-mes", at, offset_seconds=-0.25, round_trip_seconds=0.004, measured_at=at
        )
        assert probe.fresh is True  # each belongs on the series
        assert probe.counted is (i == 0)  # one is a probe
    assert gates.state("forge-mes") == CLOCK_OK
    description = gates.describe_gate("forge-mes")
    assert description is not None and description["consecutive_out_of_tolerance"] == 1


def test_refused_requests_are_counted_by_cause_and_described() -> None:
    gates = SpokeClockGates()
    gates.declare("forge-mes", "it-lan")
    for n in (1, 2, 3):
        _probe(gates, n, -0.25)
    gates.note_refused("forge-mes", "clock_out_of_tolerance")
    gates.note_refused("forge-mes", "clock_out_of_tolerance")
    gates.note_refused("unknown-spoke", "clock_out_of_tolerance")  # no gate: nothing to count
    assert gates.refused_requests("forge-mes") == {"clock_out_of_tolerance": 2}
    assert gates.refused_requests("unknown-spoke") == {}
    described = gates.describe()
    assert described["threshold_probes"] == 3 and described["min_probe_interval_seconds"] == 1.0
    spoke = described["spokes"]["forge-mes"]
    assert spoke["state"] == CLOCK_OUT_OF_TOLERANCE and spoke["tolerance_class"] == "it-lan"
    assert spoke["last_offset_seconds"] == 0.25 and spoke["last_round_trip_seconds"] == 0.004
    assert spoke["refused_requests"] == {"clock_out_of_tolerance": 2}
    assert gates.describe_gate("unknown-spoke") is None


def test_the_measurement_rides_in_ingest_headers_and_reads_back() -> None:
    measured = SpokeTime(
        transmit_time=T,
        offset_seconds=-0.0125,
        round_trip_seconds=0.004,
        measured_at=T - timedelta(seconds=30),
    )
    headers = dict(spoke_time_to_headers(measured))
    assert set(headers) == {
        SPOKE_TRANSMIT_TIME_HEADER,
        SPOKE_OFFSET_HEADER,
        SPOKE_ROUND_TRIP_HEADER,
        SPOKE_MEASURED_AT_HEADER,
    }
    assert headers_to_spoke_time(headers) == measured
    # before its first exchange a spoke has only T1 to send
    first = SpokeTime(transmit_time=T)
    assert dict(spoke_time_to_headers(first)) == {SPOKE_TRANSMIT_TIME_HEADER: T.isoformat()}
    assert headers_to_spoke_time(dict(spoke_time_to_headers(first))) == first
    assert headers_to_spoke_time({}) is None  # no T1: the spoke sent no time at all


def test_a_malformed_measurement_header_is_read_as_no_measurement(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Never taken for a good one: the request then counts as a clock the hub could not read."""
    headers = {
        SPOKE_TRANSMIT_TIME_HEADER: T.isoformat(),
        SPOKE_OFFSET_HEADER: "about right",
        SPOKE_ROUND_TRIP_HEADER: "0.004",
    }
    with caplog.at_level("WARNING", logger="forge.transport.serialization"):
        read = headers_to_spoke_time(headers)
    assert read == SpokeTime(transmit_time=T)
    assert "x-forge-spoke-offset-seconds='about right'" in caplog.text
    assert headers_to_spoke_time({SPOKE_TRANSMIT_TIME_HEADER: "noon"}) is None
    naive = {SPOKE_TRANSMIT_TIME_HEADER: "2026-06-01T08:00:00"}  # no offset: names no instant
    assert headers_to_spoke_time(naive) is None
    for not_finite in ("nan", "inf"):
        headers[SPOKE_OFFSET_HEADER] = not_finite
        assert headers_to_spoke_time(headers) == SpokeTime(transmit_time=T)
