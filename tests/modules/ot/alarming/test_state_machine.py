"""Tests for the ISA-18.2 alarm state machine.

Covers:
- All core lifecycle transitions (NORMAL→ACTIVE_UNACK→ACTIVE_ACK→NORMAL)
- The CLEAR_UNACK path (alarm cleared before operator acknowledges)
- Administrative states (SUPPRESS, SHELVE, DISABLE) with return-state logic
- Process events while in administrative states (CLEAR/TRIGGER update saved state)
- RESET override from any non-NORMAL state
- Invalid transition rejection
- get_valid_actions() completeness
"""

import pytest

from forge.modules.ot.alarming.models import (
    AlarmAction,
    AlarmInstance,
    AlarmPriority,
    AlarmState,
    AlarmType,
)
from forge.modules.ot.alarming.state_machine import (
    AlarmStateMachine,
    InvalidTransition,
    TransitionResult,
)


@pytest.fixture
def sm() -> AlarmStateMachine:
    return AlarmStateMachine()


def _make_alarm(state: AlarmState = AlarmState.NORMAL) -> AlarmInstance:
    return AlarmInstance(
        alarm_id="test-001",
        name="TEST_ALARM",
        alarm_type=AlarmType.HI,
        state=state,
        priority=AlarmPriority.HIGH,
        tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
    )


# ---------------------------------------------------------------------------
# Core lifecycle
# ---------------------------------------------------------------------------


class TestCoreLifecycle:
    """Test the primary ISA-18.2 alarm lifecycle."""

    def test_trigger_from_normal(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        result = sm.transition(alarm, AlarmAction.TRIGGER)
        assert result.new_state == AlarmState.ACTIVE_UNACK
        assert result.previous_state == AlarmState.NORMAL
        assert alarm.state == AlarmState.ACTIVE_UNACK

    def test_acknowledge_from_active_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        result = sm.transition(alarm, AlarmAction.ACKNOWLEDGE)
        assert result.new_state == AlarmState.ACTIVE_ACK
        assert alarm.state == AlarmState.ACTIVE_ACK

    def test_clear_from_active_ack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_ACK)
        result = sm.transition(alarm, AlarmAction.CLEAR)
        assert result.new_state == AlarmState.NORMAL
        assert alarm.state == AlarmState.NORMAL

    def test_full_lifecycle_ack_then_clear(self, sm: AlarmStateMachine):
        """NORMAL → ACTIVE_UNACK → ACTIVE_ACK → NORMAL."""
        alarm = _make_alarm()
        sm.transition(alarm, AlarmAction.TRIGGER)
        assert alarm.state == AlarmState.ACTIVE_UNACK
        sm.transition(alarm, AlarmAction.ACKNOWLEDGE)
        assert alarm.state == AlarmState.ACTIVE_ACK
        sm.transition(alarm, AlarmAction.CLEAR)
        assert alarm.state == AlarmState.NORMAL


class TestClearUnackPath:
    """Test the CLEAR_UNACK path (alarm clears before operator acks)."""

    def test_clear_before_ack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        result = sm.transition(alarm, AlarmAction.CLEAR)
        assert result.new_state == AlarmState.CLEAR_UNACK
        assert alarm.state == AlarmState.CLEAR_UNACK

    def test_late_ack_from_clear_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.CLEAR_UNACK)
        result = sm.transition(alarm, AlarmAction.ACKNOWLEDGE)
        assert result.new_state == AlarmState.NORMAL

    def test_retrigger_from_clear_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.CLEAR_UNACK)
        result = sm.transition(alarm, AlarmAction.TRIGGER)
        assert result.new_state == AlarmState.ACTIVE_UNACK

    def test_full_lifecycle_clear_then_ack(self, sm: AlarmStateMachine):
        """NORMAL → ACTIVE_UNACK → CLEAR_UNACK → NORMAL."""
        alarm = _make_alarm()
        sm.transition(alarm, AlarmAction.TRIGGER)
        sm.transition(alarm, AlarmAction.CLEAR)
        assert alarm.state == AlarmState.CLEAR_UNACK
        sm.transition(alarm, AlarmAction.ACKNOWLEDGE)
        assert alarm.state == AlarmState.NORMAL


# ---------------------------------------------------------------------------
# Administrative states
# ---------------------------------------------------------------------------


class TestSuppression:
    def test_suppress_from_active_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        result = sm.transition(alarm, AlarmAction.SUPPRESS)
        assert alarm.state == AlarmState.SUPPRESSED
        assert alarm._state_before_admin == AlarmState.ACTIVE_UNACK

    def test_unsuppress_returns_to_saved(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.SUPPRESS)
        sm.transition(alarm, AlarmAction.UNSUPPRESS)
        assert alarm.state == AlarmState.ACTIVE_UNACK

    def test_suppress_from_active_ack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_ACK)
        sm.transition(alarm, AlarmAction.SUPPRESS)
        assert alarm.state == AlarmState.SUPPRESSED
        sm.transition(alarm, AlarmAction.UNSUPPRESS)
        assert alarm.state == AlarmState.ACTIVE_ACK

    def test_cannot_suppress_from_normal(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.SUPPRESS)


