"""One clock: every stamp Forge makes is UTC and timezone-aware.

Owner's principle (2026-10-18, ``docs/PRINCIPLES.md`` "One clock, governed by
the hub"): records from different sources only reconcile if their timestamps
come from the same master time, so Forge never stores a naive datetime and
never guesses what a naive one meant. This module is the single source of
Forge's own stamps (:func:`utc_now`) and the single check that keeps naive
datetimes out of its models (:func:`require_utc`, :class:`OneClockModel`).
The hub-side receipt stamp (FB-087), the measured clock offsets (FB-089), the
rule that a source stamp is never invented (FB-088) and the time exchange with
the hub above (FB-092) build on it.
"""

from __future__ import annotations

import logging
import os
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationInfo, field_validator

if TYPE_CHECKING:
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


@dataclass(frozen=True)
class ClockSample:
    """One reading of a remote clock against Forge's own, NTP style (one-clock record P-2).

    ``sent_at`` (T1) and ``received_at`` (T4) are Forge's clock around the exchange;
    ``server_time`` (T3) is the clock read. The offset is taken at the round trip's
    midpoint so the transit delay cancels, and half the round trip bounds the error
    from path asymmetry. ``service`` names the exchange (``CurrentTime``, ``ReadRequest``).
    """

    sent_at: datetime
    server_time: datetime
    received_at: datetime
    service: str = ""

    @property
    def round_trip_seconds(self) -> float:
        return (self.received_at - self.sent_at).total_seconds()

    @property
    def offset_seconds(self) -> float:
        """``server_time - midpoint``: positive means the measured clock is ahead."""
        midpoint = self.sent_at + (self.received_at - self.sent_at) / 2
        return (self.server_time - midpoint).total_seconds()

    @property
    def uncertainty_seconds(self) -> float:
        return abs(self.round_trip_seconds) / 2


#: Receives every :class:`ClockSample` a connection measures.
ClockSink = Callable[[ClockSample], None]


class ClockReader(Protocol):
    """A way to read the clock a connection pulls from (one-clock record P-2).

    One reader per protocol: OPC UA ``ServerStatus.CurrentTime`` (the supervisor's probe)
    and the response-header tap exist; Logix ``WallClockTime`` (``pycomm3``), the S7 clock
    (``snap7``) and a Modbus register map implement the same surface when those drivers
    land; Sparkplug's publish stamp is measured one-way by its ingest adapter. ``None``
    means the party answered without a clock value (FB-093 makes that a refusal).
    """

    async def read_clock(self) -> ClockSample | None: ...


#: IEC 61850-5 time-performance classes (one-clock record P-8), or undeclared.
AccuracyClass = Literal["T0", "T1", "T2", "T3", "T4", "T5", "unspecified"]


class TimeQuality(BaseModel):
    """IEC 61850 ``TimeQuality`` in Forge's words (one-clock record P-3).

    ``synchronized``: the stamping clock was inside its tolerance when the value was
    stamped; ``clock_failure``: the clock could not be read (FB-093's state);
    ``leap_seconds_known``: the clock accounts for leap seconds; ``accuracy_class``:
    the class the connection declared (P-8), ``unspecified`` until FB-090's FACTS
    section carries it. None means Forge does not know. Proto message ``TimeQuality``.
    """

    synchronized: bool | None = None
    clock_failure: bool | None = None
    leap_seconds_known: bool | None = None
    accuracy_class: AccuracyClass = "unspecified"


#: NTP's clock-discipline weight: each new sample moves the estimate an eighth of the way.
ESTIMATE_WEIGHT = 0.125


class ClockOffsetStats(BaseModel):
    """Rolling statistics of one measured clock against its governing clock."""

    link: str
    clock_id: str | None = Field(
        default=None,
        description=(
            "The clock measured, when named (server:WHK01, device:WHK01; one-clock record "
            "P-2); None for a series derived from records' stamps and keyed by link alone."
        ),
    )
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
    estimate_seconds: float = Field(
        description=(
            "The current offset estimate the correction uses (one-clock record P-2): the "
            "samples filtered by an exponentially weighted mean, NTP's 1/8 weight."
        ),
    )
    estimate_uncertainty_seconds: float | None = Field(
        default=None,
        description="Half the last round trip, the error bound from path asymmetry (P-2).",
    )


