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

import logging
import os
from collections import deque
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, ValidationInfo, field_validator

if TYPE_CHECKING:
    from collections.abc import Callable

    from forge.core.models.contextual_record import RecordTimestamp


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


# ---------------------------------------------------------------------------
# Clock-offset measurement (one clock, FB-089)
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

#: Environment variable holding the process-wide clock tolerance in seconds.
CLOCK_TOLERANCE_ENV = "FORGE_CLOCK_TOLERANCE_SECONDS"
#: Provisional: D-9 fixes the tolerance per link class (IEC 61850-5 time-performance
#: classes are the candidates). Until then one process-wide tolerance applies to
#: every link; 1 s catches an unsynchronised host without tripping on WAN latency.
DEFAULT_CLOCK_TOLERANCE_SECONDS = 1.0
#: Rolling window per (adapter, link): the last N samples.
DEFAULT_CLOCK_WINDOW = 256

#: The links an offset is measured on, each "measured clock - governing clock":
#: ``spoke``: the spoke's clock against the hub (``sent_time - ingestion_time``; one-way,
#: so it carries the build-to-receipt delay until FB-092 adds the four-timestamp exchange);
#: ``server``: the source system's server clock against the hub (``server_time -
#: ingestion_time`` from records, or the OPC-UA probe's direct read of ``CurrentTime``);
#: ``source``: the source clock against its server (``source_time - server_time``).
SPOKE_LINK = "spoke"
SERVER_LINK = "server"
SOURCE_LINK = "source"
CLOCK_LINKS: tuple[str, ...] = (SPOKE_LINK, SERVER_LINK, SOURCE_LINK)


def clock_tolerance_seconds() -> float:
    """The configured clock tolerance: ``FORGE_CLOCK_TOLERANCE_SECONDS`` or the default."""
    raw = os.environ.get(CLOCK_TOLERANCE_ENV, "").strip()
    if not raw:
        return DEFAULT_CLOCK_TOLERANCE_SECONDS
    try:
        value = float(raw)
    except ValueError:
        logger.warning(
            "%s=%r is not a number; using %ss",
            CLOCK_TOLERANCE_ENV,
            raw,
            DEFAULT_CLOCK_TOLERANCE_SECONDS,
        )
        return DEFAULT_CLOCK_TOLERANCE_SECONDS
    if value <= 0:
        logger.warning(
            "%s=%r must be positive; using %ss",
            CLOCK_TOLERANCE_ENV,
            raw,
            DEFAULT_CLOCK_TOLERANCE_SECONDS,
        )
        return DEFAULT_CLOCK_TOLERANCE_SECONDS
    return value


class ClockOffsetStats(BaseModel):
    """Rolling statistics of one measured clock against its governing clock."""

    link: str
    samples: int
    window: int
    last_seconds: float
    mean_seconds: float
    min_seconds: float
    max_seconds: float
    max_abs_seconds: float
    tolerance_seconds: float
    within_tolerance: bool = Field(description="The last sample is inside tolerance.")
    breaches: int = Field(description="Samples outside tolerance since the tracker started.")
    measured_at: datetime
    round_trip_seconds: float | None = Field(
        default=None, description="Round trip of a direct probe (OPC-UA CurrentTime), if any."
    )


class _OffsetWindow:
    """The last ``window`` samples of one (adapter, link) pair."""

    def __init__(self, link: str, window: int, tolerance: float) -> None:
        self.link = link
        self.window = window
        self.tolerance = tolerance
        self._samples: deque[float] = deque(maxlen=window)
        self.breaches = 0
        self.breached = False
        self.last_at: datetime | None = None
        self.round_trip: float | None = None

    def observe(self, seconds: float, at: datetime, round_trip: float | None) -> ClockOffsetStats:
        self._samples.append(seconds)
        self.last_at = at
        self.round_trip = round_trip
        within = abs(seconds) <= self.tolerance
        if not within:
            self.breaches += 1
        self.breached = not within
        return self.stats()

    def stats(self) -> ClockOffsetStats:
        samples = list(self._samples)
        assert samples and self.last_at is not None  # only after observe()
        return ClockOffsetStats(
            link=self.link,
            samples=len(samples),
            window=self.window,
            last_seconds=samples[-1],
            mean_seconds=sum(samples) / len(samples),
            min_seconds=min(samples),
            max_seconds=max(samples),
            max_abs_seconds=max(abs(s) for s in samples),
            tolerance_seconds=self.tolerance,
            within_tolerance=not self.breached,
            breaches=self.breaches,
            measured_at=self.last_at,
            round_trip_seconds=self.round_trip,
        )


