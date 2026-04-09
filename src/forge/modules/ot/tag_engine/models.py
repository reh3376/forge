"""Tag type definitions — 9-type Pydantic model hierarchy.

Every tag in the system is a frozen Pydantic model describing its
*definition* (config-time), plus mutable runtime state held in the
tag registry.  This separation keeps definitions serializable to JSON
(Git-native) while runtime values stay in memory.

Design decisions:
    D1: Discriminated union via tag_type Literal — Pydantic auto-selects
        the right subclass on deserialization.
    D2: BaseTag holds all universal properties.  Subclasses add only what
        is unique to that tag type.
    D3: DataType and QualityCode are imported from the OPC-UA client
        types module — one source of truth for the whole OT Module.
    D4: ScaleConfig and ClampConfig are separate embeddable models so
        tags can opt in without cluttering BaseTag.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator

from forge.modules.ot.opcua_client.types import DataType, QualityCode


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class TagType(str, enum.Enum):
    """All 9 tag types — 6 standard + 3 Forge-exclusive."""

    STANDARD = "standard"       # Live OPC-UA subscription
    MEMORY = "memory"           # In-memory read/write store
    EXPRESSION = "expression"   # Python expression referencing other tags
    QUERY = "query"             # SQL query on poll interval
    DERIVED = "derived"         # Weighted combination of N source tags
    REFERENCE = "reference"     # Alias to another tag
    COMPUTED = "computed"       # Multi-source custom function (★ Forge-exclusive)
    EVENT = "event"             # Value set by external event (★ Forge-exclusive)
    VIRTUAL = "virtual"         # Federated read from external system (★ Forge-exclusive)


class ScanClass(str, enum.Enum):
    """Execution rate groups for tag evaluation.

    Tags are assigned to scan classes.  The tag engine evaluates all tags
    in a scan class at the configured rate.  This mirrors Ignition's
    scan class concept but adds the CRITICAL tier (100ms) which Ignition
    doesn't support natively.
    """

    CRITICAL = "critical"   # 100ms — safety interlocks, active alarms
    HIGH = "high"           # 500ms — active process values
    STANDARD = "standard"   # 1000ms — normal monitoring (default)
    SLOW = "slow"           # 5000ms — ambient, utility, rarely-changing


# Default intervals per scan class (milliseconds)
SCAN_CLASS_INTERVALS_MS: dict[ScanClass, int] = {
    ScanClass.CRITICAL: 100,
    ScanClass.HIGH: 500,
    ScanClass.STANDARD: 1000,
    ScanClass.SLOW: 5000,
}


# ---------------------------------------------------------------------------
# Embeddable config models
# ---------------------------------------------------------------------------


class ScaleConfig(BaseModel):
    """Linear scaling from raw PLC value to engineering units.

    Applies: scaled = (raw - raw_min) / (raw_max - raw_min)
                      * (scaled_max - scaled_min) + scaled_min
    """

    raw_min: float = 0.0
    raw_max: float = 65535.0
    scaled_min: float = 0.0
    scaled_max: float = 100.0

    def apply(self, raw: float) -> float:
        """Scale a raw value to engineering units."""
        if self.raw_max == self.raw_min:
            return self.scaled_min
        ratio = (raw - self.raw_min) / (self.raw_max - self.raw_min)
        return ratio * (self.scaled_max - self.scaled_min) + self.scaled_min

    def inverse(self, scaled: float) -> float:
        """Convert engineering value back to raw."""
        if self.scaled_max == self.scaled_min:
            return self.raw_min
        ratio = (scaled - self.scaled_min) / (self.scaled_max - self.scaled_min)
        return ratio * (self.raw_max - self.raw_min) + self.raw_min


class ClampConfig(BaseModel):
    """Clamp output value to a valid range.

    Applied after scaling.  Values outside [low, high] are clamped and
    the quality code is optionally degraded to UNCERTAIN.
    """

    low: float | None = None
    high: float | None = None
    degrade_quality_on_clamp: bool = True

    def apply(self, value: float) -> tuple[float, bool]:
        """Clamp value, return (clamped_value, was_clamped)."""
        clamped = False
        if self.low is not None and value < self.low:
            value = self.low
            clamped = True
        if self.high is not None and value > self.high:
            value = self.high
            clamped = True
        return value, clamped


class AlarmConfig(BaseModel):
    """Per-tag alarm thresholds (ISA-18.2 style).

    These define *when* alarms trigger.  The alarm engine (Phase 3)
    consumes these configs and manages the ISA-18.2 state machine.
    """

    hihi: float | None = None
    hi: float | None = None
    lo: float | None = None
    lolo: float | None = None
    deadband: float = 0.0
    delay_ms: int = 0
    priority: str = "MEDIUM"  # CRITICAL, HIGH, MEDIUM, LOW, DIAGNOSTIC
    enabled: bool = True


class HistoryConfig(BaseModel):
    """Per-tag history recording configuration.

    Controls whether and how the tag's values are sent to the historian
    (NextTrend).  Deadband prevents recording of noise.
    """

    enabled: bool = True
    sample_mode: str = "on_change"  # "on_change", "periodic"
    deadband: float = 0.0           # absolute value change threshold
    max_interval_ms: int = 60000    # max time between samples even if no change
    min_interval_ms: int = 0        # minimum time between samples (throttle)


# ---------------------------------------------------------------------------
# Runtime tag value snapshot
# ---------------------------------------------------------------------------


class TagValue(BaseModel):
    """Current runtime value of a tag.

    This is the mutable state the TagRegistry holds for each tag.
    Definitions are immutable; values change on every scan cycle.
    """

    value: Any = None
    quality: QualityCode = QualityCode.NOT_AVAILABLE
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_timestamp: datetime | None = None
    previous_value: Any = None
    previous_quality: QualityCode | None = None
    change_count: int = 0

    @field_validator("timestamp", "source_timestamp", mode="before")
    @classmethod
    def _ensure_utc(cls, v: Any) -> Any:
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    def has_changed(self) -> bool:
        """True if value or quality differs from previous."""
        return self.value != self.previous_value or self.quality != self.previous_quality


# ---------------------------------------------------------------------------
# Base tag
# ---------------------------------------------------------------------------


class BaseTag(BaseModel):
    """Universal properties shared by all 9 tag types.

    Every tag definition has:
        path        — Forge-normalized slash-separated path
        data_type   — expected value type (from OPC-UA DataType enum)
        scan_class  — evaluation rate group
        description — human-readable purpose
        metadata    — arbitrary key-value pairs

    Plus optional configs for scaling, clamping, alarms, and history.
    """

    path: str = Field(
        description="Forge-normalized tag path (slash-separated, e.g., WH/WHK01/Distillery01/TIT_2010/Out_PV)"
    )
    data_type: DataType = Field(
        default=DataType.DOUBLE,
        description="Expected value data type"
    )
    scan_class: ScanClass = Field(
        default=ScanClass.STANDARD,
        description="Evaluation rate group"
    )
    description: str = ""
    engineering_units: str = ""
    area: str = ""
    equipment_id: str = ""
    enabled: bool = True

    # Optional configs (None = not configured)
    scale: ScaleConfig | None = None
    clamp: ClampConfig | None = None
    alarm: AlarmConfig | None = None
    history: HistoryConfig | None = None

    # Freeform metadata
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# 9 tag type definitions
# ---------------------------------------------------------------------------


class StandardTag(BaseTag):
    """Standard (OPC) — live value from OPC-UA subscription.

    The workhorse tag type.  Maps a Forge tag path to an OPC-UA node ID.
    The OpcUaProvider subscribes to the node and pushes value updates
    into the tag registry.

    This is equivalent to Ignition's OPC tag type.
    """

    tag_type: Literal[TagType.STANDARD] = TagType.STANDARD
    opcua_node_id: str = Field(
        description="OPC-UA node ID (e.g., ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV)"
    )
    connection_name: str = Field(
        default="",
        description="PLC connection name (resolved from namespace_map if empty)"
    )


class MemoryTag(BaseTag):
    """Memory — in-memory read/write key-value store.

    Written to explicitly via API, scripts, or MQTT.  Value persists
    in memory (optionally to database) across evaluation cycles but
    not across restarts unless persistence is enabled.

    Equivalent to Ignition's Memory tag.
    """

    tag_type: Literal[TagType.MEMORY] = TagType.MEMORY
    default_value: Any = None
    persist: bool = Field(
        default=False,
        description="If True, value survives restarts via DB persistence"
    )


class ExpressionTag(BaseTag):
    """Expression — evaluated Python expression referencing other tags.

    The expression string can reference other tags by path.  The tag
    engine resolves dependencies and re-evaluates whenever a source
    tag changes.

    Example: "{WH/WHK01/Distillery01/TIT_2010/Out_PV} * 1.8 + 32"
    converts Celsius to Fahrenheit.

    Equivalent to Ignition's Expression tag.
    """

    tag_type: Literal[TagType.EXPRESSION] = TagType.EXPRESSION
    expression: str = Field(
        description="Python expression with {tag_path} placeholders"
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="Resolved list of tag paths this expression reads (auto-populated from expression)"
    )


class QueryTag(BaseTag):
    """Query — SQL query result on poll interval.

    Executes a SQL query against a configured database connection and
    stores the result.  For single-value queries the tag value is the
    scalar result; for multi-row results the value is a list of dicts.

    This is the read half of Ignition's SQL Bridge transaction groups.
    The write half is handled by timer scripts.

    Equivalent to Ignition's Query tag.
    """

    tag_type: Literal[TagType.QUERY] = TagType.QUERY
    query: str = Field(description="SQL query string (parameterized)")
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="Query parameters (e.g., {tag_path} substitutions)"
    )
    connection_name: str = Field(
        default="default",
        description="Database connection pool name"
    )
    poll_interval_ms: int = Field(
        default=5000,
        ge=500,
        description="How often to execute the query"
    )
    scalar: bool = Field(
        default=True,
        description="If True, extract first column of first row as scalar value"
    )


class DerivedSource(BaseModel):
    """A single source tag in a Derived tag's weighted combination."""

    tag_path: str
    weight: float = 1.0


