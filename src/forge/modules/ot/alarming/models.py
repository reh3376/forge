"""ISA-18.2 alarm data models.

Defines the core enums, frozen dataclasses, and configuration types used
throughout the alarm engine.  All state names follow ISA-18.2 / IEC 62682.

Design choices:
- AlarmState uses SCREAMING_SNAKE to match industrial convention and PLC tag naming
- AlarmPriority has an integer ``rank`` for ordering (lower = more severe)
- AlarmConfig is per-tag; AlarmInstance is a live alarm occurrence
- AlarmEvent is an immutable journal entry (event-sourced)
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


class AlarmState(str, enum.Enum):
    """ISA-18.2 alarm states.

    Core lifecycle:  NORMAL → ACTIVE_UNACK → ACTIVE_ACK → CLEAR_UNACK → NORMAL

    Administrative:  SUPPRESSED, SHELVED, OUT_OF_SERVICE can be entered from
    any active state and return to the state they came from (or NORMAL).
    """

    NORMAL = "NORMAL"
    ACTIVE_UNACK = "ACTIVE_UNACK"
    ACTIVE_ACK = "ACTIVE_ACK"
    CLEAR_UNACK = "CLEAR_UNACK"
    SUPPRESSED = "SUPPRESSED"
    SHELVED = "SHELVED"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class AlarmAction(str, enum.Enum):
    """Actions that drive state transitions."""

    TRIGGER = "TRIGGER"  # Process condition becomes abnormal
    CLEAR = "CLEAR"  # Process condition returns to normal
    ACKNOWLEDGE = "ACKNOWLEDGE"  # Operator acknowledges
    SUPPRESS = "SUPPRESS"  # System suppresses (e.g. flood)
    UNSUPPRESS = "UNSUPPRESS"  # System removes suppression
    SHELVE = "SHELVE"  # Operator shelves for maintenance
    UNSHELVE = "UNSHELVE"  # Shelve duration expires or manual
    DISABLE = "DISABLE"  # Take out of service
    ENABLE = "ENABLE"  # Return to service
    RESET = "RESET"  # Force-reset to NORMAL (admin only)


class AlarmPriority(str, enum.Enum):
    """Alarm priority levels per ISA-18.2 §6.3.

    Rank is used for sorting (lower = more urgent).
    """

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    DIAGNOSTIC = "DIAGNOSTIC"

    @property
    def rank(self) -> int:
        return _PRIORITY_RANK[self]


_PRIORITY_RANK: dict[AlarmPriority, int] = {
    AlarmPriority.CRITICAL: 0,
    AlarmPriority.HIGH: 1,
    AlarmPriority.MEDIUM: 2,
    AlarmPriority.LOW: 3,
    AlarmPriority.DIAGNOSTIC: 4,
}


class AlarmType(str, enum.Enum):
    """Alarm detection types."""

    HI = "HI"
    HIHI = "HIHI"
    LO = "LO"
    LOLO = "LOLO"
    DIGITAL = "DIGITAL"
    RATE_OF_CHANGE = "RATE_OF_CHANGE"
    QUALITY = "QUALITY"
    COMMUNICATION = "COMMUNICATION"
    CUSTOM = "CUSTOM"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class ThresholdConfig:
    """Threshold settings for a single alarm type on a tag.

    Deadband prevents alarm chatter by requiring the value to return past
    (setpoint - deadband) before the alarm can re-trigger.

    Delay (seconds) requires the condition to persist before triggering,
    preventing transient spikes from generating nuisance alarms.
    """

    alarm_type: AlarmType
    setpoint: float
    deadband: float = 0.0
    delay_seconds: float = 0.0
    priority: AlarmPriority = AlarmPriority.MEDIUM
    description: str = ""


@dataclass
class AlarmConfig:
    """Complete alarm configuration for a single tag.

    A tag can have multiple thresholds (e.g. HI + HIHI + LO + LOLO).
    """

    tag_path: str
    area: str = ""
    equipment_id: str = ""
    thresholds: list[ThresholdConfig] = field(default_factory=list)
    enabled: bool = True

    def get_threshold(self, alarm_type: AlarmType) -> ThresholdConfig | None:
        """Find a specific threshold config by type."""
        for t in self.thresholds:
            if t.alarm_type == alarm_type:
                return t
        return None


# ---------------------------------------------------------------------------
# Runtime instances
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class AlarmInstance:
    """A live alarm occurrence tracked by the engine.

    Mutable — the engine updates ``state``, ``ack_operator``, etc.
    as transitions occur.
    """

    alarm_id: str = field(default_factory=_new_id)
    name: str = ""
    alarm_type: AlarmType = AlarmType.CUSTOM
    state: AlarmState = AlarmState.NORMAL
    priority: AlarmPriority = AlarmPriority.MEDIUM
    tag_path: str = ""
    value: Any = None
    setpoint: Any = None
    timestamp: datetime = field(default_factory=_now)
    area: str = ""
    equipment_id: str = ""
    description: str = ""

    # Administrative
    ack_operator: str = ""
    ack_time: datetime | None = None
    shelved_until: datetime | None = None
    shelve_reason: str = ""
    suppress_reason: str = ""

    # State before administrative action (for return)
    _state_before_admin: AlarmState | None = field(default=None, repr=False)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for SDK consumption."""
        return {
            "alarm_id": self.alarm_id,
            "name": self.name,
            "alarm_type": self.alarm_type.value,
            "state": self.state.value,
            "priority": self.priority.value,
            "tag_path": self.tag_path,
            "value": self.value,
            "setpoint": self.setpoint,
            "timestamp": self.timestamp.isoformat(),
            "area": self.area,
            "equipment_id": self.equipment_id,
            "description": self.description,
            "ack_operator": self.ack_operator,
            "ack_time": self.ack_time.isoformat() if self.ack_time else None,
            "shelved": self.state == AlarmState.SHELVED,
            "suppressed": self.state == AlarmState.SUPPRESSED,
        }


# ---------------------------------------------------------------------------
# Event journal
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AlarmEvent:
    """Immutable journal entry for alarm state changes.

    Event-sourced: the full alarm history is the ordered sequence of these
    events.  Never mutated or deleted.
    """

    event_id: str = field(default_factory=_new_id)
    alarm_id: str = ""
    name: str = ""
    alarm_type: str = ""
    previous_state: str = ""
    new_state: str = ""
    action: str = ""
    priority: str = ""
    tag_path: str = ""
    value: Any = None
    setpoint: Any = None
    timestamp: datetime = field(default_factory=_now)
    area: str = ""
    equipment_id: str = ""
    operator: str = ""
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "alarm_id": self.alarm_id,
            "name": self.name,
            "alarm_type": self.alarm_type,
            "previous_state": self.previous_state,
            "new_state": self.new_state,
            "action": self.action,
            "priority": self.priority,
            "tag_path": self.tag_path,
            "value": self.value,
            "setpoint": self.setpoint,
            "timestamp": self.timestamp.isoformat(),
            "area": self.area,
            "equipment_id": self.equipment_id,
            "operator": self.operator,
            "detail": self.detail,
        }
