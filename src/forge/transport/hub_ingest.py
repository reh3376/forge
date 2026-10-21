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
"""

from __future__ import annotations

import inspect
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.core.models.adapter import AdapterHealth, AdapterManifest
from forge.ingest.facts_check import FactsCheckResult, check_manifest_against_facts
from forge.ingest.pipeline import IngestOutcome, IngestPipeline, IngestStats
from forge.transport.hub_server import AdapterServiceServicer, AdapterSession
from forge.transport.serialization import proto_to_pydantic, pydantic_to_proto
from forge.transport.spoke_callback import CALLBACK_PARAM

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from forge.core.models.contextual_record import ContextualRecord
    from forge.transport.spoke_callback import WriteDispatcher

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
        self.write_dispatcher = write_dispatcher
        self._batch_size = max(1, batch_size)
        self._specs_dir = specs_dir
        self._require_facts = require_facts
        self._on_registered = on_registered
        self._on_health = on_health
        self._ingest_log = ingest_log
        self._state: dict[str, SessionIngestState] = {}

    # -- control plane --------------------------------------------------------

    async def register(self, manifest_dict: dict[str, Any]) -> dict[str, Any]:
        manifest = proto_to_pydantic(manifest_dict, "AdapterManifest")
        check = check_manifest_against_facts(
            manifest, specs_dir=self._specs_dir, require_spec=self._require_facts
        )
        if not check.ok:
            logger.warning("Registration rejected for %s: %s", manifest.adapter_id, check.summary())
            return {"accepted": False, "message": check.summary(), "session_id": ""}

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

    async def health(self, adapter_id: str, session_id: str) -> dict[str, Any]:
        session = self._get_session(adapter_id, session_id)
        state = self._state.get(session_id)
        now = datetime.now(UTC)
        stats = state.stats if state else IngestStats()
        failed = stats.rejected + stats.failed + (state.parse_rejected if state else 0)
        health = AdapterHealth(
            adapter_id=adapter_id,
            state=session.state,
            last_check=now,
            last_healthy=now if session.state.value == "healthy" else None,
            error_message=state.last_error if state else None,
            records_collected=stats.persisted,
            records_failed=failed,
            uptime_seconds=(now - session.created_at).total_seconds(),
            clock=self.pipeline.offsets.stats(adapter_id),
        )
        if self._on_health is not None:
            try:
                await _maybe_await(self._on_health(adapter_id, health))
            except Exception:  # pragma: no cover - callback is best effort
                logger.exception("on_health callback failed for %s", adapter_id)
        return pydantic_to_proto(health)

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
            "pipeline": self.pipeline.describe(),
        }
