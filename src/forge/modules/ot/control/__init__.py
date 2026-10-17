"""forge.modules.ot.control — Safe PLC Control Write Interface.

Provides a multi-layer defense system for writing values to PLCs:

Layer 1: Type & Range Validation
    Reject writes that are physically impossible (wrong data type,
    value outside engineering range, null values).

Layer 2: Write Review (FB-074)
    Per-tag policy for operator writes: ``two_step_with_review`` tags
    must be staged (current value read, single-use review token issued)
    and committed with that token; ``reason_code_required`` tags must
    carry a reason code from the site vocabulary.  System writes
    (recipe download, CIP) were confirmed upstream and pass through.

Layer 3: Safety Interlocks
    Configurable rules: "cannot write tag X while tag Y is in state Z."
    Interlocks can be bypassed only by ADMIN role with explicit reason.

Layer 4: Role-Based Authorization
    OPERATOR / ENGINEER / ADMIN roles with per-tag and per-area
    write permissions.  Default-deny — no implicit write access.

Layer 5: OPC-UA Read-Back Confirmation
    After every write, read the value back to confirm the PLC
    accepted the change.  If read-back doesn't match, the write
    is flagged as UNCONFIRMED.

Architecture::

    ┌───────────────┐
    │  WriteRequest  │──▶ Type/Range Check ──▶ Review Gate ──▶ Interlock Check
    └───────────────┘          │                   │                 │
                               ▼                   ▼                 ▼
                          ❌ REJECT           ❌ REJECT         ❌ REJECT
                                                                     │
                                                                     ▼
                         Role Auth Check ──▶ OPC-UA Write ──▶ Read-Back
                               │                     │            │
                               ▼                     ▼            ▼
                          ❌ REJECT            ❌ FAIL      ✅/⚠️ CONFIRM
"""

from forge.modules.ot.control.audit import (
    ContextualRecordAuditSink,
    LogAuditSink,
    MqttAuditSink,
    WriteAuditLogger,
    WriteAuditQuery,
)
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.changeover_orchestrator import (
    AreaChangeoverConfig,
    ChangeoverOrchestrator,
    ChangeoverSequenceError,
    CipPolicy,
    CipResult,
    CipRunner,
    OrchestrationEvent,
    RecipeSnapshot,
    parse_recipe_payload,
)
from forge.modules.ot.control.cip_runner import CipRunStatus, PlcCipRunner, PlcCipSpec
from forge.modules.ot.control.config import (
    ChangeoverAreaSpec,
    ConfigError,
    MqttIngressSettings,
    OTControlConfig,
    PlcConnectionSpec,
    load_control_config,
    parse_control_config,
)
from forge.modules.ot.control.connections import PlcConnectionManager
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.mes_changeover import (
    CHANGEOVER_AREAS,
    CHANGEOVER_COMMANDS,
    MesChangeoverClient,
    changeover_tag,
    transition_from,
)
from forge.modules.ot.control.models import (
    ConfirmationMode,
    DataType,
    InterlockCondition,
    InterlockRule,
    TagWriteConfig,
    WriteOrigin,
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.recipe_integration import (
    RecipeParameterMapping,
    RecipeWriteAdapter,
    RecipeWriteConfig,
    RecipeWriteResult,
)
from forge.modules.ot.control.review import ReviewTicket, WriteReviewer
from forge.modules.ot.control.runtime import ControlDependencies, ControlRuntime, RegistryTagIO
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.write_engine import ControlWriteEngine, StageOutcome

__all__ = [
    "CHANGEOVER_AREAS",
    "CHANGEOVER_COMMANDS",
    "AreaChangeoverConfig",
    "ChangeoverAreaSpec",
    "ChangeoverOrchestrator",
    "ChangeoverSequenceError",
    "CipPolicy",
    "CipResult",
    "CipRunStatus",
    "CipRunner",
    "ConfigError",
    "ConfirmationMode",
    "ContextualRecordAuditSink",
    "ControlDependencies",
    "ControlRuntime",
    "ControlWriteEngine",
    "DataType",
    "InterlockCondition",
    "InterlockEngine",
    "InterlockRule",
    "LogAuditSink",
    "MesChangeoverClient",
    "MqttAuditSink",
    "MqttIngressSettings",
    "OTControlConfig",
    "OrchestrationEvent",
    "PlcCipRunner",
    "PlcCipSpec",
    "PlcConnectionManager",
    "PlcConnectionSpec",
    "RecipeParameterMapping",
    "RecipeSnapshot",
    "RecipeWriteAdapter",
    "RecipeWriteConfig",
    "RecipeWriteResult",
    "RegistryTagIO",
    "ReviewTicket",
    "StageOutcome",
    "TagWriteConfig",
    "WriteAuditLogger",
    "WriteAuditQuery",
    "WriteAuthorizer",
    "WriteOrigin",
    "WritePermission",
    "WriteRequest",
    "WriteResult",
    "WriteReviewer",
    "WriteRole",
    "WriteStatus",
    "WriteValidator",
    "changeover_tag",
    "load_control_config",
    "parse_control_config",
    "parse_recipe_payload",
    "transition_from",
]
