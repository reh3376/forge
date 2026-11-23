"""Write vocabulary of the contract: the outcome of a write and the role that makes it.

Shared by the view contract (FVTS) and every module that writes to a process controller,
so it lives in the shared foundation, not in one module (D-17, S-1).
"""

from __future__ import annotations

import enum


class WriteStatus(enum.StrEnum):
    """Outcome of a control write attempt."""

    CONFIRMED = "CONFIRMED"  # Write succeeded, read-back matched
    UNCONFIRMED = "UNCONFIRMED"  # Write sent, read-back didn't match
    REJECTED_VALIDATION = "REJECTED_VALIDATION"  # Type/range check failed
    REJECTED_INTERLOCK = "REJECTED_INTERLOCK"  # Safety interlock blocked
    REJECTED_AUTH = "REJECTED_AUTH"  # Role/permission check failed
    REJECTED_REVIEW = "REJECTED_REVIEW"  # Two-step review or reason code missing/invalid
    FAILED_WRITE = "FAILED_WRITE"  # OPC-UA write error
    FAILED_READBACK = "FAILED_READBACK"  # Read-back attempt failed
    PENDING = "PENDING"  # Not yet processed


class WriteRole(enum.StrEnum):
    """Operator roles for control write authorization.

    Hierarchy: ADMIN > ENGINEER > OPERATOR.
    ADMIN can bypass interlocks (with reason).
    """

    OPERATOR = "OPERATOR"
    ENGINEER = "ENGINEER"
    ADMIN = "ADMIN"

    @property
    def rank(self) -> int:
        return _ROLE_RANK[self]

    def has_authority_over(self, other: WriteRole) -> bool:
        return self.rank >= other.rank


_ROLE_RANK: dict[WriteRole, int] = {
    WriteRole.OPERATOR: 0,
    WriteRole.ENGINEER: 1,
    WriteRole.ADMIN: 2,
}