class TestShelving:
    def test_shelve_from_active_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.SHELVE)
        assert alarm.state == AlarmState.SHELVED

    def test_unshelve_returns_to_saved(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_ACK)
        sm.transition(alarm, AlarmAction.SHELVE)
        sm.transition(alarm, AlarmAction.UNSHELVE)
        assert alarm.state == AlarmState.ACTIVE_ACK

    def test_clear_while_shelved_updates_return(self, sm: AlarmStateMachine):
        """Process clears while shelved → unshelve returns to NORMAL."""
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.SHELVE)
        assert alarm.state == AlarmState.SHELVED
        # Process clears while shelved
        sm.transition(alarm, AlarmAction.CLEAR)
        assert alarm.state == AlarmState.SHELVED  # Still shelved
        assert alarm._state_before_admin == AlarmState.NORMAL  # But return updated
        # Unshelve → NORMAL (not back to ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.UNSHELVE)
        assert alarm.state == AlarmState.NORMAL

    def test_trigger_while_shelved_updates_return(self, sm: AlarmStateMachine):
        """Process re-triggers while shelved → unshelve returns to ACTIVE_UNACK."""
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.SHELVE)
        # Process clears and re-triggers while shelved
        sm.transition(alarm, AlarmAction.CLEAR)
        sm.transition(alarm, AlarmAction.TRIGGER)
        assert alarm.state == AlarmState.SHELVED
        assert alarm._state_before_admin == AlarmState.ACTIVE_UNACK
        sm.transition(alarm, AlarmAction.UNSHELVE)
        assert alarm.state == AlarmState.ACTIVE_UNACK


class TestOutOfService:
    def test_disable_from_active(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.DISABLE)
        assert alarm.state == AlarmState.OUT_OF_SERVICE

    def test_enable_returns_to_saved(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.CLEAR_UNACK)
        sm.transition(alarm, AlarmAction.DISABLE)
        sm.transition(alarm, AlarmAction.ENABLE)
        assert alarm.state == AlarmState.CLEAR_UNACK

    def test_clear_while_oos_then_enable(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        sm.transition(alarm, AlarmAction.DISABLE)
        sm.transition(alarm, AlarmAction.CLEAR)
        sm.transition(alarm, AlarmAction.ENABLE)
        assert alarm.state == AlarmState.NORMAL


# ---------------------------------------------------------------------------
# RESET
# ---------------------------------------------------------------------------


class TestReset:
    def test_reset_from_active_unack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        result = sm.transition(alarm, AlarmAction.RESET)
        assert alarm.state == AlarmState.NORMAL

    def test_reset_from_shelved(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.SHELVED)
        sm.transition(alarm, AlarmAction.RESET)
        assert alarm.state == AlarmState.NORMAL

    def test_reset_from_oos(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.OUT_OF_SERVICE)
        sm.transition(alarm, AlarmAction.RESET)
        assert alarm.state == AlarmState.NORMAL

    def test_reset_from_normal_is_invalid(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.RESET)


# ---------------------------------------------------------------------------
# Invalid transitions
# ---------------------------------------------------------------------------


class TestInvalidTransitions:
    def test_ack_from_normal(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.ACKNOWLEDGE)

    def test_clear_from_normal(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.CLEAR)

    def test_ack_from_active_ack(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.ACTIVE_ACK)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.ACKNOWLEDGE)

    def test_trigger_from_active_unack(self, sm: AlarmStateMachine):
        """Can't trigger when already active (not from transition table)."""
        alarm = _make_alarm(AlarmState.ACTIVE_UNACK)
        with pytest.raises(InvalidTransition):
            sm.transition(alarm, AlarmAction.TRIGGER)


# ---------------------------------------------------------------------------
# can_transition / get_valid_actions
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_can_transition_true(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        assert sm.can_transition(alarm, AlarmAction.TRIGGER) is True

    def test_can_transition_false(self, sm: AlarmStateMachine):
        alarm = _make_alarm(AlarmState.NORMAL)
        assert sm.can_transition(alarm, AlarmAction.ACKNOWLEDGE) is False

    def test_valid_actions_from_normal(self, sm: AlarmStateMachine):
        actions = sm.get_valid_actions(AlarmState.NORMAL)
        assert AlarmAction.TRIGGER in actions
        assert AlarmAction.ACKNOWLEDGE not in actions

    def test_valid_actions_from_active_unack(self, sm: AlarmStateMachine):
        actions = sm.get_valid_actions(AlarmState.ACTIVE_UNACK)
        assert AlarmAction.ACKNOWLEDGE in actions
        assert AlarmAction.CLEAR in actions
        assert AlarmAction.SUPPRESS in actions
        assert AlarmAction.SHELVE in actions
        assert AlarmAction.DISABLE in actions
        assert AlarmAction.RESET in actions

    def test_valid_actions_from_suppressed(self, sm: AlarmStateMachine):
        actions = sm.get_valid_actions(AlarmState.SUPPRESSED)
        assert AlarmAction.UNSUPPRESS in actions
        assert AlarmAction.RESET in actions


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class TestEnums:
    def test_alarm_priority_rank_order(self):
        assert AlarmPriority.CRITICAL.rank < AlarmPriority.HIGH.rank
        assert AlarmPriority.HIGH.rank < AlarmPriority.MEDIUM.rank
        assert AlarmPriority.MEDIUM.rank < AlarmPriority.LOW.rank
        assert AlarmPriority.LOW.rank < AlarmPriority.DIAGNOSTIC.rank

    def test_alarm_state_values(self):
        assert AlarmState.NORMAL.value == "NORMAL"
        assert AlarmState.ACTIVE_UNACK.value == "ACTIVE_UNACK"

    def test_alarm_action_values(self):
        assert AlarmAction.TRIGGER.value == "TRIGGER"
        assert AlarmAction.ACKNOWLEDGE.value == "ACKNOWLEDGE"