class _OffsetWindow:
    """The last ``window`` samples of one (adapter, link) pair."""

    def __init__(
        self, link: str, window: int, tolerance: float, clock_id: str | None = None
    ) -> None:
        self.link = link
        self.clock_id = clock_id
        self.window = window
        self.tolerance = tolerance
        self._samples: deque[float] = deque(maxlen=window)
        self.breaches = 0
        self.breached = False
        self.last_at: datetime | None = None
        self.round_trip: float | None = None
        self.estimate: float | None = None

    def observe(self, seconds: float, at: datetime, round_trip: float | None) -> ClockOffsetStats:
        self._samples.append(seconds)
        self.last_at = at
        self.round_trip = round_trip
        self.estimate = (
            seconds
            if self.estimate is None
            else self.estimate + ESTIMATE_WEIGHT * (seconds - self.estimate)
        )
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
            clock_id=self.clock_id,
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
            estimate_seconds=self.estimate if self.estimate is not None else samples[-1],
            estimate_uncertainty_seconds=(
                abs(self.round_trip) / 2 if self.round_trip is not None else None
            ),
        )


class ClockOffsetTracker:
    """Rolling clock-offset statistics per adapter and link, with a tolerance alert.

    Every sample is recorded as the ``forge.clock.offset`` OpenTelemetry metric;
    a sample outside tolerance counts on ``forge.clock.out_of_tolerance``, logs a
    warning when the pair enters breach (and an info line when it recovers) and
    calls ``on_breach``. Measuring and alerting is this class's whole job;
    refusing the party is FB-093, once D-9 fixes the tolerances.

    A series is keyed by adapter, link and the clock measured (``clock_id``, FB-094
    step 2): a record's stamps feed the unnamed per-link series (``stats``); a probe
    or a response-header tap names the clock it read (``server:WHK01``,
    ``device:WHK01``), so a server relaying several PLCs holds one series per clock
    it can read and one for itself (``clocks``).
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
        self._windows: dict[tuple[str, str, str | None], _OffsetWindow] = {}

    def observe(
        self,
        adapter_id: str,
        link: str,
        seconds: float,
        at: datetime,
        *,
        round_trip: float | None = None,
        clock_id: str | None = None,
    ) -> ClockOffsetStats:
        """Record one offset sample (``measured clock - governing clock``, seconds).

        ``clock_id`` names the clock a probe or tap read (``server:WHK01``); a sample
        derived from a record's stamps leaves it None and feeds the per-link series.
        """
        from forge.core import telemetry

        key = (adapter_id, link, clock_id)
        window = self._windows.get(key)
        if window is None:
            window = self._windows[key] = _OffsetWindow(
                link, self.window, self.tolerance_seconds, clock_id
            )
        was_breached = window.breached
        stats = window.observe(seconds, at, round_trip)
        telemetry.record_clock_offset(adapter_id, link, seconds, clock_id=clock_id)
        if not stats.within_tolerance:
            telemetry.record_clock_breach(adapter_id, link, clock_id=clock_id)
            if not was_breached:
                logger.warning(
                    "Clock offset out of tolerance: %s %s clock is %+.3fs from its hub "
                    "(tolerance %.3fs); the one-clock invariant is not met",
                    adapter_id,
                    clock_id or link,
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
        """Current statistics of the series derived from records, keyed by link."""
        return {
            link: window.stats()
            for (aid, link, clock_id), window in self._windows.items()
            if aid == adapter_id and clock_id is None and window.last_at is not None
        }

    def clocks(self, adapter_id: str) -> dict[str, ClockOffsetStats]:
        """Current statistics of the clocks read by name (probe, tap), keyed by clock_id."""
        return {
            clock_id: window.stats()
            for (aid, _link, clock_id), window in self._windows.items()
            if aid == adapter_id and clock_id is not None and window.last_at is not None
        }

    def clock(self, adapter_id: str, clock_id: str) -> ClockOffsetStats | None:
        """The current statistics of one named clock, or None when it was never read."""
        return self.clocks(adapter_id).get(clock_id)

    def adapters(self) -> list[str]:
        return sorted({aid for aid, _link, _clock in self._windows})

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
            "clocks": {
                aid: {cid: s.model_dump(mode="json") for cid, s in clocks.items()}
                for aid in self.adapters()
                if (clocks := self.clocks(aid))
            },
        }


# ---------------------------------------------------------------------------
# Source stamps are never invented (one clock, FB-088; D-9 step 1)
# ---------------------------------------------------------------------------

#: ``source_clock`` when Forge's own read time stands in for a stamp the protocol does
#: not carry: the one-clock record's origin ``forge`` (P-4), allowed by the owner (Q-3).
FORGE_CLOCK = "forge"
#: The origins a connection may declare for the clock that stamps its values (P-4):
#: ``device`` (the PLC, or a PLC-embedded server), ``server`` (the host that stamps at
#: poll: Kepware, Ignition, an IT system's own server), ``edge`` (a Sparkplug edge node)
#: or ``forge`` (nothing on the wire carries a stamp; Forge's read time is the only one).
SOURCE_TIMESTAMP_ORIGINS: tuple[str, ...] = ("device", "server", "edge", FORGE_CLOCK)
#: The shape of ``RecordTimestamp.source_clock``: ``forge`` or ``<origin>:<name>``.
SOURCE_CLOCK_PATTERN = r"^(forge|(device|server|edge):\S+)$"
#: The cause an adapter counts a refused stampless value under (``AdapterHealth.refusals``).
SOURCE_STAMP_MISSING = "source_stamp_missing"


class SourceStampMissingError(ValueError):
    """A value arrived without a source timestamp and nothing may stand in for it.

    Forge never invents a source time (FB-088, the first step of the signed one-clock
    record). A connection whose protocol carries no stamp declares
    ``source_timestamp_origin: forge``; then Forge's own read time is recorded as the
    stamp, marked ``source_clock=forge`` with the poll bound as its uncertainty.
    Without that declaration the value is refused. The refusal is never silent (owner,
    2026-11-03): the adapter counts it on its health (``refusals``, ``last_refusal``,
    ``records_failed``), names the cause, goes DEGRADED, and the hub shows it on the
    API, the CLI and forge-display.
    """

    cause = SOURCE_STAMP_MISSING

    def __init__(
        self,
        *,
        adapter_id: str,
        connection: str | None = None,
        tag_path: str | None = None,
        detail: str | None = None,
    ) -> None:
        self.adapter_id = adapter_id
        self.connection = connection
        self.tag_path = tag_path
        where = ", ".join(
            part
            for part in (
                f"connection {connection}" if connection else "",
                f"tag {tag_path}" if tag_path else "",
            )
            if part
        )
        super().__init__(
            f"{adapter_id}: a value{' on ' + where if where else ''} arrived without a source "
            f"timestamp{' (' + detail + ')' if detail else ''}; the connection does not declare "
            "source_timestamp_origin: forge, and Forge does not invent one (one clock, FB-088)"
        )


TIME_GOVERNANCE_CONFLICT = "time_governance_conflict"


class TimeGovernanceConflictError(ValueError):
    """A connection parameter contradicts the spoke's FACTS ``time_governance`` declaration.

    The FACTS section is the governed declaration (one-clock record P-7, FB-090): the
    owner approved its hash. A ``source_timestamp_origin`` parameter naming a different
    origin would move the declaration out from under governance, so the adapter refuses
    the configuration rather than let either side win silently (owner, 2026-11-03). A
    parameter that repeats the declaration is accepted; the parameter itself retires once
    registration refuses a manifest without the section (FB-093).
    """

    cause = TIME_GOVERNANCE_CONFLICT

    def __init__(self, *, adapter_id: str, declared: str, configured: str) -> None:
        self.adapter_id = adapter_id
        self.declared = declared
        self.configured = configured
        super().__init__(
            f"{adapter_id}: the connection parameters declare source_timestamp_origin: "
            f"{configured}, but the FACTS time_governance declaration says {declared}; the "
            "governed declaration stands and the configuration is refused (one clock, FB-090)"
        )


@dataclass(frozen=True)
class ClockEstimate:
    """What a record builder needs to correct a stamp: a clock's current offset and bound.

    Built from the tracker's statistics of the clock that stamps a connection's values
    (``ClockOffsetTracker.clock``): the filtered offset (P-2), its uncertainty (half the
    last round trip) and whether the last sample sat inside tolerance.
    """

    clock_id: str
    offset_seconds: float
    uncertainty_seconds: float | None
    within_tolerance: bool

    @classmethod
    def from_stats(cls, stats: ClockOffsetStats) -> ClockEstimate:
        return cls(
            clock_id=stats.clock_id or stats.link,
            offset_seconds=stats.estimate_seconds,
            uncertainty_seconds=stats.estimate_uncertainty_seconds,
            within_tolerance=stats.within_tolerance,
        )

    def correct(self, stamp: datetime) -> datetime:
        """``stamp`` in master time: the stamping clock's offset subtracted (P-3)."""
        return stamp - timedelta(seconds=self.offset_seconds)


