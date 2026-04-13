"""OPC-UA type system — strongly typed models for all protocol concepts.

Every value flowing through the OPC-UA client is typed via Pydantic.
This eliminates the class of bugs where raw dicts or untyped tuples
silently carry wrong data through the pipeline.

Design notes:
    - QualityCode maps OPC-UA's 100+ StatusCodes to 4 Forge quality levels
    - NodeId supports all 4 OPC-UA identifier types (numeric, string, GUID, opaque)
    - DataType covers CIP types exposed by Allen-Bradley ControlLogix PLCs
    - All timestamps are UTC datetime (never naive)
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class QualityCode(enum.StrEnum):
    """Forge quality codes mapped from OPC-UA StatusCode severity bits.

    OPC-UA StatusCode is a 32-bit value where bits 30-31 indicate severity:
        00 = Good (0xC0000000 mask)
        01 = Uncertain (0x40000000 mask)
        10 = Bad (0x00000000 mask — yes, bad is 0 in the high bits)

    We collapse the hundreds of sub-codes into 4 Forge-level qualities.
    The original StatusCode is preserved in DataValue.status_code for
    consumers that need protocol-level detail.
    """

    GOOD = "GOOD"
    UNCERTAIN = "UNCERTAIN"
    BAD = "BAD"
    NOT_AVAILABLE = "NOT_AVAILABLE"  # No data (never received, or source offline)

    @classmethod
    def from_status_code(cls, status_code: int) -> QualityCode:
        """Map a raw OPC-UA StatusCode (uint32) to a Forge QualityCode."""
        if status_code is None:
            return cls.NOT_AVAILABLE
        # Severity is in bits 30-31
        severity = (status_code >> 30) & 0x03
        if severity == 0:  # Good (bits 30-31 = 00)
            return cls.GOOD
        if severity == 1:  # Uncertain (bits 30-31 = 01)
            return cls.UNCERTAIN
        return cls.BAD  # Bad (bits 30-31 = 10 or 11)


class DataType(enum.StrEnum):
    """Data types supported by OPC-UA, focused on CIP types from ControlLogix.

    Allen-Bradley ControlLogix PLCs expose these types via OPC-UA:
        BOOL, SINT (int8), INT (int16), DINT (int32), LINT (int64),
        REAL (float32), LREAL (float64), STRING.

    We also include structural types for completeness.
    """

    # Boolean
    BOOLEAN = "Boolean"

    # Integer types (CIP: SINT, INT, DINT, LINT)
    SBYTE = "SByte"  # int8 — CIP SINT
    INT16 = "Int16"  # int16 — CIP INT
    INT32 = "Int32"  # int32 — CIP DINT
    INT64 = "Int64"  # int64 — CIP LINT
    BYTE = "Byte"  # uint8 — CIP USINT
    UINT16 = "UInt16"  # uint16 — CIP UINT
    UINT32 = "UInt32"  # uint32 — CIP UDINT
    UINT64 = "UInt64"  # uint64 — CIP ULINT

    # Floating point (CIP: REAL, LREAL)
    FLOAT = "Float"  # float32 — CIP REAL
    DOUBLE = "Double"  # float64 — CIP LREAL

    # String
    STRING = "String"

    # Date/time
    DATETIME = "DateTime"

    # Structural
    BYTE_STRING = "ByteString"
    XML_ELEMENT = "XmlElement"
    NODE_ID = "NodeId"
    VARIANT = "Variant"

    # Extension (for UDT structures from PLCs)
    EXTENSION_OBJECT = "ExtensionObject"


class NodeClass(enum.StrEnum):
    """OPC-UA node classes — determines what kind of entity a node represents.

    The browse service returns NodeClass for every discovered node.
    Tag creation only makes sense for VARIABLE nodes (which hold values).
    OBJECT nodes are containers (folders, equipment instances).
    """

    OBJECT = "Object"
    VARIABLE = "Variable"
    METHOD = "Method"
    OBJECT_TYPE = "ObjectType"
    VARIABLE_TYPE = "VariableType"
    REFERENCE_TYPE = "ReferenceType"
    DATA_TYPE = "DataType"
    VIEW = "View"


class AccessLevel(int, enum.Flag):
    """OPC-UA access level flags — bitfield indicating read/write permissions.

    These come directly from the PLC's OPC-UA server and indicate what
    operations the server allows on a given node.  The OT Module uses
    these to enforce read-only vs. writable tag classification.
    """

    NONE = 0
    CURRENT_READ = 1
    CURRENT_WRITE = 2
    HISTORY_READ = 4
    HISTORY_WRITE = 8
    SEMANTIC_CHANGE = 16
    STATUS_WRITE = 32
    TIMESTAMP_WRITE = 64


class ConnectionState(enum.StrEnum):
    """OPC-UA client connection state machine.

    State transitions:
        DISCONNECTED → CONNECTING → CONNECTED → RECONNECTING → CONNECTED
                                  → FAILED (after max retries)
        Any state → DISCONNECTED (on explicit stop)
    """

    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RECONNECTING = "RECONNECTING"
    FAILED = "FAILED"


# ---------------------------------------------------------------------------
# Core value types
# ---------------------------------------------------------------------------


class NodeId(BaseModel):
    """OPC-UA Node Identifier — uniquely identifies a node in the address space.

    Allen-Bradley PLCs use string identifiers in namespace 2:
        NodeId(namespace=2, identifier="Program:MainProgram.MyTag")

    OPC-UA string format: "ns=2;s=Program:MainProgram.MyTag"
    """

    namespace: int = Field(default=0, ge=0, description="Namespace index")
    identifier: str | int = Field(description="Node identifier (string or numeric)")

    @classmethod
    def parse(cls, node_id_str: str) -> NodeId:
        """Parse an OPC-UA node ID string like 'ns=2;s=Fermentation/TIT_2010'.

        Supported formats:
            ns=N;s=StringId    (string identifier)
            ns=N;i=NumericId   (numeric identifier)
            s=StringId         (string, default namespace 0)
            i=NumericId        (numeric, default namespace 0)
        """
        namespace = 0
        identifier: str | int = ""

        parts = node_id_str.split(";")
        for part in parts:
            part = part.strip()
            if part.startswith("ns="):
                namespace = int(part[3:])
            elif part.startswith("s="):
                identifier = part[2:]
            elif part.startswith("i="):
                identifier = int(part[2:])
            elif part.startswith("g="):
                identifier = part[2:]  # GUID as string
            elif part.startswith("b="):
                identifier = part[2:]  # Opaque as base64 string

        return cls(namespace=namespace, identifier=identifier)

    def to_string(self) -> str:
        """Serialize to OPC-UA node ID string format."""
        id_prefix = "s" if isinstance(self.identifier, str) else "i"
        return f"ns={self.namespace};{id_prefix}={self.identifier}"

    def __str__(self) -> str:
        return self.to_string()

    def __hash__(self) -> int:
        return hash((self.namespace, self.identifier))


class DataValue(BaseModel):
    """OPC-UA DataValue — a tag value with quality, timestamp, and status.

    This is the fundamental unit returned by Read and Subscribe operations.
    Every tag value in the system flows through this model.
    """

    value: Any = Field(default=None, description="The actual value")
    data_type: DataType = Field(
        default=DataType.VARIANT, description="OPC-UA data type"
    )
    quality: QualityCode = Field(
        default=QualityCode.NOT_AVAILABLE,
        description="Forge quality code (mapped from StatusCode)",
    )
    status_code: int = Field(
        default=0,
        description="Raw OPC-UA StatusCode (uint32) for protocol-level detail",
    )
    source_timestamp: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Timestamp from the source (PLC clock)",
    )
    server_timestamp: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="Timestamp from the OPC-UA server",
    )

    @field_validator("source_timestamp", "server_timestamp", mode="before")
    @classmethod
    def _ensure_utc(cls, v: datetime) -> datetime:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v


class BrowseResult(BaseModel):
    """Result of browsing an OPC-UA node — represents a child in the address space.

    Used by the i3X browse API and tag discovery to enumerate PLC structure.
    """

    node_id: NodeId = Field(description="Node identifier")
    browse_name: str = Field(description="Browse name (display name)")
    display_name: str = Field(default="", description="Human-readable display name")
    node_class: NodeClass = Field(description="What kind of node this is")
    data_type: DataType | None = Field(
        default=None, description="Data type (only for Variable nodes)"
    )
    access_level: int = Field(
        default=AccessLevel.CURRENT_READ,
        description="Read/write permissions (AccessLevel flag combination)",
    )
    description: str = Field(default="", description="Node description (if available)")
    has_children: bool = Field(
        default=False, description="Whether this node has child nodes"
    )

    @property
    def is_readable(self) -> bool:
        return bool(self.access_level & AccessLevel.CURRENT_READ)

    @property
    def is_writable(self) -> bool:
        return bool(self.access_level & AccessLevel.CURRENT_WRITE)

    @property
    def is_variable(self) -> bool:
        """Only Variable nodes hold values (suitable for tag creation)."""
        return self.node_class == NodeClass.VARIABLE


# ---------------------------------------------------------------------------
# Subscription types
# ---------------------------------------------------------------------------


class MonitoredItem(BaseModel):
    """A single monitored item within an OPC-UA subscription.

    Each monitored item tracks one node ID and fires callbacks on change.
    """

    item_id: int = Field(description="Server-assigned monitored item ID")
    node_id: NodeId = Field(description="The node being monitored")
    sampling_interval_ms: float = Field(
        default=500.0, description="Requested sampling interval in milliseconds"
    )
    queue_size: int = Field(
        default=10, description="Server-side queue for buffering changes"
    )
    discard_oldest: bool = Field(
        default=True,
        description="Discard oldest queued value when buffer full",
    )


class Subscription(BaseModel):
    """An OPC-UA subscription — a group of monitored items.

    Subscriptions are the primary mechanism for receiving real-time
    tag value changes from PLCs.  Each PLC connection can have multiple
    subscriptions with different publishing intervals.
    """

    subscription_id: int = Field(description="Server-assigned subscription ID")
    publishing_interval_ms: float = Field(
        default=500.0, description="How often the server publishes notifications"
    )
    lifetime_count: int = Field(
        default=10000,
        description="Max publishing intervals without data before server drops",
    )
    max_keepalive_count: int = Field(
        default=10,
        description="Max publishing intervals before empty keepalive",
    )
    max_notifications_per_publish: int = Field(
        default=0, description="Max notifications per publish (0 = unlimited)"
    )
    monitored_items: list[MonitoredItem] = Field(default_factory=list)
    is_active: bool = Field(default=True)

    @property
    def node_count(self) -> int:
        return len(self.monitored_items)


# ---------------------------------------------------------------------------
# Connection configuration
# ---------------------------------------------------------------------------


class OpcUaEndpoint(BaseModel):
    """Configuration for connecting to an OPC-UA server (PLC).

    Designed for Allen-Bradley ControlLogix L82E/L83E with v36+ firmware
    which exposes a native OPC-UA server on port 4840.
    """

    url: str = Field(
        description="OPC-UA endpoint URL (e.g., opc.tcp://10.4.2.10:4840)"
    )
    name: str = Field(
        default="", description="Human-readable connection name (e.g., 'plc200')"
    )
    security_policy: str = Field(
        default="None",
        description="Security policy: None, Basic256Sha256, Aes128Sha256RsaOaep",
    )
    certificate_path: str | None = Field(
        default=None, description="Path to client X.509 certificate (PEM)"
    )
    private_key_path: str | None = Field(
        default=None, description="Path to client private key (PEM)"
    )
    server_certificate_path: str | None = Field(
        default=None,
        description="Path to trusted server certificate (PEM) for validation",
    )
    session_timeout_ms: int = Field(
        default=60_000, description="Session timeout in milliseconds"
    )
    request_timeout_ms: int = Field(
        default=10_000, description="Individual request timeout in milliseconds"
    )
    reconnect_interval_ms: int = Field(
        default=1000,
        description="Initial reconnect interval (doubles with backoff, max 60s)",
    )
    max_reconnect_attempts: int = Field(
        default=0,
        description="Max reconnection attempts (0 = unlimited)",
    )


class ConnectionHealth(BaseModel):
    """Health snapshot for a single OPC-UA connection."""

    endpoint_url: str
    connection_name: str = ""
    state: ConnectionState = ConnectionState.DISCONNECTED
    connected_since: datetime | None = None
    last_data_received: datetime | None = None
    reconnect_count: int = 0
    consecutive_failures: int = 0
    active_subscriptions: int = 0
    monitored_items_count: int = 0
    latency_ms: float | None = None  # Last measured round-trip time
