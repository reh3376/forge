"""Shift resolver — determines which shift covers a given timestamp.

Supports configurable shift schedules per site. Ships with the
Louisville two-shift pattern from the WMS adapter FACTS spec:
    Day shift:   06:00-18:00 America/Kentucky/Louisville
    Night shift: 18:00-06:00 America/Kentucky/Louisville
"""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from forge.context.models import ShiftDefinition, ShiftSchedule


def resolve_shift(
    schedule: ShiftSchedule,
    timestamp: datetime,
) -> str | None:
    """Resolve which shift covers *timestamp* according to *schedule*.

    Returns the shift name, or ``None`` if no shift matches.
    Handles overnight shifts (where end_time < start_time).
    """
    tz = ZoneInfo(schedule.shifts[0].timezone) if schedule.shifts else None
    if tz is None:
        return None

    local_dt = timestamp.astimezone(tz)
    local_time = local_dt.time()

    for shift in schedule.shifts:
        if _time_in_shift(local_time, shift.start_time, shift.end_time):
            return shift.name
    return None


def _time_in_shift(t: time, start: time, end: time) -> bool:
    """Check if time *t* falls within [start, end).

    Handles overnight spans (e.g. 18:00-06:00).
    """
    if start <= end:
        return start <= t < end
    # Overnight: 18:00-06:00 means (t >= 18:00) OR (t < 06:00)
    return t >= start or t < end


def build_louisville_schedule(site: str = "WHK-Main") -> ShiftSchedule:
    """Build the default Louisville two-shift schedule.

    Day shift:   06:00-18:00 local
    Night shift: 18:00-06:00 local
    """
    return ShiftSchedule(
        site=site,
        shifts=[
            ShiftDefinition(
                name="Day",
                start_time=time(6, 0),
                end_time=time(18, 0),
                timezone="America/Kentucky/Louisville",
            ),
            ShiftDefinition(
                name="Night",
                start_time=time(18, 0),
                end_time=time(6, 0),
                timezone="America/Kentucky/Louisville",
            ),
        ],
    )