class DerivedTag(BaseTag):
    """Derived — weighted combination of N source tags.

    Computes a weighted sum, average, min, max, or custom aggregation
    of N source tag values.  Re-evaluates when any source changes.

    Equivalent to Ignition's Derived tag.
    """

    tag_type: Literal[TagType.DERIVED] = TagType.DERIVED
    sources: list[DerivedSource] = Field(
        min_length=1,
        description="Source tags and their weights"
    )
    aggregation: str = Field(
        default="weighted_sum",
        description="Aggregation function: weighted_sum, average, min, max, first, last"
    )


class ReferenceTag(BaseTag):
    """Reference — alias to another tag with optional transform.

    Points to another tag by path.  Reads return the source tag's
    value (optionally transformed).  Writes are forwarded to the
    source tag.

    Equivalent to Ignition's Reference tag.
    """

    tag_type: Literal[TagType.REFERENCE] = TagType.REFERENCE
    source_path: str = Field(
        description="Path of the tag to reference"
    )
    transform: str | None = Field(
        default=None,
        description="Optional Python expression applied to source value (e.g., 'value * 2.0')"
    )


class ComputedTag(BaseTag):
    """Computed★ — multi-source aggregation with custom function.

    Forge-exclusive.  Unlike Expression (single expression string) or
    Derived (weighted combination), Computed tags run a full Python
    function that receives all source values as keyword arguments.

    Example use case: calculate OEE from equipment state, production
    count, and quality tags across multiple PLCs.

    No Ignition equivalent.
    """

    tag_type: Literal[TagType.COMPUTED] = TagType.COMPUTED
    sources: dict[str, str] = Field(
        description="Map of parameter name → source tag path (e.g., {'temp': 'WH/WHK01/.../TIT_2010/Out_PV'})"
    )
    function: str = Field(
        description="Python function body receiving source values as keyword args. Must return a single value."
    )
    imports: list[str] = Field(
        default_factory=list,
        description="Allowed module imports for the function (e.g., ['math', 'statistics'])"
    )


