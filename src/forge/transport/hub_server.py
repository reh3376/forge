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
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
)
from forge.core.models.contextual_record import ContextualRecord
from forge.transport.serialization import proto_to_pydantic, pydantic_to_proto

logger = logging.getLogger(__name__)


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


class AdapterServiceServicer(ABC):
    """Abstract gRPC servicer for the AdapterService.

    Concrete implementations will inherit from this AND the generated
    AdapterServiceServicer from adapter_service_pb2_grpc. This base class
    provides the typed Python interface and session management.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, AdapterSession] = {}
        self._record_queues: dict[str, asyncio.Queue[ContextualRecord]] = {}

    # ── Session management ────────────────────────────────────────────────

    def _get_session(self, adapter_id: str, session_id: str) -> AdapterSession:
        """Look up a session, raising ValueError if not found."""
        session = self._sessions.get(session_id)
        if session is None or session.adapter_id != adapter_id:
            msg = f"No session '{session_id}' for adapter '{adapter_id}'"
            raise ValueError(msg)
        return session

    # ── Control plane ─────────────────────────────────────────────────────

    async def register(
        self, manifest_dict: dict[str, Any],
    ) -> dict[str, Any]:
        """Register a new adapter with the hub.

        Returns: {accepted: bool, message: str, session_id: str}
        """
        manifest = proto_to_pydantic(manifest_dict, "AdapterManifest")
        session_id = f"session-{manifest.adapter_id}-{len(self._sessions)}"

        session = AdapterSession(
            adapter_id=manifest.adapter_id,
            session_id=session_id,
            manifest=manifest,
        )
        self._sessions[session_id] = session
        self._record_queues[session_id] = asyncio.Queue()

        logger.info(
            "Adapter registered: %s (session: %s)", manifest.adapter_id, session_id,
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
        self, adapter_id: str, session_id: str,
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
        self, adapter_id: str, session_id: str,
    ) -> dict[str, Any]:
        """Return current health status."""
        session = self._get_session(adapter_id, session_id)
        health = AdapterHealth(
            adapter_id=adapter_id,
            state=session.state,
            last_check=datetime.now(timezone.utc),
            last_healthy=(
                datetime.now(timezone.utc)
                if session.state == AdapterState.HEALTHY
                else None
            ),
            records_collected=session.records_received,
        )
        return pydantic_to_proto(health)

    # ── Data plane ────────────────────────────────────────────────────────

    async def receive_record(
        self, session_id: str, record_dict: dict[str, Any],
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

    async def drain_records(
        self, session_id: str, max_records: int = 0,
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
