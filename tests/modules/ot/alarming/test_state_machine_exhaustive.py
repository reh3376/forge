"""The alarm state machine, checked over every configuration it can ever be in.

The promise (ISA-18.2, as ``state_machine.py`` states it): an alarm whose process
condition is abnormal is never shown as NORMAL, and an operator action or a question about
an alarm never loses it. A break is a standing alarm that silently disappears from the
operator's list.

The machine is finite. Its behaviour depends on two fields of an ``AlarmInstance`` only:
``state`` (7 values) and ``_state_before_admin`` (None or one of 7). That is 56
configurations and 10 actions. This file drives the real ``AlarmStateMachine`` through:

- **every configuration and every action** (560 cases), reachable or not, for the laws
  that speak of one step (:class:`TestEveryStep`), and
- **every configuration reachable from a new alarm**, with the process condition tracked
  beside it, for the laws that speak of where an alarm can end up
  (:class:`TestEveryReachableConfiguration`). The reachable set is closed: the search
  stops when no step leads anywhere new, so there is no depth bound.

Because every case is enumerated and none is sampled, a pass is a proof for this machine as
written, under one assumption that the file checks (:func:`test_only_two_fields_matter`):
that no other field of the alarm changes what a transition does.

Run it: ``uv run pytest tests/modules/ot/alarming/test_state_machine_exhaustive.py -q``
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from itertools import product

import pytest

from forge.modules.ot.alarming.models import AlarmAction, AlarmInstance, AlarmState
from forge.modules.ot.alarming.state_machine import (
    AlarmStateMachine,
    InvalidTransitionError,
    TransitionResult,
)
from forge_core.models.alarm import OPERATOR_ALARM_ACTIONS, SYSTEM_ALARM_ACTIONS

MACHINE = AlarmStateMachine()
STATES = tuple(AlarmState)
ACTIONS = tuple(AlarmAction)
SAVED = (None, *STATES)
ADMIN = frozenset({AlarmState.SUPPRESSED, AlarmState.SHELVED, AlarmState.OUT_OF_SERVICE})
ACTIVE = frozenset({AlarmState.ACTIVE_UNACK, AlarmState.ACTIVE_ACK})
LEAVE = {
    AlarmState.SUPPRESSED: AlarmAction.UNSUPPRESS,
    AlarmState.SHELVED: AlarmAction.UNSHELVE,
    AlarmState.OUT_OF_SERVICE: AlarmAction.ENABLE,
}

Config = tuple[AlarmState, AlarmState | None]


def alarm_in(config: Config) -> AlarmInstance:
    alarm = AlarmInstance(alarm_id="A1")
    alarm.state, alarm._state_before_admin = config
    return alarm


def config_of(alarm: AlarmInstance) -> Config:
    return (alarm.state, alarm._state_before_admin)


def step(config: Config, action: AlarmAction) -> Config | None:
    """The configuration after ``action``, or None when the machine refuses it."""
    alarm = alarm_in(config)
    try:
        MACHINE.transition(alarm, action)
    except InvalidTransitionError:
        return None
    return config_of(alarm)


def words(config: Config) -> str:
    state, saved = config
    return state.value if saved is None else f"{state.value} (to return to {saved.value})"


ALL_CONFIGS: tuple[Config, ...] = tuple(product(STATES, SAVED))
NEW_ALARM: Config = (AlarmState.NORMAL, None)


# ---------------------------------------------------------------------------
# One step, from every configuration
# ---------------------------------------------------------------------------


class TestEveryStep:
    def test_the_enumeration_is_complete(self) -> None:
        assert len(ALL_CONFIGS) == 56 and len(ACTIONS) == 10

    def test_a_refused_action_changes_nothing_and_raises_only_its_own_error(self) -> None:
        for config, action in product(ALL_CONFIGS, ACTIONS):
            alarm = alarm_in(config)
            try:
                MACHINE.transition(alarm, action)
            except InvalidTransitionError:
                assert config_of(alarm) == config, (
                    f"{action.value} was refused in {words(config)} and still changed the alarm "
                    f"to {words(config_of(alarm))}"
                )

    def test_asking_agrees_with_doing(self) -> None:
        """``can_transition`` says yes exactly when ``transition`` goes through."""
        for config, action in product(ALL_CONFIGS, ACTIONS):
            assert MACHINE.can_transition(alarm_in(config), action) == (
                step(config, action) is not None
            ), f"{action.value} in {words(config)}"

    def test_asking_changes_nothing(self) -> None:
        """A question about an alarm is not a step: ``can_transition`` leaves it as it was."""
        for config, action in product(ALL_CONFIGS, ACTIONS):
            alarm = alarm_in(config)
            MACHINE.can_transition(alarm, action)
            assert config_of(alarm) == config, (
                f"asking whether {action.value} is possible in {words(config)} changed the "
                f"alarm to {words(config_of(alarm))}"
            )

    def test_reset_always_ends_in_normal(self) -> None:
        for config in ALL_CONFIGS:
            after = step(config, AlarmAction.RESET)
            if config[0] is AlarmState.NORMAL:
                assert after is None
            else:
                assert after is not None and after[0] is AlarmState.NORMAL, words(config)

    def test_a_state_is_never_left_for_an_unknown_one(self) -> None:
        for config, action in product(ALL_CONFIGS, ACTIONS):
            after = step(config, action)
            assert after is None or (after[0] in STATES and after[1] in SAVED)

    def test_the_accepted_actions_are_what_the_machine_accepts(self) -> None:
        """In every configuration, listed exactly when ``transition`` goes through."""
        for state, saved in ALL_CONFIGS:
            listed = MACHINE.get_accepted_actions(state)
            assert len(listed) == len(set(listed)), f"{state.value}: an action is listed twice"
            accepted = {a for a in ACTIONS if step((state, saved), a) is not None}
            assert set(listed) == accepted, (
                f"in {words((state, saved))}: listed and refused "
                f"{sorted(a.value for a in set(listed) - accepted)}, accepted and not listed "
                f"{sorted(a.value for a in accepted - set(listed))}"
            )

    def test_the_operator_actions_are_the_accepted_ones_a_person_may_be_offered(self) -> None:
        """Never TRIGGER, CLEAR, SUPPRESS or UNSUPPRESS, in any state; nothing else left out."""
        assert set(ACTIONS) == SYSTEM_ALARM_ACTIONS | OPERATOR_ALARM_ACTIONS
        assert not SYSTEM_ALARM_ACTIONS & OPERATOR_ALARM_ACTIONS
        for state in STATES:
            offered = set(MACHINE.get_operator_actions(state))
            assert not offered & SYSTEM_ALARM_ACTIONS, state.value
            assert offered == set(MACHINE.get_accepted_actions(state)) - SYSTEM_ALARM_ACTIONS


# ---------------------------------------------------------------------------
# Everything reachable, with the process condition beside it
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Situation:
    """A configuration, whether the process condition is abnormal, and how it got here."""

    config: Config
    abnormal: bool
    path: tuple[str, ...] = ()

    @property
    def key(self) -> tuple[Config, bool]:
        return (self.config, self.abnormal)


def moves(situation: Situation, *, asking: bool) -> list[Situation]:
    """Every situation one step away.

    The process raises TRIGGER only when the condition becomes abnormal and CLEAR only when
    it returns to normal; every other action may be taken at any time. With ``asking`` a
    step may also be a question (``can_transition``) about any action, which must leave the
    alarm alone but is taken as the code behaves.
    """
    found = []
    for action in ACTIONS:
        if action is AlarmAction.TRIGGER and situation.abnormal:
            continue
        if action is AlarmAction.CLEAR and not situation.abnormal:
            continue
        after = step(situation.config, action)
        if after is None:
            continue
        abnormal = situation.abnormal
        if action is AlarmAction.TRIGGER:
            abnormal = True
        elif action is AlarmAction.CLEAR:
            abnormal = False
        found.append(Situation(after, abnormal, (*situation.path, action.value)))
    if asking:
        for action in ACTIONS:
            alarm = alarm_in(situation.config)
            MACHINE.can_transition(alarm, action)
            after = config_of(alarm)
            if after != situation.config:
                found.append(
                    Situation(
                        after,
                        situation.abnormal,
                        (*situation.path, f"someone asks whether {action.value} is possible"),
                    )
                )
    return found


def reachable(*, asking: bool = False) -> dict[tuple[Config, bool], Situation]:
    """Every situation a new alarm can reach, each with a shortest path to it."""
    start = Situation(NEW_ALARM, abnormal=False)
    seen = {start.key: start}
    frontier = [start]
    while frontier:
        following = []
        for situation in frontier:
            for after in moves(situation, asking=asking):
                if after.key not in seen:
                    seen[after.key] = after
                    following.append(after)
        frontier = following
    return seen


def told(situation: Situation, problem: str) -> str:
    lines = [f"  {n}. {action}" for n, action in enumerate(situation.path, 1)]
    return (
        "the alarm state machine broke its promise:\n"
        + "\n".join(lines)
        + f"\n  -> {problem} (the alarm is {words(situation.config)}, the process condition "
        + f"is {'abnormal' if situation.abnormal else 'normal'})"
    )


def lost_alarm(situations: dict[tuple[Config, bool], Situation]) -> str | None:
    """An alarm shown NORMAL, or about to return to NORMAL, while its condition is abnormal.

    RESET is the administrative override and is the one way an abnormal condition may be
    shown as NORMAL.
    """
    for situation in situations.values():
        state = situation.config[0]
        if "RESET" in situation.path:
            continue
        if state is AlarmState.NORMAL and situation.abnormal:
            return told(situation, "an abnormal condition is shown as NORMAL")
        if state in ADMIN and situation.abnormal:
            back = step(situation.config, LEAVE[state])
            if back is None or back[0] not in ACTIVE:
                shown = "refused" if back is None else back[0].value
                return told(
                    situation,
                    f"taking the alarm back into service gives {shown}, not an active state",
                )
    return None


class TestEveryReachableConfiguration:
    def test_the_search_closes(self) -> None:
        situations = reachable()
        assert 10 <= len(situations) <= 2 * len(ALL_CONFIGS)
        assert {key[0][0] for key in situations} == set(STATES), "every state is reachable"

    def test_no_abnormal_condition_is_shown_as_normal(self) -> None:
        problem = lost_alarm(reachable())
        assert problem is None, problem

    def test_no_abnormal_condition_is_shown_as_normal_when_someone_asks(self) -> None:
        problem = lost_alarm(reachable(asking=True))
        assert problem is None, problem

    def test_an_alarm_out_of_service_remembers_where_to_return(self) -> None:
        for situation in reachable().values():
            state, saved = situation.config
            if state in ADMIN:
                assert saved is not None, told(situation, "nothing is saved to return to")
                assert saved not in ADMIN, told(situation, "it would return to an admin state")

    def test_nothing_is_saved_outside_an_admin_state(self) -> None:
        for situation in reachable().values():
            state, saved = situation.config
            if state not in ADMIN:
                assert saved is None, told(situation, "a return state is left behind")

    def test_every_alarm_can_get_back_to_normal(self) -> None:
        """No dead end: from every reachable situation some path ends in NORMAL."""
        for situation in reachable().values():
            assert step(situation.config, AlarmAction.RESET) is not None or (
                situation.config[0] is AlarmState.NORMAL
            ), told(situation, "there is no way back to NORMAL")

    def test_an_unacknowledged_alarm_needs_an_acknowledgement_while_in_service(self) -> None:
        """Outside the admin states, ACTIVE_UNACK and CLEAR_UNACK leave for NORMAL only by
        ACKNOWLEDGE or RESET."""
        for state in (AlarmState.ACTIVE_UNACK, AlarmState.CLEAR_UNACK):
            for action in ACTIONS:
                after = step((state, None), action)
                if after is not None and after[0] is AlarmState.NORMAL:
                    assert action in (AlarmAction.ACKNOWLEDGE, AlarmAction.RESET), (
                        f"{state.value} became NORMAL by {action.value}"
                    )


# ---------------------------------------------------------------------------
# The assumption, and the check seen failing
# ---------------------------------------------------------------------------


def test_only_two_fields_matter() -> None:
    """A transition reads and writes ``state`` and ``_state_before_admin`` and nothing else.

    The enumeration above is complete only if this holds. Every other field is set to an
    unusual value and every case is run again: the outcome must be the same, and no other
    field may change.
    """
    others = [
        f.name for f in fields(AlarmInstance) if f.name not in ("state", "_state_before_admin")
    ]
    assert "alarm_id" in others and len(others) >= 10
    for config, action in product(ALL_CONFIGS, ACTIONS):
        odd = AlarmInstance(
            alarm_id="ZZ",
            name="odd",
            tag_path="x/y",
            value=-1,
            setpoint="s",
            area="a",
            equipment_id="e",
            description="d",
            ack_operator="someone",
            shelve_reason="r",
            suppress_reason="r",
        )
        odd.state, odd._state_before_admin = config
        before = {name: getattr(odd, name) for name in others}
        try:
            MACHINE.transition(odd, action)
            outcome: Config | None = config_of(odd)
        except InvalidTransitionError:
            outcome = None
        assert outcome == step(config, action), f"{action.value} in {words(config)}"
        assert {name: getattr(odd, name) for name in others} == before


class _ForgetsToSaveOnTrigger(AlarmStateMachine):
    """Broken: a TRIGGER while suppressed no longer updates the state to return to."""

    def transition(self, alarm: AlarmInstance, action: AlarmAction) -> TransitionResult:
        was_admin, saved = alarm.state in ADMIN, alarm._state_before_admin
        result = super().transition(alarm, action)
        if action is AlarmAction.TRIGGER and was_admin:
            alarm._state_before_admin = saved
        return result


class _WritesWhileLookingUp(AlarmStateMachine):
    """Broken, as the machine was before FB-219: the lookup itself sets the return state."""

    def _resolve(self, alarm: AlarmInstance, action: AlarmAction) -> AlarmState:
        resolved = super()._resolve(alarm, action)
        if alarm.state in ADMIN and action is AlarmAction.CLEAR:
            alarm._state_before_admin = AlarmState.NORMAL
        return resolved


class _ClearsFromAcknowledgedToUnacknowledged(AlarmStateMachine):
    """Broken: an unacknowledged active alarm that clears goes straight to NORMAL."""

    def _resolve(self, alarm: AlarmInstance, action: AlarmAction) -> AlarmState:
        if alarm.state is AlarmState.ACTIVE_UNACK and action is AlarmAction.CLEAR:
            return AlarmState.NORMAL
        return super()._resolve(alarm, action)


def test_a_machine_that_forgets_a_retrigger_is_caught(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(globals(), "MACHINE", _ForgetsToSaveOnTrigger())
    problem = lost_alarm(reachable())
    assert problem is not None and "not an active state" in problem
    assert "TRIGGER" in problem and "CLEAR" in problem


def test_a_machine_whose_lookup_writes_is_caught(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(globals(), "MACHINE", _WritesWhileLookingUp())
    with pytest.raises(AssertionError, match="asking whether CLEAR is possible"):
        TestEveryStep().test_asking_changes_nothing()
    problem = lost_alarm(reachable(asking=True))
    assert problem is not None and "someone asks whether CLEAR is possible" in problem


def test_a_machine_that_drops_an_unacknowledged_alarm_is_caught(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(globals(), "MACHINE", _ClearsFromAcknowledgedToUnacknowledged())
    with pytest.raises(AssertionError, match="ACTIVE_UNACK became NORMAL by CLEAR"):
        TestEveryReachableConfiguration().test_an_unacknowledged_alarm_needs_an_acknowledgement_while_in_service()


def test_a_counterexample_reads_in_plain_words() -> None:
    situation = Situation((AlarmState.SUPPRESSED, AlarmState.NORMAL), True, ("TRIGGER", "SUPPRESS"))
    text = told(situation, "something is wrong")
    assert "1. TRIGGER" in text and "2. SUPPRESS" in text
    assert "SUPPRESSED (to return to NORMAL)" in text and "condition is abnormal" in text