@dataclass(frozen=True)
class SourceStamp:
    """The resolved source stamp of one value: what goes on ``RecordTimestamp`` (P-3)."""

    source_time: datetime
    source_clock: str | None
    source_uncertainty_seconds: float | None
    source_time_as_sent: datetime | None = None
    source_offset_seconds: float | None = None
    time_quality: TimeQuality | None = None

    def timestamp_fields(self) -> dict[str, Any]:
        """The ``RecordTimestamp`` keyword arguments this stamp fills."""
        return {
            "source_time": self.source_time,
            "source_time_as_sent": self.source_time_as_sent,
            "source_clock": self.source_clock,
            "source_offset_seconds": self.source_offset_seconds,
            "source_uncertainty_seconds": self.source_uncertainty_seconds,
            "time_quality": self.time_quality,
        }


def source_clock_name(origin: str | None, connection: str | None = None) -> str | None:
    """``RecordTimestamp.source_clock`` for a declared origin.

    ``forge`` stays ``forge``; ``device``, ``server`` and ``edge`` name the connection
    (``device:WHK01``) and give None when there is no connection name to attach. None
    stays None (the connection has not declared its origin). Any other origin is a
    configuration error and raises ``ValueError``.
    """
    if origin is None:
        return None
    if origin not in SOURCE_TIMESTAMP_ORIGINS:
        msg = f"source_timestamp_origin must be one of {SOURCE_TIMESTAMP_ORIGINS}; got {origin!r}"
        raise ValueError(msg)
    if origin == FORGE_CLOCK:
        return FORGE_CLOCK
    return f"{origin}:{connection}" if connection else None


