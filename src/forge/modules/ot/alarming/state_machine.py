"""ISA-18.2 table-driven alarm state machine.

The transition table encodes the full ISA-18.2 state diagram.  Each entry is
``(current_state, action) → new_state``.  Invalid transitions raise
``InvalidTransition`` — they are never silently ignored.

Administrative states (SUPPRESSED, SHELVED, OUT_OF_SERVICE) store the
"return state" so that un-suppress / un-shelve / enable returns to the
correct lifecycle state.

Key ISA-18.2 rules encoded here:
- TRIGGER from NORMAL → ACTIVE_UNACK
- CLEAR from ACTIVE_UNACK → CLEAR_UNACK  (alarm cleared before ack)
- CLEAR from ACTIVE_ACK → NORMAL  (alarm cleared after ack)
- ACKNOWLEDGE from ACTIVE_UNACK → ACTIVE_ACK
- ACKNOWLEDGE from CLEAR_UNACK → NORMAL  (late ack after clear)
- SUPPRESS/SHELVE/DISABLE from any active state → administrative state (saves return)
- UNSUPPRESS/UNSHELVE/ENABLE → returns to saved state (or NORMAL if cleared while admin)
- RESET from any state → NORMAL (administrative override)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from forge.modules.ot.alarming.models import (
    AlarmAction,
    AlarmInstance,
    AlarmState,
)

logger = logging.getLogger("forge.alarm.state_machine")


# ---------------------------------------------------------------------------
# Transition table
# ---------------------------------------------------------------------------

# Core lifecycle transitions
_TRANSITIONS: dict[tuple[AlarmState, AlarmAction], AlarmState] = {
    # --- Core lifecycle ---
    (AlarmState.NORMAL, AlarmAction.TRIGGER): AlarmState.ACTIVE_UNACK,
    (AlarmState.ACTIVE_UNACK, AlarmAction.ACKNOWLEDGE): AlarmState.ACTIVE_ACK,
    (AlarmState.ACTIVE_UNACK, AlarmAction.CLEAR): AlarmState.CLEAR_UNACK,
    (AlarmState.ACTIVE_ACK, AlarmAction.CLEAR): AlarmState.NORMAL,
    (AlarmState.CLEAR_UNACK, AlarmAction.ACKNOWLEDGE): AlarmState.NORMAL,
    # Re-trigger from CLEAR_UNACK (condition returns while waiting for ack)
    (AlarmState.CLEAR_UNACK, AlarmAction.TRIGGER): AlarmState.ACTIVE_UNACK,
}

# Administrative states can be entered from any active state
_ADMIN_ENTRY_STATES = {
    AlarmState.ACTIVE_UNACK,
    AlarmState.ACTIVE_ACK,
    AlarmState.CLEAR_UNACK,
}

# Administrative actions map to their target admin state
_ADMIN_ACTIONS: dict[AlarmAction, AlarmState] = {
    AlarmAction.SUPPRESS: AlarmState.SUPPRESSED,
    AlarmAction.SHELVE: AlarmState.SHELVED,
    AlarmAction.DISABLE: AlarmState.OUT_OF_SERVICE,
}

# Return actions map from admin state
_ADMIN_RETURN: dict[tuple[AlarmState, AlarmAction], bool] = {
    (AlarmState.SUPPRESSED, AlarmAction.UNSUPPRESS): True,
    (AlarmState.SHELVED, AlarmAction.UNSHELVE): True,
    (AlarmState.OUT_OF_SERVICE, AlarmAction.ENABLE): True,
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class InvalidTransition(Exception):
    """Raised when a state+action combination is not valid."""

    def __init__(self, state: AlarmState, action: AlarmAction, alarm_id: str = ""):
        self.state = state
        self.action = action
        self.alarm_id = alarm_id
        super().__init__(
            f"Invalid transition: {state.value} + {action.value}"
            + (f" (alarm={alarm_id})" if alarm_id else "")
        )


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TransitionResult:
    """Outcome of a state transition attempt."""

    previous_state: AlarmState
    new_state: AlarmState
    action: AlarmAction
    valid: bool = True


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


class AlarmStateMachine:
    """ISA-18.2 alarm state machine (stateless — operates on AlarmInstance).

    This class contains no mutable state itself.  It reads and writes
    the ``state`` and ``_state_before_admin`` fields on the AlarmInstance
    passed to ``transition()``.
    """

    def can_transition(self, alarm: AlarmInstance, action: AlarmAction) -> bool:
        """Check whether a transition is valid without applying it."""
        try:
            self._resolve(alarm, action)
            return True
        except InvalidTransition:
            return False

    def transition(
        self, alarm: AlarmInstance, action: AlarmAction
    ) -> TransitionResult:
        """Apply a state transition to an alarm instance.

        Raises InvalidTransition if the action is not valid for the current state.
        Returns a TransitionResult describing what changed.
        """
        new_state = self._resolve(alarm, action)
        previous = alarm.state

        # Handle administrative state entry — save return state
        if action in _ADMIN_ACTIONS and new_state in (
            AlarmState.SUPPRESSED,
            AlarmState.SHELVED,
            AlarmState.OUT_OF_SERVICE,
        ):
            alarm._state_before_admin = previous

        # Handle administrative state exit — restore return state
        if (alarm.state, action) in _ADMIN_RETURN:
            saved = alarm._state_before_admin
            if saved is not None and saved != AlarmState.NORMAL:
                new_state = saved
            else:
                new_state = AlarmState.NORMAL
            alarm._state_before_admin = None

        alarm.state = new_state

        logger.debug(
            "Transition: %s → %s (action=%s, alarm=%s)",
            previous.value,
            new_state.value,
            action.value,
            alarm.alarm_id,
        )

        return TransitionResult(
            previous_state=previous,
            new_state=new_state,
            action=action,
        )

    def get_valid_actions(self, state: AlarmState) -> list[AlarmAction]:
        """Return all valid actions for a given state."""
        actions: list[AlarmAction] = []

        # Core transitions
        for (s, a), _ in _TRANSITIONS.items():
            if s == state:
                actions.append(a)

        # Administrative entry from active states
        if state in _ADMIN_ENTRY_STATES:
            actions.extend(_ADMIN_ACTIONS.keys())

        # Administrative exit
        for (s, a), _ in _ADMIN_RETURN.items():
            if s == state:
                actions.append(a)

        # RESET always valid (except from NORMAL)
        if state != AlarmState.NORMAL:
            actions.append(AlarmAction.RESET)

        return actions

    def _resolve(self, alarm: AlarmInstance, action: AlarmAction) -> AlarmState:
        """Resolve the target state for a transition.

        This is the core lookup logic — separated for use by both
        ``can_transition`` and ``transition``.
        """
        state = alarm.state

        # RESET always returns to NORMAL (administrative override)
        if action == AlarmAction.RESET:
            if state == AlarmState.NORMAL:
                raise InvalidTransition(state, action, alarm.alarm_id)
            return AlarmState.NORMAL

        # Check core transition table first
        key = (state, action)
        if key in _TRANSITIONS:
            return _TRANSITIONS[key]

        # Check administrative entry
        if action in _ADMIN_ACTIONS and state in _ADMIN_ENTRY_STATES:
            return _ADMIN_ACTIONS[action]

        # Check administrative return
        if key in _ADMIN_RETURN:
            # Actual return state resolved in transition() using _state_before_admin
            return AlarmState.NORMAL  # placeholder, overridden in transition()

        # Handle CLEAR/TRIGGER while in administrative state
        # Per ISA-18.2: process events update the return state, not the admin state
        if state in (AlarmState.SUPPRESSED, AlarmState.SHELVED, AlarmState.OUT_OF_SERVICE):
            if action == AlarmAction.CLEAR:
                # Process cleared while admin — update saved return state
                alarm._state_before_admin = AlarmState.NORMAL
                return state  # Stay in admin state
            if action == AlarmAction.TRIGGER:
                # Process re-triggered while admin — update saved return state
                alarm._state_before_admin = AlarmState.ACTIVE_UNACK
                return state  # Stay in admin state

        raise InvalidTransition(state, action, alarm.alarm_id)