class ClockOffsetTracker:
    """Rolling clock-offset statistics per adapter and link, with a tolerance alert.

    Every sample is recorded as the ``forge.clock.offset`` OpenTelemetry metric;
    a sample outside tolerance counts on ``forge.clock.out_of_tolerance``, logs a
    warning when the pair enters breach (and an info line when it recovers) and
    calls ``on_breach``. Measuring and alerting is this class's whole job;
    refusing the party is FB-093, once D-9 fixes the tolerances.
    """

    def __init__(
        self,
        *,
        tolerance_seconds: float | None = None,
        window: int = DEFAULT_CLOCK_WINDOW,
        on_breach: Callable[[str, ClockOffsetStats], None] | None = None,
    ) -> None:
        self.tolerance_seconds = (
            tolerance_seconds if tolerance_seconds is not None else clock_tolerance_seconds()
        )
        self.window = window
        self._on_breach = on_breach
        self._windows: dict[tuple[str, str], _OffsetWindow] = {}

    def observe(
        self,
        adapter_id: str,
        link: str,
        seconds: float,
        at: datetime,
        *,
        round_trip: float | None = None,
    ) -> ClockOffsetStats:
        """Record one offset sample (``measured clock - governing clock``, seconds)."""
        from forge.core import telemetry

        key = (adapter_id, link)
        window = self._windows.get(key)
        if window is None:
            window = self._windows[key] = _OffsetWindow(link, self.window, self.tolerance_seconds)
        was_breached = window.breached
        stats = window.observe(seconds, at, round_trip)
        telemetry.record_clock_offset(adapter_id, link, seconds)
        if not stats.within_tolerance:
            telemetry.record_clock_breach(adapter_id, link)
            if not was_breached:
                logger.warning(
                    "Clock offset out of tolerance: %s %s clock is %+.3fs from its hub "
                    "(tolerance %.3fs); the one-clock invariant is not met",
                    adapter_id,
                    link,
                    seconds,
                    self.tolerance_seconds,
                )
                if self._on_breach is not None:
                    self._on_breach(adapter_id, stats)
        elif was_breached:
            logger.info(
                "Clock offset back inside tolerance: %s %s clock is %+.3fs from its hub",
                adapter_id,
                link,
                seconds,
            )
        return stats

    def observe_record(self, adapter_id: str, ts: RecordTimestamp) -> dict[str, ClockOffsetStats]:
        """Measure every link a received record's timestamps allow.

        Called by the ingest pipeline after the hub stamped receipt (FB-087), so
        ``ingestion_time`` is the hub clock and ``sent_time`` the spoke's.
        """
        at = ts.ingestion_time
        observed: dict[str, ClockOffsetStats] = {}
        if ts.sent_time is not None:
            seconds = (ts.sent_time - at).total_seconds()
            observed[SPOKE_LINK] = self.observe(adapter_id, SPOKE_LINK, seconds, at)
        if ts.server_time is not None:
            seconds = (ts.server_time - at).total_seconds()
            observed[SERVER_LINK] = self.observe(adapter_id, SERVER_LINK, seconds, at)
            seconds = (ts.source_time - ts.server_time).total_seconds()
            observed[SOURCE_LINK] = self.observe(adapter_id, SOURCE_LINK, seconds, at)
        return observed

    def stats(self, adapter_id: str) -> dict[str, ClockOffsetStats]:
        """Current statistics for one adapter, keyed by link."""
        return {
            link: window.stats()
            for (aid, link), window in self._windows.items()
            if aid == adapter_id and window.last_at is not None
        }

    def adapters(self) -> list[str]:
        return sorted({aid for aid, _link in self._windows})

    @property
    def breaches(self) -> int:
        """Samples outside tolerance across every adapter and link."""
        return sum(w.breaches for w in self._windows.values())

    def describe(self) -> dict[str, Any]:
        return {
            "tolerance_seconds": self.tolerance_seconds,
            "window": self.window,
            "breaches": self.breaches,
            "adapters": {
                aid: {link: s.model_dump(mode="json") for link, s in self.stats(aid).items()}
                for aid in self.adapters()
            },
        }
