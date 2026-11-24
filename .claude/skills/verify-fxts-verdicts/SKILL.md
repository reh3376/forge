---
name: verify-fxts-verdicts
description: "Check a change to how an FxTS run is judged (verdict statuses, the outcome of a run, the summary line, the exit code of `forge governance run`) against every case. Use when a change touches forge-core/src/python/forge_core/fxts/shared/runner.py (VerdictStatus, RunOutcome, outcome_of, FxTSReport, FxTSRunner.run), emit_report or the run command in forge-hub/src/python/forge_hub/cli, or when a runner gains a new kind of verdict; or for 'can a run pass with a check not run', 'does a skipped check count', 'verify the verdicts'."
---

# Verify how an FxTS run is judged

## The promise and the harm

**Promise:** a run never passes unless every check ran and passed. A check that did not run, a requirement that is waived, a runner that broke and a run with no check at all are each reported as what they are, and none of them is a pass (D-14, F-7).

**Harm if it breaks:** a spec is reported as met when nothing looked at it. That is what the code did until 2026-11-23: a skipped check counted as passed, and a run with no verdict passed (the audit, `forge-core/docs/fxts/AUDIT-2026-11-23.md` §2.1; BACKLOG FB-265).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/fxts/shared/runner.py` | `VerdictStatus`, `RunOutcome`, `FAILING_STATUSES`, `UNOBSERVED_STATUSES`, `outcome_of`; `FxTSReport.outcome`, `passed`, `failed`, `failures`, `not_run`, `waived`, `summary`, `to_json`; in `FxTSRunner.run`, the handling of a runner that raises and of a runner that returns no verdict |
| `forge-hub/src/python/forge_hub/cli/governance.py` | `emit_report` (what is printed for each outcome), `EXIT_INCOMPLETE` |
| `forge-hub/src/python/forge_hub/cli/main.py` | `governance_run`: the exit code for each outcome |
| every `*.py` under `forge_core/fxts` and `forge_hub` | that no code names a verdict status that does not exist |

It does **not** cover whether a runner gives the right verdict for a given spec, or whether a check that should exist does. Those are the frameworks' own tests and BACKLOG FB-264, FB-266.

**Sync commit:** `fb21b80e` (2026-11-23, the change that closed FB-265). See what changed since:

```bash
git log --oneline fb21b80e..HEAD -- forge-core/src/python/forge_core/fxts/shared/runner.py forge-hub/src/python/forge_hub/cli/governance.py forge-hub/src/python/forge_hub/cli/main.py
```

If that prints commits you did not check, look before you trust a pass. Move the sync commit forward only after you have confirmed the check still describes the code.

## Run it

```bash
uv run pytest tests/governance/test_verdicts_exhaustive.py -q
```

Under a second. The expected result at the sync commit is `82 passed`.

## What it does, and why a pass is a proof here

The rule is a function of a finite thing. `outcome_of` takes the statuses of a run's verdicts; there are six statuses.

- **It reads only which statuses are present.** That is checked, not assumed: every sequence of up to four verdicts over all six statuses (1,555 sequences) gives the same outcome as its set. So the 64 sets of statuses are every case.
- **The rule itself**, on all 1,555 sequences, against the law written a second time in the test in a different way. One set passes, the set holding only `PASS`.
- **The report**: `outcome`, `passed`, `failed`, the counts (every verdict counted once), the summary line (it names "not run", "waived", "failed" and "no check ran" exactly when they apply) and the JSON, on the same sequences.
- **The command line**: for each of the 64 sets, the real `forge governance run` command with the runner replaced by one that returns those verdicts: the exit code (0, 1, 3), the closing line, and that every verdict that is not a pass is named.
- **The runner base**: a runner that returns nothing fails; a runner that raises gives one `ERROR` verdict with the exception and where it was raised.
- **The enumeration comes from `VerdictStatus`**, so a status added later is in it, and `test_every_status_is_classified_once` fails until the new status is passed, failing or unobserved, and exactly one of them. A scan of the source fails if code names a status that is not in the enum.
- **Able to fail:** four broken rules must each be caught with the counterexample in words: the rule the code had before (a skip is a pass), "nothing checked is fine", "a waiver is a pass", "an error is only incomplete".

Nothing is sampled. A pass covers the rule, the report, the printing and the exit code as written.

## Reading a failure

```
a run with the verdicts [NOT_RUN] is reported as PASS; it is INCOMPLETE
```

The list in brackets is the verdicts of one run, in order; "no verdict at all" is the empty run. The first word after "reported as" is what the code said, the last is what the law says.

```
AssertionError: NOT_RUN has 0 meanings
```

A status is in none (or more than one) of: `PASS`, `FAILING_STATUSES`, `UNOBSERVED_STATUSES`.

**A real bug or a wrong check?** If the counterexample shows a run reported as `PASS` that holds anything but `PASS` verdicts, or holds none, the code is wrong: report it with the counterexample and do not change the check. If the meaning of a status was changed on purpose, that is a change to what D-14 F-7 means and is the owner's to make; see below.

## When the code changes on purpose

1. A new status: add it to `VerdictStatus` and to exactly one of the two sets (or leave it as the one passing status, which needs the owner's word). Add its row to `expected` in the test, written independently of the code, and to the table in `forge-core/docs/fxts/README.md`, "What a run says".
2. A new outcome, or a new exit code: extend `RunOutcome`, `EXIT_CODE` in the test and the table in the README.
3. Add a broken rule for each new law, so it is seen failing.
4. Run the command, then break the real code on purpose (for example, take `NOT_RUN` out of `UNOBSERVED_STATUSES`), see the check fail with a readable counterexample, and undo it.
5. Update the table above and move the sync commit.
