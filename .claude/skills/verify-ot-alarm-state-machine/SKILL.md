---
name: verify-ot-alarm-state-machine
description: "Check a change to the forge-ot alarm state machine (ISA-18.2 states, transitions, suppress/shelve/out-of-service and the state an alarm returns to) against every configuration it can be in. Use when a change touches src/forge/modules/ot/alarming/state_machine.py or the AlarmState/AlarmAction enums, or for 'can an alarm be lost', 'is this transition valid', 'verify the alarm states'."
---

# Verify the alarm state machine

## The promise and the harm

**Promise:** an alarm whose process condition is abnormal is never shown as NORMAL, and neither an operator action nor a question about an alarm loses it. The one exception is RESET, the administrative override.

**Harm if it breaks:** a standing alarm silently disappears from the operator's list.

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `src/forge/modules/ot/alarming/state_machine.py` | `AlarmStateMachine.transition`, `can_transition`, `get_valid_actions`, `_resolve`, and the tables `_TRANSITIONS`, `_ADMIN_ENTRY_STATES`, `_ADMIN_ACTIONS`, `_ADMIN_RETURN` |
| `src/forge/core/models/alarm.py` | `AlarmState`, `AlarmAction` (a new state or action changes the enumeration) |
| `src/forge/modules/ot/alarming/models.py` | `AlarmInstance.state`, `AlarmInstance._state_before_admin`, and that no other field affects a transition |

Paths are as of the sync commit; the code moves to `forge-modules/forge-ot/` with BACKLOG FB-201.

**Sync commit:** `e1a50afd` (2026-11-22). See what changed since:

```bash
git log --oneline e1a50afd..HEAD -- src/forge/modules/ot/alarming/state_machine.py src/forge/modules/ot/alarming/models.py src/forge/core/models/alarm.py
```

If that prints commits you did not check, look before you trust a pass. Move the sync commit forward only after you have confirmed the check still describes the code.

## Run it

```bash
uv run pytest tests/modules/ot/alarming/test_state_machine_exhaustive.py -q
```

Under a second. The expected result at the sync commit is `17 passed, 2 xfailed`. The two expected failures are two known findings (below).

## What it does, and why a pass is a proof here

The machine is finite. A transition reads and writes two fields of an alarm, `state` (7 values) and `_state_before_admin` (None or one of 7): 56 configurations, 10 actions.

- **Every configuration and every action**, 560 cases, reachable or not, for the laws about one step: a refused action changes nothing; asking agrees with doing; RESET always ends in NORMAL.
- **Every configuration reachable from a new alarm**, with the process condition tracked beside it (29 situations; 29 as well when questions are allowed as steps, since a question changes nothing). The search stops when no step leads anywhere new, so there is no depth bound.
- **The assumption is checked:** `test_only_two_fields_matter` sets every other field to an unusual value and runs all 560 cases again.
- **Able to fail:** three broken machines (one forgets a re-trigger while suppressed, one drops an unacknowledged alarm on CLEAR, one whose lookup writes the alarm) must each be caught.
- **History:** the first run found that `can_transition` changed the alarm: asked whether CLEAR was possible on a suppressed alarm, it rewrote the state the alarm returns to, and a standing alarm came back as NORMAL (BACKLOG FB-219, the counterexample under "Reading a failure"). `_resolve` now only reads; `transition` does the write. `test_asking_changes_nothing` and `test_no_abnormal_condition_is_shown_as_normal_when_someone_asks` hold it.

Nothing is sampled and nothing is bounded, so a pass covers this machine as written. It does not cover the alarm engine around it (detection, timers for shelving, persistence, the API).

## Reading a failure

```
the alarm state machine broke its promise:
  1. TRIGGER
  2. SUPPRESS
  3. someone asks whether CLEAR is possible
  -> taking the alarm back into service gives NORMAL, not an active state (the alarm is SUPPRESSED (to return to NORMAL), the process condition is abnormal)
```

The numbered lines are the actions in order from a new alarm. `(to return to X)` is the saved state the alarm goes back to when it is taken out of suppression, shelving or out-of-service.

**A real bug or a wrong check?** If the steps end with an abnormal condition shown as NORMAL, or an alarm that would return to NORMAL while abnormal, the code is wrong: report it with the steps and do not change the check. If you changed the state diagram on purpose (a new state, a new action, a different return rule), the check is out of date: see below.

## Known findings at the sync commit

Each is a strict expected failure. When the code is fixed the test passes, the strict marker fails the run, and you remove the marker and the entry here.

- **FB-220, `get_valid_actions` leaves out CLEAR and TRIGGER** for a suppressed, shelved or out-of-service alarm, which `transition` accepts. Test: `test_the_list_of_valid_actions_is_what_the_machine_accepts`. It may be intended (the list is of operator actions, and those two come from the process); then the method's name and the test should say so.
- **FB-221, RESET leaves a saved return state behind.** TRIGGER, SUPPRESS, RESET gives an alarm that is NORMAL and still remembers ACTIVE_UNACK. Harmless today, because entering an admin state always overwrites it. Test: `test_nothing_is_saved_outside_an_admin_state`.

## A design point the check records and does not judge

An unacknowledged alarm that is suppressed, clears while suppressed, and is then unsuppressed returns to NORMAL without ever being acknowledged. In service the same alarm would wait in CLEAR_UNACK for an acknowledgement. `state_machine.py` says this is intended ("or NORMAL if cleared while admin"). The check holds the in-service rule only (`test_an_unacknowledged_alarm_needs_an_acknowledgement_while_in_service`).

## When the code changes on purpose

1. A new state or action: the enumeration picks it up from the enums. Decide what the promise says about it and add or change the laws in `TestEveryStep` and `TestEveryReachableConfiguration`.
2. A new field that a transition reads or writes: the 56 configurations are no longer the whole state. Extend `Config`, `alarm_in`, `config_of` and `ALL_CONFIGS`, and `test_only_two_fields_matter`.
3. Add a broken machine for each new law, so it is seen failing.
4. Run the command, then break the real code on purpose, see the check fail with readable steps, and undo it.
5. Update the table and move the sync commit.
