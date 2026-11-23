"""AdapterService servicer that persists what spokes stream (BACKLOG FB-053).

Replaces ``InMemoryServicer`` in the hub API. Differences:

* ``Register`` checks the manifest against the adapter's FACTS spec and
  rejects it when capabilities or the schema reference disagree.
* Records are not parked in an unbounded queue; they are buffered per
  session and handed to the :class:`~forge.ingest.pipeline.IngestPipeline`
  in batches (``batch_size`` or end of stream, whichever comes first).
* A malformed or contradictory record is counted and reported, never
  allowed to abort the stream and force the spoke to resend good records.
* ``Health`` reports rejected and failed counts; ``Stop`` flushes first.
* Registration and health callbacks may be coroutines (the durable
  registry persists them, FB-060) and every flushed batch is reported to
  ``ingest_log`` for ``forge_core.records_log``.
* The hub fails closed on a spoke's clock (FB-093, hub half): every Register,
  Health and Ingest request is a probe of it, and a spoke whose clock is
  unreadable or outside its declared class has its Register and its Ingest
  refused until three good probes (:class:`~forge_core.clock.SpokeClockGates`).
"""

from __future__ import annotations

import inspect
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.ingest.facts_check import FactsCheckResult, check_manifest_against_facts
from forge.ingest.pipeline import IngestOutcome, IngestPipeline, IngestStats
from forge.transport.hub_server import AdapterServiceServicer, AdapterSession
from forge_core import telemetry
from forge_core.clock import (
    TIME_GOVERNANCE_MISSING,
    ClockGateTransition,
    ClockRefusedError,
    tolerance_for_class,
)
from forge_core.link.serialization import proto_to_pydantic, pydantic_to_proto
from forge_core.link.spoke_callback import CALLBACK_PARAM
from forge_core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    SpokeTime,
    TimeGovernance,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from forge_core.link.spoke_callback import WriteDispatcher
    from forge_core.models.contextual_record import ContextualRecord

logger = logging.getLogger(__name__)


async def _maybe_await(result: Any) -> Any:
    """Callbacks may be plain functions or coroutine functions."""
    if inspect.isawaitable(result):
        return await result
    return result


@dataclass
class SessionIngestState:
    """Per-session buffer and counters."""

    buffer: list[ContextualRecord] = field(default_factory=list)
    stats: IngestStats = field(default_factory=IngestStats)
    stream: IngestOutcome = field(default_factory=IngestOutcome)
    parse_rejected: int = 0
    facts: FactsCheckResult | None = None
    registered_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_error: str | None = None
    callback_url: str | None = None

    def reset_stream(self) -> None:
        self.stream = IngestOutcome()