class EventTag(BaseTag):
    """Event★ — value set by external event arrival.

    Forge-exclusive.  The tag's value is updated when a matching event
    arrives from MQTT, RabbitMQ, a webhook, or another Forge module.
    Between events the tag holds its last-received value.

    Example: MES publishes a "recipe/next" event on RabbitMQ — the
    EventTag captures the recipe ID for use by Expression/Computed tags.

    No Ignition equivalent.
    """

    tag_type: Literal[TagType.EVENT] = TagType.EVENT
    event_source: str = Field(
        description="Event source type: 'mqtt', 'rabbitmq', 'webhook', 'internal'"
    )
    topic_or_exchange: str = Field(
        description="MQTT topic pattern, RabbitMQ exchange, or webhook path to listen on"
    )
    value_path: str = Field(
        default="",
        description="JSONPath or dot-path to extract value from event payload (empty = entire payload)"
    )
    retain_last: bool = Field(
        default=True,
        description="If True, tag holds last event value; if False, reverts to None after TTL"
    )
    ttl_ms: int | None = Field(
        default=None,
        description="Time-to-live for event value in milliseconds (None = forever)"
    )


class VirtualTag(BaseTag):
    """Virtual★ — federated read from external systems.

    Forge-exclusive.  Reads values from external sources (NextTrend
    history API, external databases, REST APIs, other Forge modules)
    with a TTL cache.  Unlike QueryTag (SQL-only, poll-based), Virtual
    tags support any data source and use a cache-first strategy.

    Example: read the latest 24h average temperature from NextTrend's
    historian without duplicating the data in the tag engine.

    No Ignition equivalent.
    """

    tag_type: Literal[TagType.VIRTUAL] = TagType.VIRTUAL
    source_type: str = Field(
        description="Source type: 'nexttrend', 'rest', 'database', 'forge_module'"
    )
    source_config: dict[str, Any] = Field(
        description="Source-specific configuration (URL, query, module_id, etc.)"
    )
    cache_ttl_ms: int = Field(
        default=10000,
        ge=0,
        description="How long to cache the fetched value before refreshing"
    )
    fallback_value: Any = Field(
        default=None,
        description="Value to return if source is unreachable and cache is expired"
    )


# ---------------------------------------------------------------------------
# Discriminated union for deserialization
# ---------------------------------------------------------------------------

TagUnion = Annotated[
    Union[
        StandardTag,
        MemoryTag,
        ExpressionTag,
        QueryTag,
        DerivedTag,
        ReferenceTag,
        ComputedTag,
        EventTag,
        VirtualTag,
    ],
    Field(discriminator="tag_type"),
]
"""Discriminated union of all 9 tag types.

Use this for deserializing tag definitions from JSON:
    from pydantic import TypeAdapter
    adapter = TypeAdapter(TagUnion)
    tag = adapter.validate_python({"tag_type": "standard", "path": "...", "opcua_node_id": "..."})
"""
