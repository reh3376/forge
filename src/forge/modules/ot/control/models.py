"""Control write data models.

Defines the request/result types, roles, interlock rules, and per-tag
write configurations used by the control write engine.

Design notes:
- WriteRequest is frozen — once created, it cannot be mutated.  This
  ensures the audit trail captures exactly what was requested.
- WriteResult carries the full decision chain: validation, interlock,
  authorization, and OPC-UA outcome — so the audit log has complete context.
- WriteRole is deliberately simple (3 levels).  Complex RBAC is
  handled by WritePermission patterns, not by adding more roles.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class WriteStatus(str, enum.Enum):
    """Outcome of a control write attempt."""

    CONFIRMED = "CONFIRMED"  # Write succeeded, read-back matched
    UNCONFIRMED = "UNCONFIRMED"  # Write sent, read-back didn't match
    REJECTED_VALIDATION = "REJECTED_VALIDATION"  # Type/range check failed
    REJECTED_INTERLOCK = "REJECTED_INTERLOCK"  # Safety interlock blocked
    REJECTED_AUTH = "REJECTED_AUTH"  # Role/permission check failed
    FAILED_WRITE = "FAILED_WRITE"  # OPC-UA write error
    FAILED_READBACK = "FAILED_READBACK"  # Read-back attempt failed
    PENDING = "PENDING"  # Not yet processed


class WriteRole(str, enum.Enum):
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


class DataType(str, enum.Enum):
    """Supported write data types (maps to OPC-UA VariantTypes)."""

    BOOLEAN = "BOOLEAN"
    INT16 = "INT16"
    INT32 = "INT32"
    INT64 = "INT64"
    FLOAT = "FLOAT"
    DOUBLE = "DOUBLE"
    STRING = "STRING"


# ---------------------------------------------------------------------------
# Write request
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


@dataclass(frozen=True)
class WriteRequest:
    """Immutable control write request.

    Created by the operator/system, passed through the validation chain,
    and stored in the audit log regardless of outcome.
    """

    tag_path: str
    value: Any
    data_type: DataType = DataType.FLOAT
    requestor: str = ""
    role: WriteRole = WriteRole.OPERATOR
    reason: str = ""
    interlock_bypass: bool = False
    request_id: str = field(default_factory=_new_id)
    timestamp: datetime = field(default_factory=_now)
    area: str = ""
    equipment_id: str = ""
    batch_id: str = ""  # Non-empty for batch writes


# ---------------------------------------------------------------------------
# Write result
# ---------------------------------------------------------------------------


@dataclass
class WriteResult:
    """Outcome of a control write attempt.

    Mutable — populated by each stage of the validation chain.
    """

    request: WriteRequest
    status: WriteStatus = WriteStatus.PENDING
    old_value: Any = None
    new_value: Any = None  # Read-back value
    readback_matched: bool = False

    # Decision chain
    validation_passed: bool = False
    validation_error: str = ""
    interlock_passed: bool = False
    interlock_error: str = ""
    interlock_rule_id: str = ""
    auth_passed: bool = False
    auth_error: str = ""
    write_error: str = ""
    readback_error: str = ""

    # Timing
    write_sent_at: datetime | None = None
    readback_at: datetime | None = None
    completed_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        req = self.request
        return {
            "request_id": req.request_id,
            "tag_path": req.tag_path,
            "requested_value": req.value,
            "data_type": req.data_type.value,
            "requestor": req.requestor,
            "role": req.role.value,
            "reason": req.reason,
            "interlock_bypass": req.interlock_bypass,
            "area": req.area,
            "equipment_id": req.equipment_id,
            "batch_id": req.batch_id,
            "status": self.status.value,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "readback_matched": self.readback_matched,
            "validation_passed": self.validation_passed,
            "validation_error": self.validation_error,
            "interlock_passed": self.interlock_passed,
            "interlock_error": self.interlock_error,
            "interlock_rule_id": self.interlock_rule_id,
            "auth_passed": self.auth_passed,
            "auth_error": self.auth_error,
            "write_error": self.write_error,
            "readback_error": self.readback_error,
            "timestamp": req.timestamp.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


# ---------------------------------------------------------------------------
# Interlock rules
# ---------------------------------------------------------------------------


class InterlockCondition(str, enum.Enum):
    """How to evaluate the interlock check tag value."""

    EQUALS = "EQUALS"
    NOT_EQUALS = "NOT_EQUALS"
    GREATER_THAN = "GREATER_THAN"
    LESS_THAN = "LESS_THAN"
    IN_RANGE = "IN_RANGE"
    IS_TRUE = "IS_TRUE"
    IS_FALSE = "IS_FALSE"


@dataclass(frozen=True)
class InterlockRule:
    """Safety interlock rule.

    "Cannot write to ``target_tag_pattern`` while ``check_tag``
    satisfies ``condition`` against ``check_value``."

    Example: Cannot write to WH/WHK01/Distillery01/*/Valve_Open while
    WH/WHK01/Distillery01/Pump01/Running == True.
    """

    rule_id: str
    name: str
    target_tag_pattern: str  # fnmatch pattern for tags this rule protects
    check_tag: str  # Tag whose value is checked
    condition: InterlockCondition
    check_value: Any = None  # Value to compare against
    check_value_high: Any = None  # For IN_RANGE: upper bound
    description: str = ""
    enabled: bool = True
    bypass_min_role: WriteRole = WriteRole.ADMIN  # Minimum role to bypass


# ---------------------------------------------------------------------------
# Write permissions
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WritePermission:
    """Role-based write permission grant.

    Combines area pattern, tag pattern, and minimum role.
    Both patterns must match for the permission to apply.
    """

    permission_id: str = field(default_factory=_new_id)
    area_pattern: str = "*"  # fnmatch for area names
    tag_pattern: str = "**"  # fnmatch for tag paths
    min_role: WriteRole = WriteRole.OPERATOR
    granted_by: str = "forge-admin"
    description: str = ""


# ---------------------------------------------------------------------------
# Tag write configuration
# ---------------------------------------------------------------------------


@dataclass
class TagWriteConfig:
    """Per-tag write configuration.

    Defines the validation rules for a specific tag — data type,
    value range, and engineering units.  Used by WriteValidator.
    """

    tag_path: str
    data_type: DataType = DataType.FLOAT
    min_value: float | None = None
    max_value: float | None = None
    engineering_units: str = ""
    writable: bool = True
    description: str = ""

    def validate_value(self, value: Any) -> tuple[bool, str]:
        """Check if a value is valid for this tag. Returns (ok, error)."""
        if not self.writable:
            return False, f"Tag {self.tag_path} is not writable"

        # Type coercion check
        try:
            coerced = _coerce_value(value, self.data_type)
        except (TypeError, ValueError) as e:
            return False, f"Type error: cannot coerce {type(value).__name__} to {self.data_type.value}: {e}"

        # Range check (numeric types only)
        if self.data_type in (DataType.FLOAT, DataType.DOUBLE, DataType.INT16, DataType.INT32, DataType.INT64):
            try:
                fval = float(coerced)
            except (TypeError, ValueError):
                return True, ""  # Non-numeric after coercion — skip range check

            if self.min_value is not None and fval < self.min_value:
                return False, f"Value {fval} below minimum {self.min_value} {self.engineering_units}".strip()
            if self.max_value is not None and fval > self.max_value:
                return False, f"Value {fval} above maximum {self.max_value} {self.engineering_units}".strip()

        return True, ""


# ---------------------------------------------------------------------------
# Type coercion
# ---------------------------------------------------------------------------


def _coerce_value(value: Any, data_type: DataType) -> Any:
    """Coerce a Python value to the target OPC-UA type."""
    if data_type == DataType.BOOLEAN:
        return bool(value)
    if data_type == DataType.INT16:
        v = int(value)
        if not (-32768 <= v <= 32767):
            raise ValueError(f"INT16 range: {v}")
        return v
    if data_type == DataType.INT32:
        v = int(value)
        if not (-2147483648 <= v <= 2147483647):
            raise ValueError(f"INT32 range: {v}")
        return v
    if data_type == DataType.INT64:
        return int(value)
    if data_type == DataType.FLOAT:
        return float(value)
    if data_type == DataType.DOUBLE:
        return float(value)
    if data_type == DataType.STRING:
        return str(value)
    return value
