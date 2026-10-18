"""Tag engine — 9-type tag system exceeding Ignition's 6-type model.

Tag types:
    Standard (OPC)  — live value from OPC-UA subscription
    Memory          — in-memory read/write store (persists optionally)
    Expression      — evaluated Python expression referencing other tags
    Query           — SQL query result on poll interval
    Derived         — weighted combination of N source tags
    Reference       — alias to another tag (with optional transform)
    Computed★       — multi-source aggregation with custom function (Forge-exclusive)
    Event★          — value set by external event arrival (Forge-exclusive)
    Virtual★        — federated read from external systems (Forge-exclusive)

The 3 Forge-exclusive types (★) have no Ignition equivalent. They exist
because Forge's architecture isn't bound to a single gateway — data can
arrive from MQTT, REST, RabbitMQ, external DBs, or other Forge modules.
"""

from forge.modules.ot.tag_engine.engine import TagEngine
from forge.modules.ot.tag_engine.models import (
    AlarmConfig,
    BaseTag,
    ClampConfig,
    ComputedTag,
    DerivedSource,
    DerivedTag,
    EventTag,
    ExpressionTag,
    HistoryConfig,
    MemoryTag,
    QueryTag,
    ReferenceTag,
    ScaleConfig,
    ScanClass,
    StandardTag,
    TagType,
    TagUnion,
    VirtualTag,
)
from forge.modules.ot.tag_engine.registry import TagRegistry
from forge.modules.ot.tag_engine.templates import (
    TagTemplate,
    TemplateParam,
    TemplateRegistry,
    TemplateTagDef,
)

__all__ = [
    "AlarmConfig",
    "BaseTag",
    "ClampConfig",
    "ComputedTag",
    "DerivedSource",
    "DerivedTag",
    "EventTag",
    "ExpressionTag",
    "HistoryConfig",
    "MemoryTag",
    "QueryTag",
    "ReferenceTag",
    "ScaleConfig",
    "ScanClass",
    "StandardTag",
    "TagEngine",
    "TagRegistry",
    "TagTemplate",
    "TagType",
    "TagUnion",
    "TemplateParam",
    "TemplateRegistry",
    "TemplateTagDef",
    "VirtualTag",
]
