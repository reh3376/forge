# ruff: noqa: UP017, TC001
"""Hub-side gRPC server — receives ContextualRecord streams from spoke sidecars.

The AdapterServiceServicer implements the server half of the AdapterService
gRPC contract. Spoke sidecars connect to this server to register, stream
data, and receive commands.

Architecture:
    Spoke Sidecar ──gRPC──► AdapterServiceServicer ──► Governance Pipeline
      (TS/Python)            (this module)

Until compiled proto stubs are available, this module provides the servicer
as an abstract base class with typed method signatures. The concrete
implementation will subclass this and wire to the gRPC server.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from forge_core.clock import utc_now
from forge_core.coerce import env_positive_int
from forge_core.link.serialization import (
    hub_time_to_proto,
    proto_to_pydantic,
    pydantic_to_proto,
)
from forge_core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    HubTime,
    SpokeTime,
)
from forge_core.models.contextual_record import ContextualRecord

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)

#: Why the hub refused or replaced a session (FB-292); each is named on the wire and on status.
SESSION_ACTIVE = "SESSION_ACTIVE"
SESSION_REPLACED = "SESSION_REPLACED"
SESSION_UNKNOWN = "SESSION_UNKNOWN"
SESSION_MISSING = "SESSION_MISSING"
SESSION_PEER_MISMATCH = "SESSION_PEER_MISMATCH"


def is_unguessable_session_id(session_id: str, module: str) -> bool:
    """Whether a session id is the hub's: 43 url-safe characters of random (256 bits), with
    nothing of the module's name in it (FB-292). For tests and checks."""
    return (
        len(session_id) == 43
        and all(c.isalnum() or c in "-_" for c in session_id)
        and module not in session_id
    )


class SessionRefusedError(ValueError):
    """A call refused for its session: unknown, for another module, or from another peer."""

    def __init__(self, cause: str, message: str) -> None:
        super().__init__(message)
        self.cause = cause


@dataclass
class AdapterSession:
    """Tracks a registered adapter's state on the hub side."""

    adapter_id: str
    session_id: str
    manifest: AdapterManifest
    state: AdapterState = AdapterState.REGISTERED
    configured: bool = False
    started: bool = False
    records_received: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    #: The identity of the connection that opened the session: its peer certificate under
    #: mutual TLS, ``None`` on an unauthenticated link (FB-292).
    peer: str | None = None
    #: The hub's monotonic time of the session's last call.
    last_seen: float = 0.0


