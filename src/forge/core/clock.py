"""One clock: every stamp Forge makes is UTC and timezone-aware.

Owner's principle (2026-10-18, ``docs/PRINCIPLES.md`` "One clock, governed by
the hub"): records from different sources only reconcile if their timestamps
come from the same master time, so Forge never stores a naive datetime and
never guesses what a naive one meant. This module is the single source of
Forge's own stamps (:func:`utc_now`) and the single check that keeps naive
datetimes out of its models (:func:`require_utc`, :class:`OneClockModel`).
The hub-side receipt stamp (FB-087), the measured clock offsets (FB-089) and
the time exchange with the hub above (FB-092) build on it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ValidationInfo, field_validator


def utc_now() -> datetime:
    """The current time on this process's clock, UTC and timezone-aware."""
    return datetime.now(UTC)


def require_utc(value: datetime, *, field: str = "datetime") -> datetime:
    """Return ``value`` in UTC, or raise ``ValueError`` if it is naive.

    A naive datetime names no instant: it could sit at any offset, so reading
    it as UTC is a guess and the one-clock invariant forbids guessing. An aware
    datetime in another offset is the same instant and is normalised to UTC so
    every stored stamp reads the same way.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        msg = f"{field} must be timezone-aware (one clock: UTC); got naive {value.isoformat()}"
        raise ValueError(msg)
    return value.astimezone(UTC)


class OneClockModel(BaseModel):
    """Base for models whose datetime fields must be timezone-aware.

    Every ``datetime`` value on any field, optional ones included, passes
    through :func:`require_utc` after parsing: a naive value fails validation
    (an ISO string without an offset included) and an aware one is stored in
    UTC. Subclasses add fields and configuration as usual.
    """

    @field_validator("*", mode="after")
    @classmethod
    def _one_clock(cls, value: Any, info: ValidationInfo) -> Any:
        if isinstance(value, datetime):
            return require_utc(value, field=info.field_name or "datetime")
        return value
