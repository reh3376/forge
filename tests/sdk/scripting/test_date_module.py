"""Tests for the forge.date SDK module."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from forge.sdk.scripting.modules.date import DateModule, _java_to_strftime


# ---------------------------------------------------------------------------
# Java format conversion
# ---------------------------------------------------------------------------


class TestJavaToStrftime:
    """Tests for Java SimpleDateFormat → Python strftime conversion."""

    def test_full_datetime(self):
        assert _java_to_strftime("yyyy-MM-dd HH:mm:ss") == "%Y-%m-%d %H:%M:%S"

    def test_date_only(self):
        assert _java_to_strftime("yyyy-MM-dd") == "%Y-%m-%d"

    def test_time_only(self):
        assert _java_to_strftime("HH:mm:ss") == "%H:%M:%S"

    def test_with_millis(self):
        assert _java_to_strftime("HH:mm:ss.SSS") == "%H:%M:%S.%f"

    def test_short_year(self):
        assert _java_to_strftime("yy-MM-dd") == "%y-%m-%d"

    def test_12_hour(self):
        assert _java_to_strftime("hh:mm a") == "%I:%M %p"

    def test_day_names(self):
        assert _java_to_strftime("EEEE, MMMM dd") == "%A, %B %d"

    def test_python_format_passthrough(self):
        """Python format strings (starting with %) should be used directly."""
        dm = DateModule()
        now = dm.now()
        result = dm.format(now, "%Y-%m-%d")
        assert len(result) == 10  # e.g., "2026-04-09"


# ---------------------------------------------------------------------------
# DateModule
# ---------------------------------------------------------------------------


class TestDateModule:
    """Tests for the DateModule."""

    def setup_method(self):
        self.dm = DateModule()

    def test_now_utc(self):
        dt = self.dm.now()
        assert dt.tzinfo is not None
        assert dt.tzinfo == ZoneInfo("UTC")

    def test_now_custom_tz(self):
        dt = self.dm.now("America/Chicago")
        assert dt.tzinfo is not None

    def test_format_default(self):
        dt = datetime(2026, 4, 9, 12, 30, 45, tzinfo=timezone.utc)
        result = self.dm.format(dt)
        assert result == "2026-04-09 12:30:45"

    def test_format_date_only(self):
        dt = datetime(2026, 4, 9, tzinfo=timezone.utc)
        result = self.dm.format(dt, "yyyy-MM-dd")
        assert result == "2026-04-09"

    def test_parse_default(self):
        result = self.dm.parse("2026-04-09 12:30:45")
        assert result.year == 2026
        assert result.month == 4
        assert result.day == 9
        assert result.hour == 12
        assert result.tzinfo is not None

    def test_parse_with_tz(self):
        result = self.dm.parse("2026-04-09 12:30:45", tz="America/Chicago")
        assert result.tzinfo == ZoneInfo("America/Chicago")

    def test_to_millis(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        millis = self.dm.to_millis(dt)
        assert isinstance(millis, int)
        assert millis > 0

    def test_from_millis_roundtrip(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        millis = self.dm.to_millis(dt)
        roundtrip = self.dm.from_millis(millis)
        assert roundtrip.year == 2026
        assert roundtrip.hour == 12

    def test_midnight(self):
        dt = datetime(2026, 4, 9, 14, 30, 45, tzinfo=timezone.utc)
        m = self.dm.midnight(dt)
        assert m.hour == 0
        assert m.minute == 0
        assert m.second == 0
        assert m.day == 9

    def test_add_hours(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        result = self.dm.add_hours(dt, 3)
        assert result.hour == 15

    def test_add_hours_negative(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        result = self.dm.add_hours(dt, -5)
        assert result.hour == 7

    def test_add_minutes(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        result = self.dm.add_minutes(dt, 45)
        assert result.minute == 45

    def test_add_days(self):
        dt = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        result = self.dm.add_days(dt, 10)
        assert result.day == 19

    def test_seconds_between(self):
        dt1 = datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc)
        dt2 = datetime(2026, 4, 9, 12, 5, 0, tzinfo=timezone.utc)
        assert self.dm.seconds_between(dt1, dt2) == 300.0

    def test_get_hour(self):
        dt = datetime(2026, 4, 9, 14, 0, 0, tzinfo=timezone.utc)
        assert self.dm.get_hour(dt) == 14

    def test_get_year(self):
        dt = datetime(2026, 4, 9, tzinfo=timezone.utc)
        assert self.dm.get_year(dt) == 2026

    def test_get_day_of_year(self):
        dt = datetime(2026, 1, 1, tzinfo=timezone.utc)
        assert self.dm.get_day_of_year(dt) == 1
        dt2 = datetime(2026, 12, 31, tzinfo=timezone.utc)
        assert self.dm.get_day_of_year(dt2) == 365

    def test_get_timezone_offset_utc(self):
        dt = datetime(2026, 4, 9, tzinfo=timezone.utc)
        assert self.dm.get_timezone_offset(dt) == 0.0

    def test_set_default_timezone(self):
        dm = DateModule()
        dm.set_default_timezone("America/Chicago")
        dt = dm.now()
        # Chicago is UTC-5 or UTC-6 depending on DST
        offset = dm.get_timezone_offset(dt)
        assert offset in (-5.0, -6.0)
