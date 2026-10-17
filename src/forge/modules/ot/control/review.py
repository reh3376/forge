"""Write review gate (FB-074) — server-side two-step confirmation and reason codes.

Second gate in the control write defense chain.  FVTS declares, per UI
action, that a tag write is confirmed in one step (``confirm``) or in two
(``two_step_with_review``: the user enters a value, reviews old against
new and confirms) and whether a reason code is required.  A UI can draw
those dialogs; it cannot be trusted to have shown them.  This module makes
the policy a property of the tag, enforced in the core:

1. ``TagWriteConfig.confirmation == two_step_with_review`` — an operator
   write must first be **staged** (:meth:`ControlWriteEngine.stage`): the
   chain runs up to authorization, the current value is read, and a
   single-use **review token** bound to (tag, value, requestor) is issued
   with an expiry.  The **commit** (:meth:`ControlWriteEngine.execute`)
   must present that token; a write without it, with a used or expired
   one, or for a different value is ``REJECTED_REVIEW``.
2. ``TagWriteConfig.reason_code_required`` — operator writes must carry
   ``WriteRequest.reason_code``; when the site configures a vocabulary
   (``OTControlConfig.reason_codes``) the code must be in it.

Both rules govern **operator** writes (``WriteOrigin.OPERATOR``, the
default).  ``WriteOrigin.SYSTEM`` writes — recipe downloads and CIP
starts driven by the changeover sequence — were confirmed upstream and
pass the gate with ``review_passed`` recorded; they still face validation,
interlocks, authorization and read-back like every other write.

Design notes:
- Tokens are single-use: a commit consumes the ticket whatever the
  outcome, so a write rejected by an interlock that changed between stage
  and commit must be staged (and reviewed) again.
- The pending set is bounded and expired tickets are evicted lazily; a
  staged write that is never committed costs nothing after its timeout.
- The hub-level pending-action record of ``docs/decisions/roles.md`` §6
  (multi-party approval, ``requires_approval(role)``) is the next step on
  top of this gate; it is gated by the role model decision (D-1).
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from forge.modules.ot.control.models import (
    ConfirmationMode,
    DataType,
    TagWriteConfig,
    WriteOrigin,
    WriteRequest,
    WriteResult,
    WriteStatus,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from forge.modules.ot.control.validation import WriteValidator

logger = logging.getLogger(__name__)

DEFAULT_REVIEW_TIMEOUT_SECONDS = 120.0
DEFAULT_MAX_PENDING = 1_000
_TOKEN_BYTES = 24


@dataclass(frozen=True)
class ReviewTicket:
    """A staged operator write awaiting review and commit."""

    review_token: str
    tag_path: str
    value: Any  # coerced to the tag's data type
    data_type: DataType
    requestor: str
    reason: str
    reason_code: str
    current_value: Any  # read when staged; what the reviewer compares against
    staged_at: datetime
    expires_at: datetime
    area: str = ""
    equipment_id: str = ""
    engineering_units: str = ""
    min_value: float | None = None
    max_value: float | None = None
    confirmation: ConfirmationMode = ConfirmationMode.CONFIRM
    reason_code_required: bool = False

    def expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def to_dict(self, *, include_token: bool = True) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": "STAGED",
            "tag_path": self.tag_path,
            "requested_value": self.value,
            "current_value": self.current_value,
            "data_type": self.data_type.value,
            "engineering_units": self.engineering_units,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "requestor": self.requestor,
            "reason": self.reason,
            "reason_code": self.reason_code,
            "area": self.area,
            "equipment_id": self.equipment_id,
            "confirmation": self.confirmation.value,
            "reason_code_required": self.reason_code_required,
            "staged_at": self.staged_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }
        if include_token:
            payload["review_token"] = self.review_token
        return payload


class WriteReviewer:
    """Issues review tickets and enforces the review policy on commit.

    Usage::

        reviewer = WriteReviewer(validator, timeout_seconds=120, reason_codes=["setpoint_tune"])
        ticket = reviewer.stage(request, current_value=150.0)   # after layers 1-3 passed
        ...
        reviewer.check(commit_request, result)                 # result.review_passed
    """

    def __init__(
        self,
        validator: WriteValidator,
        *,
        timeout_seconds: float = DEFAULT_REVIEW_TIMEOUT_SECONDS,
        reason_codes: Iterable[str] = (),
        max_pending: int = DEFAULT_MAX_PENDING,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if timeout_seconds <= 0:
            msg = "review timeout must be positive"
            raise ValueError(msg)
        if max_pending <= 0:
            msg = "max_pending must be positive"
            raise ValueError(msg)
        self._validator = validator
        self._timeout = timedelta(seconds=timeout_seconds)
        self._reason_codes = frozenset(code for code in reason_codes if code)
        self._max_pending = max_pending
        self._now = now or (lambda: datetime.now(UTC))
        self._pending: dict[str, ReviewTicket] = {}
        self._staged = 0
        self._committed = 0
        self._expired = 0
        self._rejected = 0
        self._cancelled = 0

    # -- policy --------------------------------------------------------------

    @property
    def timeout(self) -> timedelta:
        return self._timeout

    @property
    def reason_codes(self) -> frozenset[str]:
        """Site vocabulary; empty means any non-blank code is accepted."""
        return self._reason_codes

    def policy_for(self, tag_path: str) -> TagWriteConfig | None:
        return self._validator.get_config(tag_path)

    def requires_two_step(self, tag_path: str) -> bool:
        config = self.policy_for(tag_path)
        return config is not None and config.confirmation is ConfirmationMode.TWO_STEP_WITH_REVIEW

    def check_reason(self, request: WriteRequest, result: WriteResult) -> bool:
        """Reason-code rule only (used when staging).  Sets the rejection on failure."""
        if request.origin is WriteOrigin.SYSTEM:
            return True
        config = self.policy_for(request.tag_path)
        if config is None or not config.reason_code_required:
            return True
        code = request.reason_code.strip()
        if not code:
            return self._reject(result, f"Tag {request.tag_path} requires a reason code")
        if self._reason_codes and code not in self._reason_codes:
            return self._reject(
                result,
                f"Reason code '{code}' is not one of {sorted(self._reason_codes)}",
            )
        return True

    def check(self, request: WriteRequest, result: WriteResult) -> WriteResult:
        """The gate ``ControlWriteEngine.execute`` runs after validation.

        Mutates and returns *result*: ``review_passed`` on success,
        ``REJECTED_REVIEW`` with ``review_error`` otherwise.  A presented
        token is consumed whatever the outcome.
        """
        if request.origin is WriteOrigin.SYSTEM:
            result.review_passed = True
            return result
        if not self.check_reason(request, result):
            return result
        if not self.requires_two_step(request.tag_path):
            result.review_passed = True
            return result

        token = request.review_token
        if not token:
            self._reject(
                result,
                f"Tag {request.tag_path} requires two-step review: stage the write, "
                "review it and commit with its review token",
            )
            return result
        ticket = self._pending.pop(token, None)
        if ticket is None:
            self._reject(result, "Unknown, expired or already used review token")
            return result
        now = self._now()
        if ticket.expired(now):
            self._expired += 1
            self._reject(result, f"Review token expired at {ticket.expires_at.isoformat()}")
            return result
        if not self._same_write(ticket, request):
            self._reject(
                result,
                "Review token was issued for a different write (tag, value or requestor)",
            )
            return result
        result.review_passed = True
        result.staged_at = ticket.staged_at
        self._committed += 1
        return result

    # -- tickets -------------------------------------------------------------

    def stage(self, request: WriteRequest, current_value: Any) -> ReviewTicket:
        """Issue a ticket for *request* (the caller has run layers 1-3)."""
        config = self.policy_for(request.tag_path)
        if config is None:
            msg = f"No write config registered for tag: {request.tag_path}"
            raise LookupError(msg)
        now = self._now()
        self._evict_expired(now)
        while len(self._pending) >= self._max_pending:
            oldest = next(iter(self._pending))
            del self._pending[oldest]
            self._expired += 1
        ticket = ReviewTicket(
            review_token=secrets.token_urlsafe(_TOKEN_BYTES),
            tag_path=request.tag_path,
            value=config.coerce(request.value),
            data_type=config.data_type,
            requestor=request.requestor,
            reason=request.reason,
            reason_code=request.reason_code,
            current_value=current_value,
            staged_at=now,
            expires_at=now + self._timeout,
            area=request.area,
            equipment_id=request.equipment_id,
            engineering_units=config.engineering_units,
            min_value=config.min_value,
            max_value=config.max_value,
            confirmation=config.confirmation,
            reason_code_required=config.reason_code_required,
        )
        self._pending[ticket.review_token] = ticket
        self._staged += 1
        return ticket

    def cancel(self, review_token: str) -> bool:
        """Drop a staged write.  Returns True if it was pending."""
        if self._pending.pop(review_token, None) is None:
            return False
        self._cancelled += 1
        return True

    def get(self, review_token: str) -> ReviewTicket | None:
        """A pending ticket (None when unknown or expired)."""
        ticket = self._pending.get(review_token)
        if ticket is None:
            return None
        if ticket.expired(self._now()):
            del self._pending[review_token]
            self._expired += 1
            return None
        return ticket

    def pending(self) -> list[dict[str, Any]]:
        """Staged writes, oldest first, without their tokens."""
        self._evict_expired(self._now())
        return [ticket.to_dict(include_token=False) for ticket in self._pending.values()]

    @property
    def pending_count(self) -> int:
        self._evict_expired(self._now())
        return len(self._pending)

    def stats(self) -> dict[str, Any]:
        return {
            "pending": self.pending_count,
            "staged": self._staged,
            "committed": self._committed,
            "expired": self._expired,
            "rejected": self._rejected,
            "cancelled": self._cancelled,
            "timeout_seconds": self._timeout.total_seconds(),
            "reason_codes": sorted(self._reason_codes),
        }

    # -- internals -----------------------------------------------------------

    def _reject(self, result: WriteResult, message: str) -> bool:
        result.review_passed = False
        result.review_error = message
        result.status = WriteStatus.REJECTED_REVIEW
        self._rejected += 1
        return False

    def _same_write(self, ticket: ReviewTicket, request: WriteRequest) -> bool:
        if ticket.tag_path != request.tag_path or ticket.requestor != request.requestor:
            return False
        config = self.policy_for(request.tag_path)
        try:
            value = config.coerce(request.value) if config is not None else request.value
        except (TypeError, ValueError):
            return False
        return value == ticket.value

    def _evict_expired(self, now: datetime) -> None:
        expired = [token for token, ticket in self._pending.items() if ticket.expired(now)]
        for token in expired:
            del self._pending[token]
        self._expired += len(expired)
