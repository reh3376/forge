"""ClockSample: one NTP-style reading of a remote clock (one-clock record P-2, FB-094)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from forge.core.clock import ClockReader, ClockSample

T1 = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)


def test_offset_is_taken_at_the_round_trip_midpoint() -> None:
    sample = ClockSample(
        sent_at=T1,
        server_time=T1 + timedelta(seconds=3.010),
        received_at=T1 + timedelta(milliseconds=20),
        service="CurrentTime",
    )
    assert sample.round_trip_seconds == pytest.approx(0.020)
    assert sample.offset_seconds == pytest.approx(3.0)  # 3.010 - 0.010 (the midpoint)
    assert sample.uncertainty_seconds == pytest.approx(0.010)
    assert sample.service == "CurrentTime"


def test_a_clock_behind_forge_s_gives_a_negative_offset() -> None:
    sample = ClockSample(T1, T1 - timedelta(seconds=2), T1 + timedelta(milliseconds=4))
    assert sample.offset_seconds == pytest.approx(-2.002)
    assert sample.uncertainty_seconds == pytest.approx(0.002)


def test_a_reader_is_anything_that_reads_a_clock() -> None:
    class _Reader:
        async def read_clock(self) -> ClockSample | None:
            return None

    reader: ClockReader = _Reader()
    assert hasattr(reader, "read_clock")