class AdapterServiceServicer(ABC):
    """Abstract gRPC servicer for the AdapterService.

    Concrete implementations will inherit from this AND the generated
    AdapterServiceServicer from adapter_service_pb2_grpc. This base class
    provides the typed Python interface and session management.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, AdapterSession] = {}
        self._record_queues: dict[str, asyncio.Queue[ContextualRecord]] = {}
        #: The hub's clock: T2 and T3 of the time exchange are read from it (FB-092).
        self.clock: Callable[[], datetime] = utc_now
        #: Ages of sessions are measured on this, never on the wall clock (FB-292).
        self.monotonic: Callable[[], float] = time.monotonic
        #: A session with no call for this long is stale and may be replaced by a new
        #: Register; three health intervals by default (FB-292).
        self.stale_seconds = env_positive_int("FORGE_SESSION_STALE_SECONDS", 90)
        #: Sessions refused and replaced, by cause, and the latest events (FB-292).
        self.session_refusals: dict[str, int] = {}
        self.session_events: list[dict[str, Any]] = []

    # ── The time exchange (one clock, FB-092) ─────────────────────────────

    def hub_time(self, received_at: datetime) -> dict[str, Any]:
        """The hub's half of an exchange as a proto dict: T2 ``received_at``, T3 now.

        The transport calls ``clock()`` when a Register, Health or Ingest request
        arrives and this when it answers, so the time the hub spent on the request
        drops out of the spoke's measurement.
        """
        return hub_time_to_proto(HubTime(receive_time=received_at, transmit_time=self.clock()))

    # ── Session management ────────────────────────────────────────────────

    def _get_session(self, adapter_id: str, session_id: str) -> AdapterSession:
        """Look up a session, raising ValueError if not found; a found session is touched."""
        session = self._sessions.get(session_id)
        if session is None or session.adapter_id != adapter_id:
            msg = f"No session '{session_id}' for adapter '{adapter_id}'"
            raise SessionRefusedError(SESSION_UNKNOWN, msg)
        session.last_seen = self.monotonic()
        return session

    def check_session(
        self, adapter_id: str | None, session_id: str | None, peer: str | None
    ) -> AdapterSession:
        """The session a call names, if the call may use it (FB-292).

        Refused, by name: a call that names no session or no module; a session that does
        not exist or belongs to another module; a session opened by another connection
        identity (under mutual TLS). A session that passes is touched.
        """
        if not session_id or not adapter_id:
            missing = "session" if not session_id else "module"
            msg = f"{SESSION_MISSING}: the call names no {missing}; nothing is guessed (FB-292)"
            self._note_session_event(adapter_id or "", SESSION_MISSING, msg)
            raise SessionRefusedError(SESSION_MISSING, msg)
        session = self._get_session(adapter_id, session_id)
        if session.peer is not None and peer != session.peer:
            msg = (
                f"{SESSION_PEER_MISMATCH}: the session of '{adapter_id}' was opened by "
                f"another connection identity; it is not usable from this one (FB-292)"
            )
            self._note_session_event(adapter_id, SESSION_PEER_MISMATCH, msg)
            raise SessionRefusedError(SESSION_PEER_MISMATCH, msg)
        return session

    def _note_session_event(self, adapter_id: str, cause: str, message: str) -> None:
        """Count and keep a refused or replaced session, for status and the API."""
        self.session_refusals[cause] = self.session_refusals.get(cause, 0) + 1
        self.session_events.append(
            {
                "at": self.clock().isoformat(),
                "adapter_id": adapter_id,
                "cause": cause,
                "message": message,
            }
        )
        del self.session_events[:-50]
        logger.warning("Session %s for %s: %s", cause, adapter_id or "?", message)

    def describe_sessions(self) -> dict[str, Any]:
        """Open sessions, refusals and replacements by cause, for ``/v1/info`` (FB-292)."""
        now = self.monotonic()
        return {
            "stale_after_seconds": self.stale_seconds,
            "open": [
                {
                    "adapter_id": s.adapter_id,
                    "bound_to_peer": s.peer is not None,
                    "active": now - s.last_seen < self.stale_seconds,
                }
                for s in self._sessions.values()
            ],
            "refusals": dict(self.session_refusals),
            "recent": list(self.session_events[-10:]),
        }

    async def on_session_replaced(self, session: AdapterSession) -> None:
        """Hook: a stale session was replaced by a new Register for its module."""
        logger.debug("Session %s of %s replaced", session.session_id[:8], session.adapter_id)

    # ── Control plane ─────────────────────────────────────────────────────

    async def register(
        self,
        manifest_dict: dict[str, Any],
        *,
        spoke_time: SpokeTime | None = None,
        peer: str | None = None,
    ) -> dict[str, Any]:
        """Register a new adapter with the hub.

        ``spoke_time`` is the spoke's half of the time exchange (FB-092): T1 of this
        call and, from a spoke that has completed an exchange, the offset it measured.
        This base class does not judge it; :class:`HubIngestServicer` does (FB-093).

        Returns: {accepted: bool, message: str, session_id: str}, with
        ``refusal_cause`` when the hub refused the registration under a named cause.
        """
        manifest = proto_to_pydantic(manifest_dict, "AdapterManifest")
        adapter_id = manifest.adapter_id
        now = self.monotonic()
        existing = [s for s in self._sessions.values() if s.adapter_id == adapter_id]
        # Under mutual TLS the same certificate identity is the same module: it may replace
        # its own active session at once (a quick restart). Any other caller waits until
        # the session is stale.
        active = [
            s
            for s in existing
            if now - s.last_seen < self.stale_seconds and (peer is None or s.peer != peer)
        ]
        if active:
            age = now - max(s.last_seen for s in active)
            message = (
                f"{SESSION_ACTIVE}: '{adapter_id}' already has an active session (its last "
                f"call {age:.0f} s ago, under {self.stale_seconds} s); a second Register is "
                "refused while it is active, so no caller can take over a running module "
                "(FB-292)"
            )
            self._note_session_event(adapter_id, SESSION_ACTIVE, message)
            return {
                "accepted": False,
                "message": message,
                "session_id": "",
                "refusal_cause": SESSION_ACTIVE,
            }
        for stale in existing:
            self._sessions.pop(stale.session_id, None)
            self._record_queues.pop(stale.session_id, None)
            self._note_session_event(
                adapter_id,
                SESSION_REPLACED,
                f"{SESSION_REPLACED}: the stale session of '{adapter_id}' (no call for "
                f"{now - stale.last_seen:.0f} s) was replaced by a new Register (FB-292)",
            )
            await self.on_session_replaced(stale)
        # Unguessable: a session id is the only proof of a session on an unauthenticated link.
        session_id = secrets.token_urlsafe(32)

        session = AdapterSession(
            adapter_id=adapter_id,
            session_id=session_id,
            manifest=manifest,
            peer=peer,
            last_seen=now,
        )
        self._sessions[session_id] = session
        self._record_queues[session_id] = asyncio.Queue()
        await self.on_adapter_registered(session)

        logger.info(
            "Adapter registered: %s (session: %s)",
            manifest.adapter_id,
            session_id,
        )
        return {"accepted": True, "message": "OK", "session_id": session_id}

    async def configure(
        self,
        adapter_id: str,
        session_id: str,
        params: dict[str, str],
    ) -> dict[str, Any]:
        """Configure the adapter with connection parameters."""
        session = self._get_session(adapter_id, session_id)
        session.configured = True
        session.state = AdapterState.CONNECTING
        logger.info("Adapter configured: %s", adapter_id)
        return {"success": True, "message": "Configured"}

    async def start(
        self,
        adapter_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        """Begin active operation."""
        session = self._get_session(adapter_id, session_id)
        if not session.configured:
            return {"success": False, "message": "Not configured"}
        session.started = True
        session.state = AdapterState.HEALTHY
        logger.info("Adapter started: %s", adapter_id)
        return {"success": True, "message": "Started"}

    async def stop(
        self,
        adapter_id: str,
        session_id: str,
        graceful: bool = True,
    ) -> dict[str, Any]:
        """Graceful shutdown."""
        session = self._get_session(adapter_id, session_id)
        session.started = False
        session.state = AdapterState.STOPPED
        flushed = 0
        if graceful:
            q = self._record_queues.get(session_id)
            if q:
                flushed = q.qsize()
        logger.info("Adapter stopped: %s (flushed %d)", adapter_id, flushed)
        return {"success": True, "message": "Stopped", "records_flushed": flushed}

    async def health(
        self,
        adapter_id: str,
        session_id: str,
        *,
        spoke_time: SpokeTime | None = None,
    ) -> dict[str, Any]:
        """Return current health status.

        ``spoke_time`` is the spoke's half of the time exchange (FB-092): T1 of this
        call and the offset and round trip it measured in its last one. This base
        class keeps no clock series; :class:`HubIngestServicer` does.
        """
        session = self._get_session(adapter_id, session_id)
        health = AdapterHealth(
            adapter_id=adapter_id,
            state=session.state,
            last_check=datetime.now(timezone.utc),
            last_healthy=(
                datetime.now(timezone.utc) if session.state == AdapterState.HEALTHY else None
            ),
            records_collected=session.records_received,
        )
        return pydantic_to_proto(health)

    # ── Data plane ────────────────────────────────────────────────────────

    async def receive_record(
        self,
        session_id: str,
        record_dict: dict[str, Any],
    ) -> None:
        """Receive a single ContextualRecord from a spoke sidecar.

        This is called by the gRPC streaming handler for each record
        in the Collect() or Subscribe() stream.
        """
        record = proto_to_pydantic(record_dict, "ContextualRecord")
        q = self._record_queues.get(session_id)
        if q is None:
            msg = f"No record queue for session '{session_id}'"
            raise ValueError(msg)

        await q.put(record)
        session = self._sessions[session_id]
        session.records_received += 1
        await self.on_record_received(record)

    async def drain_records(
        self,
        session_id: str,
        max_records: int = 0,
    ) -> list[ContextualRecord]:
        """Drain received records from the queue.

        Args:
            session_id: The adapter session to drain.
            max_records: Maximum records to return (0 = all available).

        Returns: List of ContextualRecord instances.
        """
        q = self._record_queues.get(session_id)
        if q is None:
            return []
        records: list[ContextualRecord] = []
        count = 0
        while not q.empty():
            if max_records > 0 and count >= max_records:
                break
            records.append(q.get_nowait())
            count += 1
        return records

    # ── Abstract hooks for subclass customization ─────────────────────────

    @abstractmethod
    async def on_record_received(self, record: ContextualRecord) -> None:
        """Called after each record is received and queued.

        Override to feed records into the governance pipeline,
        emit metrics, or trigger downstream processing.
        """

    @abstractmethod
    async def on_adapter_registered(self, session: AdapterSession) -> None:
        """Called after a new adapter is registered.

        Override to validate the manifest against FACTS specs,
        provision storage, or notify operators.
        """


class InMemoryServicer(AdapterServiceServicer):
    """Concrete in-memory servicer for testing.

    Records are queued in memory. No governance pipeline.
    """

    async def on_record_received(self, record: ContextualRecord) -> None:
        """No-op for testing."""

    async def on_adapter_registered(self, session: AdapterSession) -> None:
        """No-op for testing."""