def resolve_source_stamp(
    stamp: datetime | None,
    *,
    origin: str | None,
    read_at: datetime,
    poll_bound_seconds: float | None = None,
    adapter_id: str,
    connection: str | None = None,
    tag_path: str | None = None,
    detail: str | None = None,
    clock: ClockEstimate | None = None,
    sampling_bound_seconds: float | None = None,
) -> SourceStamp:
    """The source stamp of one value, never invented (FB-088), corrected on entry (FB-094).

    ``stamp`` is what the source sent: None when it sent nothing, or something that
    did not parse (``detail`` says which). With a stamp, that is the source time and
    ``source_clock`` names the declared origin's clock (None while undeclared; a
    connection declared ``forge`` that nevertheless sends stamps keeps them, the
    declaration-against-wire check is FB-094's). When ``clock`` is the measured
    estimate of that very clock, the stamp is corrected to master time on entry
    (one-clock record P-3, P-10): ``source_time = stamp - offset``, the stamp as sent,
    the offset subtracted, the clock's uncertainty plus ``poll_bound_seconds`` (the
    sampling bound) and the time quality are recorded; the hub never corrects again.
    Without a stamp, only a connection declared ``origin: forge`` may stand in:
    ``read_at``, Forge's own clock when it read the value, becomes the source time,
    ``source_clock`` is ``forge`` and ``poll_bound_seconds`` is recorded as the
    uncertainty. Anything else raises :class:`SourceStampMissingError`, which the
    adapter counts on its health.

    Two bounds (one-clock record P-6): ``sampling_bound_seconds`` is how far a stamp
    the source applied at poll may sit from the occurrence (an OT tag's scan or poll
    interval; None for an event the source stamped at the instant), and goes on every
    stamped value, added to the clock's bound once corrected; ``poll_bound_seconds`` is
    the bound on Forge's own read time when it stands in.
    """
    if stamp is not None:
        # passed through as it came: RecordTimestamp is the one-clock gate (a naive stamp
        # fails there with the field named)
        clock_name = source_clock_name(origin, connection) if origin != FORGE_CLOCK else None
        if clock is not None and clock_name is not None and clock.clock_id == clock_name:
            uncertainty = (clock.uncertainty_seconds or 0.0) + (sampling_bound_seconds or 0.0)
            return SourceStamp(
                source_time=clock.correct(stamp),
                source_clock=clock_name,
                source_uncertainty_seconds=uncertainty,
                source_time_as_sent=stamp,
                source_offset_seconds=clock.offset_seconds,
                time_quality=TimeQuality(synchronized=clock.within_tolerance, clock_failure=False),
            )
        return SourceStamp(stamp, clock_name, sampling_bound_seconds, source_time_as_sent=stamp)
    if origin == FORGE_CLOCK:
        return SourceStamp(read_at, FORGE_CLOCK, poll_bound_seconds)
    source_clock_name(origin, connection)  # an unknown origin is a configuration error
    raise SourceStampMissingError(
        adapter_id=adapter_id, connection=connection, tag_path=tag_path, detail=detail
    )
