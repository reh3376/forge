"""Alarm vocabulary of the contract: states, operations and priorities (ISA-18.2).

The view contract (FVTS) and every module that raises or shows alarms share these, so they
live in the shared foundation, not in one module (D-17, S-1).
"""

from __future__ import annotations

import enum


class AlarmState(enum.StrEnum):
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


class AlarmAction(enum.StrEnum):
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


class AlarmPriority(enum.StrEnum):
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


# Who raises an action. The process raises TRIGGER and CLEAR; the system suppresses and
# unsuppresses (for example in an alarm flood). No screen offers these to a person. Every
# other action is a decision a person makes, subject to their role. This is the one
# definition: the view contract (FVTS) and the alarm state machine both read it.
SYSTEM_ALARM_ACTIONS: frozenset[AlarmAction] = frozenset(
    {AlarmAction.TRIGGER, AlarmAction.CLEAR, AlarmAction.SUPPRESS, AlarmAction.UNSUPPRESS}
)
OPERATOR_ALARM_ACTIONS: frozenset[AlarmAction] = frozenset(AlarmAction) - SYSTEM_ALARM_ACTIONS
