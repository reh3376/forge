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
    DataType,
    InterlockCondition,
    InterlockRule,
    TagWriteConfig,
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
from forge.modules.ot.control.runtime import ControlDependencies, ControlRuntime, RegistryTagIO
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.write_engine import ControlWriteEngine

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
    "changeover_tag",
    "load_control_config",
    "parse_control_config",
    "parse_recipe_payload",
    "transition_from",
]
