"""forge.modules.ot.control — Safe PLC Control Write Interface.

Provides a multi-layer defense system for writing values to PLCs:

Layer 1: Type & Range Validation
    Reject writes that are physically impossible (wrong data type,
    value outside engineering range, null values).

Layer 2: Safety Interlocks
    Configurable rules: "cannot write tag X while tag Y is in state Z."
    Interlocks can be bypassed only by ADMIN role with explicit reason.

Layer 3: Role-Based Authorization
    OPERATOR / ENGINEER / ADMIN roles with per-tag and per-area
    write permissions.  Default-deny — no implicit write access.

Layer 4: OPC-UA Read-Back Confirmation
    After every write, read the value back to confirm the PLC
    accepted the change.  If read-back doesn't match, the write
    is flagged as UNCONFIRMED.

Architecture::

    ┌───────────────┐
    │  WriteRequest  │──▶ Type/Range Check ──▶ Interlock Check
    └───────────────┘          │                     │
                               ▼                     ▼
                          ❌ REJECT            ❌ REJECT
                               │                     │
                               ▼                     ▼
                         Role Auth Check ──▶ OPC-UA Write ──▶ Read-Back
                               │                     │            │
                               ▼                     ▼            ▼
                          ❌ REJECT            ❌ FAIL      ✅/⚠️ CONFIRM
"""

from forge.modules.ot.control.models import (
    WriteRequest,
    WriteResult,
    WriteStatus,
    WriteRole,
    InterlockRule,
    InterlockCondition,
    WritePermission,
    TagWriteConfig,
)
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.write_engine import ControlWriteEngine
from forge.modules.ot.control.audit import (
    WriteAuditLogger,
    WriteAuditQuery,
    ContextualRecordAuditSink,
    MqttAuditSink,
    LogAuditSink,
)
from forge.modules.ot.control.recipe_integration import (
    RecipeParameterMapping,
    RecipeWriteAdapter,
    RecipeWriteConfig,
    RecipeWriteResult,
)

__all__ = [
    "ContextualRecordAuditSink",
    "ControlWriteEngine",
    "InterlockCondition",
    "InterlockEngine",
    "InterlockRule",
    "LogAuditSink",
    "MqttAuditSink",
    "RecipeParameterMapping",
    "RecipeWriteAdapter",
    "RecipeWriteConfig",
    "RecipeWriteResult",
    "TagWriteConfig",
    "WriteAuditLogger",
    "WriteAuditQuery",
    "WriteAuthorizer",
    "WritePermission",
    "WriteRequest",
    "WriteResult",
    "WriteRole",
    "WriteStatus",
    "WriteValidator",
]