class HubIngestServicer(AdapterServiceServicer):
    """Servicer backed by an :class:`IngestPipeline`."""

    def __init__(
        self,
        pipeline: IngestPipeline | None = None,
        *,
        batch_size: int = 100,
        specs_dir: Path | None = None,
        require_facts: bool = False,
        on_registered: Callable[[AdapterManifest], Any] | None = None,
        on_health: Callable[[str, AdapterHealth], Any] | None = None,
        write_dispatcher: WriteDispatcher | None = None,
        ingest_log: Callable[[str, str, IngestOutcome], Any] | None = None,
    ) -> None:
        super().__init__()
        self.pipeline = pipeline if pipeline is not None else IngestPipeline()
        # One hub clock: T2 and T3 of the time exchange come from the clock that stamps
        # receipt on every record (FB-087, FB-092).
        self.clock = self.pipeline.clock
        #: The gate on each spoke's clock (FB-093). The pipeline owns it, so the REST
        #: endpoint refuses the spokes this servicer refuses.
        self.gates = self.pipeline.gates
        #: Registrations refused before a gate existed (no time_governance), by adapter.
        self._refused_registrations: dict[str, int] = {}
        self.write_dispatcher = write_dispatcher
        self._batch_size = max(1, batch_size)
        self._specs_dir = specs_dir
        self._require_facts = require_facts
        self._on_registered = on_registered
        self._on_health = on_health
        self._ingest_log = ingest_log
        self._state: dict[str, SessionIngestState] = {}

    # -- control plane --------------------------------------------------------

    async def register(
        self,
        manifest_dict: dict[str, Any],
        *,
        spoke_time: SpokeTime | None = None,
    ) -> dict[str, Any]:
        manifest = proto_to_pydantic(manifest_dict, "AdapterManifest")
        check = check_manifest_against_facts(
            manifest, specs_dir=self._specs_dir, require_spec=self._require_facts
        )
        if not check.ok:
            logger.warning("Registration rejected for %s: %s", manifest.adapter_id, check.summary())
            return {"accepted": False, "message": check.summary(), "session_id": ""}

        adapter_id = manifest.adapter_id
        now = self.clock()
        governance = manifest.time_governance
        if governance is None:
            # No declared class, nothing to hold the spoke's clock to: the check is not
            # optional, so the registration is refused (one-clock record P-7, FB-093).
            return await self._refuse_ungoverned(adapter_id, now)
        self.gates.declare(adapter_id, governance.tolerance_class)
        # A Register is a probe when it reports a measurement: a refused spoke that lost
        # its session proves its clock this way, and is readmitted by its own retries.
        changed = self._probe(adapter_id, governance, spoke_time, now, first_contact=True)
        refusal = self.gates.refusal(adapter_id)
        if refusal is not None:
            await self._refuse_request(adapter_id, refusal, "Register", now)
            return {
                "accepted": False,
                "message": str(refusal),
                "session_id": "",
                "refusal_cause": refusal.cause,
            }
        if changed:
            await self._announce(adapter_id, now)

        result = await super().register(manifest_dict)
        session_id = result["session_id"]
        self._state[session_id] = SessionIngestState(facts=check)
        if self._on_registered is not None:
            try:
                await _maybe_await(self._on_registered(manifest))
            except Exception:  # pragma: no cover - callback is best effort
                logger.exception("on_registered callback failed for %s", manifest.adapter_id)
        result["message"] = check.summary()
        return result

    async def configure(
        self, adapter_id: str, session_id: str, params: dict[str, str]
    ) -> dict[str, Any]:
        result = await super().configure(adapter_id, session_id, params)
        url = (params.get(CALLBACK_PARAM) or "").strip() or None
        state = self._state.get(session_id)
        if state is not None:
            state.callback_url = url
        if self.write_dispatcher is not None:
            self.write_dispatcher.register_callback(adapter_id, session_id, params)
        return result

    async def stop(self, adapter_id: str, session_id: str, graceful: bool = True) -> dict[str, Any]:
        flushed = 0
        if graceful and session_id in self._state:
            outcome = await self._flush(session_id)
            flushed = outcome.persisted if outcome else 0
        result = await super().stop(adapter_id, session_id, graceful)
        result["records_flushed"] = flushed
        if self.write_dispatcher is not None:
            self.write_dispatcher.forget(session_id)
        return result

    async def health(
        self,
        adapter_id: str,
        session_id: str,
        *,
        spoke_time: SpokeTime | None = None,
    ) -> dict[str, Any]:
        session = self._get_session(adapter_id, session_id)
        now = self.clock()
        # Every Health is a probe of the spoke's clock (FB-093): it reports the spoke's
        # last completed exchange (one-clock record P-9), or it reports nothing, which
        # counts as a clock the hub could not read. A reported measurement also feeds the
        # two-way series, held to the class the spoke declared (P-8).
        self._probe(adapter_id, session.manifest.time_governance, spoke_time, now)
        health = self._health_of(adapter_id, session, now)
        if self._on_health is not None:
            try:
                await _maybe_await(self._on_health(adapter_id, health))
            except Exception:  # pragma: no cover - callback is best effort
                logger.exception("on_health callback failed for %s", adapter_id)
        return pydantic_to_proto(health)

    # -- the gate on a spoke's clock (one clock, FB-093 hub half) ---------------

    def _probe(
        self,
        adapter_id: str,
        governance: TimeGovernance | None,
        spoke_time: SpokeTime | None,
        at: datetime,
        *,
        first_contact: bool = False,
    ) -> bool:
        """Take one request as a probe of the spoke's clock; True when its state changed.

        A measurement the hub has not seen goes on the two-way series (FB-092) whether or
        not the gate counts it as a probe; the gate counts at most one probe a second.
        """
        offset = spoke_time.offset_seconds if spoke_time is not None else None
        round_trip = spoke_time.round_trip_seconds if spoke_time is not None else None
        measured_at = spoke_time.measured_at if spoke_time is not None else None
        if offset is None or round_trip is None:
            offset = round_trip = measured_at = None
        probe = self.gates.probe(
            adapter_id,
            at,
            offset_seconds=offset,
            round_trip_seconds=round_trip,
            measured_at=measured_at,
            first_contact=first_contact,
        )
        if probe.fresh and offset is not None and round_trip is not None:
            self.pipeline.offsets.observe_exchange(
                adapter_id,
                offset_seconds=offset,
                round_trip_seconds=round_trip,
                at=at,
                tolerance_seconds=(
                    tolerance_for_class(governance.tolerance_class)
                    if governance is not None
                    else None
                ),
            )
        if probe.transition is None:
            return False
        self._note_transition(adapter_id, probe.transition)
        return True

    @staticmethod
    def _note_transition(adapter_id: str, transition: ClockGateTransition) -> None:
        """Never silent (owner, 2026-11-03): the log and the metric at the moment of entry."""
        if transition.refused:
            logger.error(
                "Spoke %s is refused, %s: %s. The hub refuses its Register and its Ingest "
                "until three consecutive good measurements (one clock, FB-093)",
                adapter_id,
                transition.state,
                transition.cause,
            )
            telemetry.record_refusal(adapter_id, transition.refusal_cause)
        else:
            logger.info("Spoke %s is readmitted: %s", adapter_id, transition.cause)

    async def _refuse_request(
        self, adapter_id: str, refusal: ClockRefusedError, rpc: str, at: datetime
    ) -> None:
        """Count, log and announce one request refused for the spoke's clock."""
        self.gates.note_refused(adapter_id, refusal.cause)
        telemetry.record_refusal(adapter_id, refusal.cause)
        logger.warning("%s from spoke %s refused: %s", rpc, adapter_id, refusal)
        await self._announce(adapter_id, at)

    async def _refuse_ungoverned(self, adapter_id: str, at: datetime) -> dict[str, Any]:
        """Refuse a registration whose manifest declares no ``time_governance``."""
        count = self._refused_registrations.get(adapter_id, 0) + 1
        self._refused_registrations[adapter_id] = count
        message = (
            f"{TIME_GOVERNANCE_MISSING}: the manifest of '{adapter_id}' declares no "
            "time_governance, so the hub has no tolerance class to hold its clock to; "
            "the registration is refused (one clock, FB-093)"
        )
        logger.error("Registration refused for %s: %s", adapter_id, message)
        telemetry.record_refusal(adapter_id, TIME_GOVERNANCE_MISSING)
        if self._on_health is not None:
            health = AdapterHealth(
                adapter_id=adapter_id,
                state=AdapterState.DEGRADED,
                last_check=at,
                error_message=message,
                refusals={TIME_GOVERNANCE_MISSING: count},
                last_refusal=message,
            )
            try:
                await _maybe_await(self._on_health(adapter_id, health))
            except Exception:  # pragma: no cover - callback is best effort
                logger.exception("on_health callback failed for %s", adapter_id)
        return {
            "accepted": False,
            "message": message,
            "session_id": "",
            "refusal_cause": TIME_GOVERNANCE_MISSING,
        }

    def _latest_session(self, adapter_id: str) -> AdapterSession | None:
        for session in reversed(list(self._sessions.values())):
            if session.adapter_id == adapter_id:
                return session
        return None

    def _health_of(
        self, adapter_id: str, session: AdapterSession | None, at: datetime
    ) -> AdapterHealth:
        """The hub's view of a spoke: its session's counters and the gate on its clock.

        A refused spoke is DEGRADED whatever its session says, with the cause on
        ``error_message`` and ``last_refusal`` (both reach the spoke on the wire), the
        gate on ``clock_state`` and ``clock_gate``, and the requests refused by cause.
        """
        state = self._state.get(session.session_id) if session is not None else None
        stats = state.stats if state else IngestStats()
        failed = stats.rejected + stats.failed + (state.parse_rejected if state else 0)
        refusal = self.gates.refusal(adapter_id)
        session_state = session.state if session is not None else AdapterState.REGISTERED
        healthy = refusal is None and session_state == AdapterState.HEALTHY
        return AdapterHealth(
            adapter_id=adapter_id,
            state=AdapterState.DEGRADED if refusal is not None else session_state,
            last_check=at,
            last_healthy=at if healthy else None,
            error_message=(
                str(refusal) if refusal is not None else (state.last_error if state else None)
            ),
            records_collected=stats.persisted,
            records_failed=failed,
            uptime_seconds=(
                (at - session.created_at).total_seconds() if session is not None else 0.0
            ),
            clock=self.pipeline.offsets.stats(adapter_id),
            refusals=self.gates.refused_requests(adapter_id),
            last_refusal=str(refusal) if refusal is not None else None,
            clock_state=self.gates.state(adapter_id),
            clock_gate=self.gates.describe_gate(adapter_id),
        )

    async def _announce(self, adapter_id: str, at: datetime) -> None:
        """Push the spoke's health to the registry now, so the API and the CLI show it."""
        if self._on_health is None:
            return
        health = self._health_of(adapter_id, self._latest_session(adapter_id), at)
        try:
            await _maybe_await(self._on_health(adapter_id, health))
        except Exception:  # pragma: no cover - callback is best effort
            logger.exception("on_health callback failed for %s", adapter_id)

    async def begin_ingest(self, session_id: str, *, spoke_time: SpokeTime | None = None) -> None:
        """Open an Ingest stream: probe the spoke's clock and refuse a refused spoke.

        The transport calls this before it reads the first record, with the measurement
        the request's headers carried. Raises :class:`ClockRefusedError` when the spoke is
        refused, or becomes refused by this very probe; nothing of the stream is read.
        An unknown session is left to :meth:`receive_record` to report.
        """
        session = self._sessions.get(session_id)
        if session is None:
            return
        adapter_id = session.adapter_id
        now = self.clock()
        refusal = self.gates.refusal(adapter_id)
        if refusal is None:
            self._probe(adapter_id, session.manifest.time_governance, spoke_time, now)
            refusal = self.gates.refusal(adapter_id)
        if refusal is not None:
            await self._refuse_request(adapter_id, refusal, "Ingest", now)
            raise refusal

    # -- data plane -----------------------------------------------------------

    async def receive_record(self, session_id: str, record_dict: dict[str, Any]) -> None:
        session = self._sessions.get(session_id)
        state = self._state.get(session_id)
        if session is None or state is None:
            msg = f"No session '{session_id}'"
            raise ValueError(msg)
        if not session.started:
            msg = f"Session '{session_id}' is not started"
            raise ValueError(msg)
        refusal = self.gates.refusal(session.adapter_id)
        if refusal is not None:
            # refused while its stream was open, or pushed past begin_ingest
            await self._refuse_request(session.adapter_id, refusal, "Ingest", self.clock())
            raise refusal

        try:
            record = proto_to_pydantic(record_dict, "ContextualRecord")
        except Exception as exc:
            state.parse_rejected += 1
            state.stream.received += 1
            state.stream.rejected += 1
            state.last_error = f"unparseable record: {exc}"
            state.stream.errors.append(state.last_error)
            logger.warning("Session %s: %s", session_id, state.last_error)
            return

        session.records_received += 1
        state.buffer.append(record)
        await self.on_record_received(record)
        if len(state.buffer) >= self._batch_size:
            await self._flush(session_id)

    async def end_of_stream(self, session_id: str) -> str:
        """Flush the session buffer and summarise the stream just closed."""
        state = self._state.get(session_id)
        if state is None:
            return "unknown session"
        await self._flush(session_id)
        summary = state.stream.summary()
        state.reset_stream()
        return summary

    async def flush_all(self) -> int:
        """Flush every session buffer (shutdown). Returns records persisted."""
        total = 0
        for session_id in list(self._state):
            outcome = await self._flush(session_id)
            total += outcome.persisted if outcome else 0
        return total

    async def _flush(self, session_id: str) -> IngestOutcome | None:
        session = self._sessions.get(session_id)
        state = self._state.get(session_id)
        if session is None or state is None or not state.buffer:
            return None
        batch, state.buffer = state.buffer, []
        outcome = await self.pipeline.ingest(
            batch, adapter_id=session.adapter_id, manifest=session.manifest
        )
        state.stats.add(outcome)
        self._merge_stream(state.stream, outcome)
        if outcome.errors:
            state.last_error = outcome.errors[-1]
        if self._ingest_log is not None and outcome.received:
            try:
                await _maybe_await(self._ingest_log(session.adapter_id, session_id, outcome))
            except Exception:  # pragma: no cover - the log never blocks ingestion
                logger.exception("ingest_log callback failed for %s", session.adapter_id)
        return outcome

    @staticmethod
    def _merge_stream(stream: IngestOutcome, outcome: IngestOutcome) -> None:
        stream.received += outcome.received
        stream.accepted += outcome.accepted
        stream.rejected += outcome.rejected
        stream.persisted += outcome.persisted
        stream.failed += outcome.failed
        stream.missing_context += outcome.missing_context
        stream.errors.extend(outcome.errors)
        for engine, n in outcome.by_engine.items():
            stream.by_engine[engine] = stream.by_engine.get(engine, 0) + n

    # -- hooks (no-ops here; subclasses may extend) --------------------------

    async def on_record_received(self, record: ContextualRecord) -> None:
        """Hook called for every parsed record before it is batched."""

    async def on_adapter_registered(self, session: AdapterSession) -> None:
        """Hook called after a session is created."""

    # -- observability --------------------------------------------------------

    def session_state(self, session_id: str) -> SessionIngestState | None:
        return self._state.get(session_id)

    def snapshot(self) -> dict[str, Any]:
        sessions = []
        for session_id, session in self._sessions.items():
            state = self._state.get(session_id)
            sessions.append(
                {
                    "session_id": session_id,
                    "adapter_id": session.adapter_id,
                    "state": session.state.value,
                    "clock_state": self.gates.state(session.adapter_id),
                    "started": session.started,
                    "records_received": session.records_received,
                    "buffered": len(state.buffer) if state else 0,
                    "parse_rejected": state.parse_rejected if state else 0,
                    "stats": state.stats.to_dict() if state else None,
                    "facts": state.facts.to_dict() if state and state.facts else None,
                    "last_error": state.last_error if state else None,
                    "callback_url": state.callback_url if state else None,
                }
            )
        return {
            "batch_size": self._batch_size,
            "sessions": sessions,
            "clock_gates": self.gates.describe(),
            "refused_registrations": dict(self._refused_registrations),
            "pipeline": self.pipeline.describe(),
        }
