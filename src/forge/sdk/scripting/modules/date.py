"""forge.date — Date/time utilities SDK module.

Replaces Ignition's ``system.date.*`` functions with Python 3.12+
equivalents using the standard ``datetime`` and ``zoneinfo`` modules.

Ignition's date functions are thin wrappers over Java's Date/Calendar
classes.  The Forge equivalents use Python-native datetime objects
with proper timezone awareness (all outputs are timezone-aware UTC
by default, with explicit timezone conversion available).

Usage in scripts::

    import forge

    now = forge.date.now()
    formatted = forge.date.format(now, "yyyy-MM-dd HH:mm:ss")
    parsed = forge.date.parse("2026-04-09 12:00:00", "yyyy-MM-dd HH:mm:ss")
    millis = forge.date.to_millis(now)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger("forge.date")


# ---------------------------------------------------------------------------
# Java → Python format conversion
# ---------------------------------------------------------------------------

# Ignition (and Java) use SimpleDateFormat patterns; Python uses strftime.
# This mapping handles the most common patterns.
_JAVA_TO_STRFTIME: list[tuple[str, str]] = [
    ("yyyy", "%Y"),
    ("yy", "%y"),
    ("MMMM", "%B"),
    ("MMM", "%b"),
    ("MM", "%m"),
    ("dd", "%d"),
    ("HH", "%H"),
    ("hh", "%I"),
    ("mm", "%M"),
    ("ss", "%S"),
    ("SSS", "%f"),
    ("a", "%p"),
    ("EEEE", "%A"),
    ("EEE", "%a"),
    ("z", "%Z"),
    ("Z", "%z"),
]


def _java_to_strftime(java_fmt: str) -> str:
    """Convert a Java SimpleDateFormat pattern to Python strftime format.

    Handles the most common patterns used in Ignition scripts.
    """
    result = java_fmt
    for java_pat, py_pat in _JAVA_TO_STRFTIME:
        result = result.replace(java_pat, py_pat)
    return result


# ---------------------------------------------------------------------------
# DateModule
# ---------------------------------------------------------------------------


class DateModule:
    """The forge.date SDK module — timezone-aware date/time utilities.

    All returned datetimes are timezone-aware (UTC by default).
    """

    def __init__(self) -> None:
        self._default_tz: ZoneInfo = ZoneInfo("UTC")

    def set_default_timezone(self, tz_name: str) -> None:
        """Set the default timezone for date operations.

        Args:
            tz_name: IANA timezone name (e.g., "America/Chicago").
        """
        self._default_tz = ZoneInfo(tz_name)
        logger.debug("Default timezone set to %s", tz_name)

    def now(self, tz: str | None = None) -> datetime:
        """Get the current date/time.

        Args:
            tz: Optional timezone name. Defaults to UTC.

        Returns:
            Timezone-aware datetime.

        Replaces: ``system.date.now()``
        """
        zone = ZoneInfo(tz) if tz else self._default_tz
        return datetime.now(tz=zone)

    def format(self, dt: datetime, fmt: str = "yyyy-MM-dd HH:mm:ss") -> str:
        """Format a datetime to a string.

        Accepts Java SimpleDateFormat patterns (for Ignition compatibility)
        or Python strftime patterns (if they start with %).

        Args:
            dt: Datetime to format.
            fmt: Format pattern.

        Returns:
            Formatted string.

        Replaces: ``system.date.format(date, formatString)``
        """
        if fmt.startswith("%"):
            py_fmt = fmt
        else:
            py_fmt = _java_to_strftime(fmt)
        return dt.strftime(py_fmt)

    def parse(self, text: str, fmt: str = "yyyy-MM-dd HH:mm:ss", tz: str | None = None) -> datetime:
        """Parse a string into a datetime.

        Args:
            text: Date string to parse.
            fmt: Format pattern (Java or Python).
            tz: Timezone to assume if the string has no timezone info.

        Returns:
            Timezone-aware datetime.

        Replaces: ``system.date.parse(dateString, formatString)``
        """
        if fmt.startswith("%"):
            py_fmt = fmt
        else:
            py_fmt = _java_to_strftime(fmt)

        dt = datetime.strptime(text, py_fmt)
        if dt.tzinfo is None:
            zone = ZoneInfo(tz) if tz else self._default_tz
            dt = dt.replace(tzinfo=zone)
        return dt

    def to_millis(self, dt: datetime) -> int:
        """Convert a datetime to epoch milliseconds.

        Replaces: ``system.date.toMillis(date)``
        """
        return int(dt.timestamp() * 1000)

    def from_millis(self, millis: int, tz: str | None = None) -> datetime:
        """Convert epoch milliseconds to a datetime.

        Replaces: ``system.date.fromMillis(millis)``
        """
        zone = ZoneInfo(tz) if tz else self._default_tz
        return datetime.fromtimestamp(millis / 1000, tz=zone)

    def midnight(self, dt: datetime | None = None) -> datetime:
        """Get midnight of the given date (or today).

        Replaces: ``system.date.midnight(date)``
        """
        d = dt or self.now()
        return d.replace(hour=0, minute=0, second=0, microsecond=0)

    def add_hours(self, dt: datetime, hours: int) -> datetime:
        """Add hours to a datetime.

        Replaces: ``system.date.addHours(date, hours)``
        """
        return dt + timedelta(hours=hours)

    def add_minutes(self, dt: datetime, minutes: int) -> datetime:
        """Add minutes to a datetime.

        Replaces: ``system.date.addMinutes(date, minutes)``
        """
        return dt + timedelta(minutes=minutes)

    def add_seconds(self, dt: datetime, seconds: int) -> datetime:
        """Add seconds to a datetime."""
        return dt + timedelta(seconds=seconds)

    def add_days(self, dt: datetime, days: int) -> datetime:
        """Add days to a datetime."""
        return dt + timedelta(days=days)

    def seconds_between(self, dt1: datetime, dt2: datetime) -> float:
        """Get the number of seconds between two datetimes.

        Replaces: ``system.date.secondsBetween(date1, date2)``
        """
        return (dt2 - dt1).total_seconds()

    def get_hour(self, dt: datetime) -> int:
        """Get the hour component (0-23).

        Replaces: ``system.date.getHour24(date)``
        """
        return dt.hour

    def get_year(self, dt: datetime) -> int:
        """Get the year.

        Replaces: ``system.date.getYear(date)``
        """
        return dt.year

    def get_day_of_year(self, dt: datetime) -> int:
        """Get the day of the year (1-366).

        Replaces: ``system.date.getDayOfYear(date)``
        """
        return dt.timetuple().tm_yday

    def get_timezone_offset(self, dt: datetime) -> float:
        """Get the UTC offset in hours.

        Replaces: ``system.date.getTimezoneOffset(date)``
        """
        if dt.tzinfo is None:
            return 0.0
        offset = dt.utcoffset()
        if offset is None:
            return 0.0
        return offset.total_seconds() / 3600


# Module-level singleton
_instance = DateModule()

now = _instance.now
format = _instance.format
parse = _instance.parse
to_millis = _instance.to_millis
from_millis = _instance.from_millis
midnight = _instance.midnight
add_hours = _instance.add_hours
add_minutes = _instance.add_minutes
add_seconds = _instance.add_seconds
add_days = _instance.add_days
seconds_between = _instance.seconds_between
get_hour = _instance.get_hour
get_year = _instance.get_year
get_day_of_year = _instance.get_day_of_year
get_timezone_offset = _instance.get_timezone_offset
set_default_timezone = _instance.set_default_timezone
