"""Tests for shift resolver."""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from forge.context.models import ShiftSchedule
from forge.context.shift import build_louisville_schedule, resolve_shift

_LOU_TZ = ZoneInfo("America/Kentucky/Louisville")


class TestResolveShift:
    def _schedule(self) -> ShiftSchedule:
        return build_louisville_schedule()

    def test_day_shift_morning(self):
        ts = datetime(2026, 4, 15, 10, 0, 0, tzinfo=_LOU_TZ)
        assert resolve_shift(self._schedule(), ts) == "Day"

    def test_day_shift_start(self):
        ts = datetime(2026, 4, 15, 6, 0, 0, tzinfo=_LOU_TZ)
        assert resolve_shift(self._schedule(), ts) == "Day"

    def test_night_shift_evening(self):
        ts = datetime(2026, 4, 15, 20, 0, 0, tzinfo=_LOU_TZ)
        assert resolve_shift(self._schedule(), ts) == "Night"

    def test_night_shift_start(self):
        ts = datetime(2026, 4, 15, 18, 0, 0, tzinfo=_LOU_TZ)
        assert resolve_shift(self._schedule(), ts) == "Night"

    def test_night_shift_early_morning(self):
        ts = datetime(2026, 4, 15, 3, 0, 0, tzinfo=_LOU_TZ)
        assert resolve_shift(self._schedule(), ts) == "Night"

    def test_utc_timestamp_converts(self):
        # 14:00 UTC on Apr 15 = 10:00 Louisville (EDT, UTC-4)
        from datetime import UTC
        ts = datetime(2026, 4, 15, 14, 0, 0, tzinfo=UTC)
        assert resolve_shift(self._schedule(), ts) == "Day"

    def test_empty_schedule_returns_none(self):
        schedule = ShiftSchedule(site="empty", shifts=[])
        from datetime import UTC
        ts = datetime(2026, 4, 15, 10, 0, 0, tzinfo=UTC)
        assert resolve_shift(schedule, ts) is None


class TestBuildLouisvilleSchedule:
    def test_has_two_shifts(self):
        schedule = build_louisville_schedule()
        assert len(schedule.shifts) == 2

    def test_day_shift(self):
        schedule = build_louisville_schedule()
        day = schedule.shifts[0]
        assert day.name == "Day"
        assert day.start_time == time(6, 0)
        assert day.end_time == time(18, 0)

    def test_night_shift(self):
        schedule = build_louisville_schedule()
        night = schedule.shifts[1]
        assert night.name == "Night"
        assert night.start_time == time(18, 0)
        assert night.end_time == time(6, 0)

    def test_custom_site(self):
        schedule = build_louisville_schedule("Custom-Site")
        assert schedule.site == "Custom-Site"
