"""Control write engine — the orchestrator.

Chains the five defense layers sequentially and short-circuits on any
rejection:

    1. Type/Range Validation  (WriteValidator)
    2. Write Review           (WriteReviewer, FB-074)
    3. Safety Interlocks      (InterlockEngine)
    4. Role-Based Auth        (WriteAuthorizer)
    5. OPC-UA Write + Read-Back

The OPC-UA write and read-back are behind injected Protocols so this
module has zero transport dependencies.

Two-step review (FB-074): ``stage`` runs layers 1, 3 and 4 plus the
reason-code rule, reads the current value and issues a single-use review
token; ``execute`` with that token is the commit.  A tag configured
``two_step_with_review`` rejects an operator write that skips the stage
(``REJECTED_REVIEW``).  System writes (``WriteOrigin.SYSTEM``) are
confirmed upstream and pass layer 2.

Design notes:
- Every write attempt produces a WriteResult — even rejected writes.
  This makes the audit trail complete.  A rejected ``stage`` is journaled
  too (``stage_attempt``); a successful stage is not, nothing was written.
- Read-back comparison uses a configurable tolerance for floating-point
  types (PLC may store 100 as 99.99998).
- The engine maintains a bounded write journal (deque) for recent
  write auditing.  Long-term persistence is handled by the audit layer
  (Epic 4.2).
- Batch writes (request.batch_id != "") are tagged but not transactional
  — each write in a batch is independent.  True batch atomicity requires
  PLC-level support that OPC-UA doesn't universally guarantee.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol, runtime_checkable, TYPE_CHECKING

from forge.modules.ot.control.models import (
    DataType,
    WriteRequest,
    WriteResult,
    WriteStatus,
)
from forge.modules.ot.control.review import ReviewTicket, WriteReviewer

if TYPE_CHECKING:
    from forge.modules.ot.control.interlock import InterlockEngine
    from forge.modules.ot.control.authorization import WriteAuthorizer
    from forge.modules.ot.control.validation import WriteValidator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tag writer protocol (OPC-UA abstraction)
# ---------------------------------------------------------------------------


@runtime_checkable
class TagWriter(Protocol):
    """Writes a value to a PLC tag and reads it back."""

    async def write_tag(self, tag_path: str, value: Any) -> None:
        """Write a value to the tag.  Raise on failure."""
        ...

    async def read_tag(self, tag_path: str) -> Any:
        """Read the current value of a tag.  Raise on failure."""
        ...


class _NullWriter:
    """Fallback writer for testing — writes succeed, reads return the
    written value."""

    def __init__(self) -> None:
        self._values: dict[str, Any] = {}

    async def write_tag(self, tag_path: str, value: Any) -> None:
        self._values[tag_path] = value

    async def read_tag(self, tag_path: str) -> Any:
        return self._values.get(tag_path)


# ---------------------------------------------------------------------------
# Write listener protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class WriteListener(Protocol):
    """Called after every write attempt (success or failure)."""

    async def on_write_result(self, result: WriteResult) -> None: ...


# ---------------------------------------------------------------------------
# Control write engine
# ---------------------------------------------------------------------------


_DEFAULT_JOURNAL_SIZE = 10_000
_DEFAULT_READBACK_TOLERANCE = 0.001


@dataclass(frozen=True)
class StageOutcome:
    """What ``ControlWriteEngine.stage`` returns: a ticket, or the rejection."""

    ticket: ReviewTicket | None = None
    result: WriteResult | None = None

    @property
    def accepted(self) -> bool:
        return self.ticket is not None

    def to_dict(self) -> dict[str, Any]:
        if self.ticket is not None:
            return self.ticket.to_dict()
        assert self.result is not None
        return self.result.to_dict()


class ControlWriteEngine:
    """Orchestrates the 5-layer control write defense chain.

    Usage::

        engine = ControlWriteEngine(
            validator=validator,
            interlock_engine=interlock_engine,
            authorizer=authorizer,
            tag_writer=opc_client,
        )

        result = await engine.execute(request)
        # result.status is CONFIRMED, UNCONFIRMED, or REJECTED_*

    Two-step review (FB-074)::

        staged = await engine.stage(request)        # ticket or rejection
        if staged.accepted:
            commit = replace(request, review_token=staged.ticket.review_token)
            result = await engine.execute(commit)
    """

    def __init__(
        self,
        validator: WriteValidator,
        interlock_engine: InterlockEngine,
        authorizer: WriteAuthorizer,
        tag_writer: TagWriter | None = None,
        journal_size: int = _DEFAULT_JOURNAL_SIZE,
        readback_tolerance: float = _DEFAULT_READBACK_TOLERANCE,
        reviewer: WriteReviewer | None = None,
    ) -> None:
        self._validator = validator
        self._interlocks = interlock_engine
        self._authorizer = authorizer
        self._reviewer = reviewer or WriteReviewer(validator)
        self._writer: TagWriter = tag_writer or _NullWriter()
        self._readback_tolerance = readback_tolerance

        # Bounded write journal
        self._journal: deque[WriteResult] = deque(maxlen=journal_size)

        # Listeners (audit trail, integrations)
        self._listeners: list[WriteListener] = []

    @property
    def reviewer(self) -> WriteReviewer:
        return self._reviewer

    # -- Listener management -------------------------------------------------

    def add_listener(self, listener: WriteListener) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: WriteListener) -> None:
        self._listeners = [ln for ln in self._listeners if ln is not listener]

    # -- Main execution chain ------------------------------------------------

    async def execute(self, request: WriteRequest) -> WriteResult:
        """Execute a control write through the full defense chain.

        Returns a WriteResult regardless of outcome — the caller never
        needs to catch exceptions for normal flow.
        """
        result = WriteResult(request=request)

        # Layer 1: Type/Range Validation
        self._validator.validate(request, result)
        if not result.validation_passed:
            return await self._finish(result)

        # Layer 2: Write Review — reason code and two-step token (FB-074)
        self._reviewer.check(request, result)
        if not result.review_passed:
            return await self._finish(result)

        # Layer 3: Safety Interlocks (async — reads live tags)
        await self._interlocks.check(request, result)
        if not result.interlock_passed:
            return await self._finish(result)

        # Layer 4: Role-Based Authorization
        self._authorizer.authorize(request, result)
        if not result.auth_passed:
            return await self._finish(result)

        # Layer 5: OPC-UA Write + Read-Back
        await self._write_and_readback(request, result)
        return await self._finish(result)

    async def stage(self, request: WriteRequest) -> StageOutcome:
        """Step one of a two-step write: check, read the current value, issue a token.

        Runs validation, the reason-code rule, interlocks and authorization
        exactly as a commit would, so the operator reviews a write the chain
        has already accepted.  A rejection is journaled and audited like any
        other attempt (``stage_attempt``); nothing is written either way.
        """
        result = WriteResult(request=request, stage_attempt=True)

        self._validator.validate(request, result)
        if not result.validation_passed:
            return StageOutcome(result=await self._finish(result))

        if not self._reviewer.check_reason(request, result):
            return StageOutcome(result=await self._finish(result))

        await self._interlocks.check(request, result)
        if not result.interlock_passed:
            return StageOutcome(result=await self._finish(result))

        self._authorizer.authorize(request, result)
        if not result.auth_passed:
            return StageOutcome(result=await self._finish(result))

        current: Any = None
        try:
            current = await self._writer.read_tag(request.tag_path)
        except Exception as exc:
            logger.warning("Pre-stage read failed for %s: %s", request.tag_path, exc)

        ticket = self._reviewer.stage(request, current)
        logger.info(
            "Write staged for review: tag=%s value=%r current=%r requestor=%s expires=%s",
            ticket.tag_path,
            ticket.value,
            ticket.current_value,
            ticket.requestor,
            ticket.expires_at.isoformat(),
        )
        return StageOutcome(ticket=ticket)

    async def _finish(self, result: WriteResult) -> WriteResult:
        """Journal the outcome and tell every listener (audit trail)."""
        self._record(result)
        await self.notify_listeners(result)
        return result

    # -- Layer 5: Write + Read-Back ------------------------------------------

    async def _write_and_readback(self, request: WriteRequest, result: WriteResult) -> None:
        """Perform the OPC-UA write and read-back confirmation."""
        # Read old value (best-effort)
        try:
            result.old_value = await self._writer.read_tag(request.tag_path)
        except Exception as exc:
            logger.warning("Pre-write read failed for %s: %s", request.tag_path, exc)

        # Write
        result.write_sent_at = datetime.now(UTC)
        try:
            await self._writer.write_tag(request.tag_path, request.value)
        except Exception as exc:
            result.status = WriteStatus.FAILED_WRITE
            result.write_error = str(exc)
            result.completed_at = datetime.now(UTC)
            return

        # Read-back
        result.readback_at = datetime.now(UTC)
        try:
            result.new_value = await self._writer.read_tag(request.tag_path)
        except Exception as exc:
            result.status = WriteStatus.FAILED_READBACK
            result.readback_error = str(exc)
            result.completed_at = datetime.now(UTC)
            return

        # Compare
        result.readback_matched = self._values_match(
            request.value, result.new_value, request.data_type
        )

        if result.readback_matched:
            result.status = WriteStatus.CONFIRMED
        else:
            result.status = WriteStatus.UNCONFIRMED

        result.completed_at = datetime.now(UTC)

    def _values_match(self, requested: Any, readback: Any, data_type: DataType) -> bool:
        """Compare requested value to read-back value with type-aware
        tolerance."""
        if readback is None:
            return False

        # Floating-point comparison with tolerance
        if data_type in (DataType.FLOAT, DataType.DOUBLE):
            try:
                req_f = float(requested)
                rb_f = float(readback)
                return abs(req_f - rb_f) <= self._readback_tolerance
            except (TypeError, ValueError):
                return False

        # Boolean: normalize both
        if data_type == DataType.BOOLEAN:
            return bool(requested) == bool(readback)

        # Integer types: exact match after coercion
        if data_type in (DataType.INT16, DataType.INT32, DataType.INT64):
            try:
                return int(requested) == int(readback)
            except (TypeError, ValueError):
                return False

        # String: exact match
        return str(requested) == str(readback)

    # -- Journal & notification ----------------------------------------------

    def _record(self, result: WriteResult) -> None:
        """Append to the bounded journal."""
        self._journal.append(result)

    async def notify_listeners(self, result: WriteResult) -> None:
        """Notify all write listeners.

        ``execute`` calls this for every attempt (FB-065); it stays public
        so a replayed or externally produced result can be audited too.
        A failing listener never affects the write outcome.
        """
        for listener in self._listeners:
            try:
                await listener.on_write_result(result)
            except Exception as exc:
                logger.error(
                    "Write listener %s failed: %s",
                    type(listener).__name__,
                    exc,
                )

    # -- Query API -----------------------------------------------------------

    def get_journal(self, limit: int = 100) -> list[dict[str, Any]]:
        """Return recent write results as dicts (newest first)."""
        entries = list(self._journal)
        entries.reverse()
        return [entry.to_dict() for entry in entries[:limit]]

    def get_stats(self) -> dict[str, Any]:
        """Return write engine statistics."""
        confirmed = sum(1 for r in self._journal if r.status == WriteStatus.CONFIRMED)
        unconfirmed = sum(1 for r in self._journal if r.status == WriteStatus.UNCONFIRMED)
        rejected = sum(
            1
            for r in self._journal
            if r.status
            in (
                WriteStatus.REJECTED_VALIDATION,
                WriteStatus.REJECTED_REVIEW,
                WriteStatus.REJECTED_INTERLOCK,
                WriteStatus.REJECTED_AUTH,
            )
        )
        failed = sum(
            1
            for r in self._journal
            if r.status in (WriteStatus.FAILED_WRITE, WriteStatus.FAILED_READBACK)
        )

        return {
            "journal_size": len(self._journal),
            "confirmed": confirmed,
            "unconfirmed": unconfirmed,
            "rejected": rejected,
            "failed": failed,
            "total_writes": len(self._journal),
            "tag_configs": self._validator.tag_count,
            "interlock_rules": self._interlocks.rule_count,
            "permissions": self._authorizer.permission_count,
            "review": self._reviewer.stats(),
        }
