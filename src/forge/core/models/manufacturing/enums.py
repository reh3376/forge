"""Shared enumerations for manufacturing domain models.

These enums define Forge-canonical values for status, type, and
classification fields. Adapters map source-system-specific values
(e.g., WMS EnumBarrelDisposition, MES BatchStatus) to these canonical
enums during ingestion.
"""

from enum import StrEnum

# ── Manufacturing Unit ──────────────────────────────────────────────


class UnitStatus(StrEnum):
    """Lifecycle status of a manufacturing unit (barrel, batch, tank)."""

    PENDING = "PENDING"  # Created but not yet active
    ACTIVE = "ACTIVE"  # In production or storage
    COMPLETE = "COMPLETE"  # Finished its lifecycle
    HELD = "HELD"  # On quality or regulatory hold
    SCRAPPED = "SCRAPPED"  # Disposed or dumped
    TRANSFERRED = "TRANSFERRED"  # Moved to external system


class LifecycleState(StrEnum):
    """Granular lifecycle phase within a manufacturing unit's journey.

    Derived from ISA-88 batch states and WMS barrel disposition.
    """

    CREATED = "CREATED"
    FILLING = "FILLING"
    IN_PROCESS = "IN_PROCESS"
    AGING = "AGING"  # Whiskey-specific but generalizable to curing/resting
    IN_STORAGE = "IN_STORAGE"
    IN_TRANSIT = "IN_TRANSIT"
    SAMPLING = "SAMPLING"
    WITHDRAWN = "WITHDRAWN"
    DUMPED = "DUMPED"
    COMPLETE = "COMPLETE"


# ── Physical Asset ──────────────────────────────────────────────────


class AssetType(StrEnum):
    """Type of physical asset in the manufacturing hierarchy.

    Follows ISA-95 equipment hierarchy levels where applicable.
    """

    ENTERPRISE = "ENTERPRISE"
    SITE = "SITE"
    AREA = "AREA"
    WORK_CENTER = "WORK_CENTER"  # ISA-95 "Work Center"
    WORK_UNIT = "WORK_UNIT"  # ISA-95 "Work Unit"
    STORAGE_ZONE = "STORAGE_ZONE"  # Warehouse floor/section
    STORAGE_POSITION = "STORAGE_POSITION"  # Individual rack/position
    EQUIPMENT = "EQUIPMENT"  # Fermenter, still, tank, etc.
    STAGING_AREA = "STAGING_AREA"  # Holding/receiving area


class AssetOperationalState(StrEnum):
    """Current operational state of an asset."""

    IDLE = "IDLE"
    RUNNING = "RUNNING"
    MAINTENANCE = "MAINTENANCE"
    CHANGEOVER = "CHANGEOVER"
    OFFLINE = "OFFLINE"
    FAULTED = "FAULTED"


# ── Operational Event ───────────────────────────────────────────────


class EventSeverity(StrEnum):
    """Severity level for operational events."""

    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class EventCategory(StrEnum):
    """High-level category for operational events."""

    PRODUCTION = "PRODUCTION"
    QUALITY = "QUALITY"
    LOGISTICS = "LOGISTICS"
    MAINTENANCE = "MAINTENANCE"
    SAFETY = "SAFETY"
    COMPLIANCE = "COMPLIANCE"


# ── Business Entity ─────────────────────────────────────────────────


class EntityType(StrEnum):
    """Type of business entity."""

    CUSTOMER = "CUSTOMER"
    VENDOR = "VENDOR"
    PARTNER = "PARTNER"
    INTERNAL = "INTERNAL"


# ── Work Order ──────────────────────────────────────────────────────


class WorkOrderStatus(StrEnum):
    """Status of a work order."""

    DRAFT = "DRAFT"
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    PAUSED = "PAUSED"
    COMPLETE = "COMPLETE"
    CANCELLED = "CANCELLED"


class WorkOrderPriority(StrEnum):
    """Priority level for work orders."""

    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


# ── Production Order ────────────────────────────────────────────────


class OrderStatus(StrEnum):
    """Status of a production order."""

    DRAFT = "DRAFT"
    PLANNED = "PLANNED"
    RELEASED = "RELEASED"
    IN_PROGRESS = "IN_PROGRESS"
    PAUSED = "PAUSED"
    COMPLETE = "COMPLETE"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


# ── Quality ─────────────────────────────────────────────────────────


class SampleOutcome(StrEnum):
    """Result of a quality sample evaluation."""

    PASS = "PASS"
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"
    PENDING = "PENDING"
