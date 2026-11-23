---
name: verify-ot-write-review
description: "Check a change to the plant-floor write path (forge-ot control: the two-step review gate, review tokens, the write engine's chain to the controller) against every sequence and interleaving in a bound. Use when a change touches src/forge/modules/ot/control/review.py, write_engine.py, validation.py, interlock.py or the write models, or for 'does a write still need review', 'can a token be reused', 'verify the write gate'."
---

# Verify the plant-floor write review gate

## The promise and the harm

**Promise:** on a tag whose confirmation is two-step, an operator's value reaches the process controller only when that exact write was staged and is then committed once, by the same person, with the same value, before its review token expires.

**Harm if it breaks:** a value nobody reviewed, or the same value twice, is written to a PLC that runs a process.

## Does your change touch it

Run the check when a change touches any of these. Paths are as of the sync commit below; the code moves to `forge-modules/forge-ot/` with BACKLOG FB-201, and the paths here move with it.

| File | What the check covers in it |
|---|---|
| `src/forge/modules/ot/control/review.py` | `WriteReviewer.check`, `stage`, `cancel`, `_same_write`, `_evict_expired`, `ReviewTicket.expired` |
| `src/forge/modules/ot/control/write_engine.py` | `ControlWriteEngine.execute`, `stage`, `_write_and_readback` (the order of the layers and what is written) |
| `src/forge/modules/ot/control/validation.py` | `WriteValidator.validate` as the first layer |
| `src/forge/modules/ot/control/interlock.py` | `InterlockEngine.check` as a layer that can refuse after the token is used |
| `src/forge/modules/ot/control/models.py`, `src/forge/core/models/control.py` | `WriteRequest`, `TagWriteConfig.coerce`, `ConfirmationMode`, `WriteOrigin` |

**Sync commit:** `1a257db1` (2026-11-22). The check was confirmed to describe the code at this commit. See what changed since:

```bash
git log --oneline 1a257db1..HEAD -- src/forge/modules/ot/control/review.py src/forge/modules/ot/control/write_engine.py src/forge/modules/ot/control/validation.py src/forge/modules/ot/control/interlock.py src/forge/modules/ot/control/models.py src/forge/core/models/control.py
```

If that prints commits you did not check, the verification needs a look before you trust a pass: read "When the code changes on purpose". Move the sync commit forward only after you have confirmed that the check still describes the code at the new commit.

## Run it

```bash
uv run pytest tests/modules/ot/control/test_review_gate_exhaustive.py -q
```

About one second. It needs nothing beyond the project's locked dependencies. The deeper run, about fifteen seconds, for a change to the gate itself:

```bash
FORGE_REVIEW_GATE_DEPTH=4 uv run pytest tests/modules/ot/control/test_review_gate_exhaustive.py -q
```

The expected result at the sync commit is `9 passed, 1 xfailed`. The one expected failure is a known finding (below), not noise.

## What it does

It is not a model. It drives the real `ControlWriteEngine` and `WriteReviewer` with a stand-in controller that logs every write, and compares that log after every step with an independent statement of the promise (`Promise` in the test file).

- **Every sequence** of these steps up to the depth (3 by default, 14,939 sequences): a person stages a value; a person commits a value with no token, a made-up token or any issued token; a staged write is cancelled; 60 or 120 seconds pass (120 is the timeout to the second, the boundary); the interlock's check tag changes state.
- **Every interleaving** of commits, a cancel and a second staging that run at once on one staged write, by stepping each coroutine by hand at every read and write of the controller (five races, up to 90 interleavings each).
- **Able to fail:** four broken variants of the gate (a token usable twice, a token that never expires, a token not bound to its write, two-step not required) must each produce a counterexample, in sequence and in a race.

**Bounds:** two people, two staged values and four spellings of a committed value, at most two staged writes held (`MAX_PENDING`), sequences of 3 or 4 steps, three coroutines at once. A pass covers these bounds. It does not prove the promise for every size.

## Reading a failure

A failure is told as steps in the code's own words:

```
the review gate broke its promise:
  1. op1 stages 150.0
  2. op1 commits 150.0 with the token of staged write #0
  3. op1 commits 150.0 with the token of staged write #0
  -> the controller was written 150.0, and nothing may be written here
```

A race failure names the race and the order the coroutines were stepped in, for example `[0, 0, 1, 1]` means the first commit moved twice, then the second.

**A real bug or a wrong check?** Replay the steps by hand against the promise in one sentence above.

- The steps describe a write the promise forbids (no staging, a second use, another person, another value, after expiry), or a reviewed write that did not happen: **the code is wrong.** Report it with the counterexample. Do not change the check to make it pass.
- The steps are allowed by a rule you changed on purpose (for example a new confirmation mode, or tokens that survive a refused commit): **the check is out of date.** Go to "When the code changes on purpose".
- The broken-variant tests fail with "the search did not notice": the check has lost its ability to fail. That is a defect in the check; fix it before trusting any pass.

A broken gate can make the run slow (up to about ninety seconds), because every coroutine in a race then runs to the end.

## Known finding at the sync commit

`test_the_value_written_is_the_value_reviewed` is marked as an expected failure (strict), BACKLOG FB-215:

```
  1. op1 stages 150.0
  2. op1 commits 150 with the token of staged write #0
  -> the controller was written 150 (int); the reviewed value is 150.0 (float)
```

The gate compares the committed value after coercion (`WriteReviewer._same_write`), and the engine then writes the request's own value (`write_engine.py`, `write_tag(request.tag_path, request.value)`). So a commit that spells the reviewed number another way (`150`, `"150.0"`) reaches the controller as an int or a string. The number is the same; the type is not what was reviewed. When the code is changed to write the coerced value, this test starts passing, the strict marker fails the run, and you remove the marker and the finding from this file.

## When the code changes on purpose

1. Change the statement of the promise first: `Promise.stage`, `Promise.commit`, `Promise.cancel` in `tests/modules/ot/control/test_review_gate_exhaustive.py`. Keep it independent: write what must be true from the steps alone, and do not call the gate's code from it.
2. If the change adds a step a person or the system can take, add it to `steps_from` and `Step.words`. If it adds something that can run at the same time, add a `Race`.
3. Add a broken variant for each new rule to `BROKEN`, so the new rule is seen failing.
4. Run both commands above. Then make a scratch change in the real code that breaks the new rule, see the check fail with a readable counterexample, and undo the scratch change.
5. Update the table of covered files and move the sync commit to the commit you confirmed.

## What it does not cover

- **System-origin writes** (`WriteOrigin.SYSTEM`: recipe downloads, CIP starts) pass the gate by design and are not explored. That an outside request cannot mark itself as a system write was read in `control/api.py` at the sync commit (the request body has no origin field); it is not checked by this skill.
- **The value an operator reviewed against** (`ReviewTicket.current_value`) can be stale by the time of the commit; the gate does not re-read it, and the promise does not ask it to.
- **Time between the check and the write:** the token's expiry is checked when the commit starts. The controller write follows after the interlock reads, so it can land shortly after the expiry time.
- Reason codes, authorization rules, read-back confirmation, the REST routes, and the real OPC UA client.
- One-step tags, and any size beyond the bounds above.
