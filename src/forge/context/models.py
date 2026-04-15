"""F21 Context Engine domain models.

Equipment hierarchy, batch/lot tracking, shift schedules,
and operating mode definitions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, time
from typing import Any

from forge._compat import StrEnum

# ---------------------------------------------------------------------------
# Equipment
# ---------------------------------------------------------------------------


class EquipmentStatus(StrEnum):
    """Lifecycle status of a piece of equipment."""

    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    DECOMMISSIONED = "decommissioned"


@dataclass
class Equipment:
    """A physical asset in the equipment hierarchy.

    Equipment is organized in a site → area → equipment tree.
    Each node carries attributes and an optional parent reference.
    """

    equipment_id: str
    name: str
    site: str
    area: str = ""
    parent_id: str | None = None
    equipment_type: str = ""  # e.g. "fermenter", "still", "warehouse"
    status: EquipmentStatus = EquipmentStatus.ACTIVE
    attributes: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Batch / Lot
# ---------------------------------------------------------------------------


class BatchStatus(StrEnum):
    """Status of a production batch."""

    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class Batch:
    """An active production run or batch/lot.

    Links material, equipment, recipe, and time window.
    """

    batch_id: str
    equipment_id: str
    recipe_id: str = ""
    lot_id: str = ""
    status: BatchStatus = BatchStatus.ACTIVE
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None
    material_ids: list[str] = field(default_factory=list)
    attributes: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Shift
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ShiftDefinition:
    """A named shift with start/end times.

    Times are in the facility's local timezone.
    """

    name: str
    start_time: time
    end_time: time
    timezone: str = "America/Kentucky/Louisville"


@dataclass
class ShiftSchedule:
    """A set of shift definitions for a site."""

    site: str
    shifts: list[ShiftDefinition] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Operating Mode
# ---------------------------------------------------------------------------


class OperatingMode(StrEnum):
    """Standard operating modes for equipment."""

    PRODUCTION = "PRODUCTION"
    IDLE = "IDLE"
    CIP = "CIP"  # Clean-In-Place
    STARTUP = "STARTUP"
    SHUTDOWN = "SHUTDOWN"
    MAINTENANCE = "MAINTENANCE"
    CHANGEOVER = "CHANGEOVER"
    UNKNOWN = "UNKNOWN"


@dataclass
class ModeState:
    """Current operating mode of a piece of equipment."""

    equipment_id: str
    mode: OperatingMode
    since: datetime = field(default_factory=lambda: datetime.now(UTC))
    source: str = ""  # how the mode was determined (e.g. "signal", "manual", "inferred")
