---
name: verify-fxts-gate
description: "Check a change to the FxTS gate (what `forge governance check` lets through: accepted gaps, their approval, their backlog item, what is never accepted) against every case. Use when a change touches forge-core/src/python/forge_core/fxts/shared/gaps.py (AcceptedGap, judge, load, overlaps, accepted_checks), the gate functions in forge-hub/src/python/forge_hub/cli/governance.py (gate_runs, gate_findings, gate_problems, gate, check_command, gap_approve), or the format of forge-core/fxts/accepted-gaps.json; or for 'can a gap get through without the owner', 'what does the gate accept', 'verify the gate'."
---

# Verify the FxTS gate

## The promise and the harm

**Promise:** the gate passes exactly when nothing is wrong outside the specs, every check that failed or did not run is covered by an accepted gap the owner approved as it is now and whose backlog item is open, and every accepted gap covers something that was found and names an open item. An entry changed in any way the owner did not approve accepts nothing. So the list of accepted gaps grows only on the owner's word, and it shrinks as the work is done.

**Harm if it breaks:** a fault in a governed spec reaches `main` because someone wrote it into a list, or an accepted gap outlives the fix and hides the next fault of the same kind. Before 2026-11-23 the allowances were tables in seven test files that anyone could edit (the FxTS audit, `forge-core/docs/fxts/AUDIT-2026-11-23.md` §2.2; BACKLOG FB-266).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/fxts/shared/gaps.py` | `AcceptedGap` (what an entry may say, `content_hash`, `approved`, `covers`, `approved_by`), `judge` (the rule), `load` and `overlaps` (what file is refused), `accepted_checks` |
| `forge-hub/src/python/forge_hub/cli/governance.py` | `gate_findings` (which verdicts are findings: everything but PASS and WAIVED, and a run with none), `gate`, `check_command`, `gaps_command`, `gap_approve`, `accepted_checks`, `GAPS_PATH` |
| `forge-core/fxts/accepted-gaps.json` | its shape (the entries themselves are the repository's state, held by `tests/governance/test_gate.py`) |

It does **not** cover whether a runner gives the right verdict (the frameworks' own tests, FB-278), whether a check can fail at all (FB-278), or whether the approval is the owner's: it is a name in a field, as every spec approval is today (FB-267, FB-280).

**Sync commit:** `61d986d5` (2026-11-23, the change that closed FB-266). See what changed since:

```bash
git log --oneline 61d986d5..HEAD -- forge-core/src/python/forge_core/fxts/shared/gaps.py forge-hub/src/python/forge_hub/cli/governance.py
```

If that prints commits you did not check, look before you trust a pass. Move the sync commit forward only after you have confirmed the check still describes the code.

## Run it

```bash
uv run pytest forge-core/tests/fxts/test_gaps_exhaustive.py forge-hub/tests/cli/test_governance_gate.py -q
```

About two seconds. The expected result at the sync commit is `44 passed`.

## What it does, and why a pass is a proof here

- **The reduction is checked, not assumed.** `judge` decides a finding from the entries that cover it, and `test_an_entry_covers_nothing_else` shows an entry covers only findings of its own framework, check and status, and of its spec or of every spec, over every field that could differ. So one framework and one check lose nothing, and two specs with a named entry on one and the wildcard entry on both give every relation a finding can have to the entries.
- **Every case:** 64 sets of findings (two specs, statuses NOT_RUN, FAIL and ERROR) times 343 sets of entries (three keys, each absent or present, approved or not, with its item open, closed or not in the backlog): 21,952 cases, each decided by `judge` and by the law written a second time in the test, and each checked to be whole (every finding accepted or refused, once; an accepted finding's entry covers it and is usable; the unused entries are exactly those that cover nothing).
- **ERROR stands for every status that is never accepted;** NOT_IMPLEMENTED, a run with no verdict, PASS and WAIVED are each checked to be refused by every entry set.
- **A problem is never let through,** in every case.
- **Bound to content:** changing any field of an approved entry ends its approval (every field is changed in turn; a test fails when a field is added that it does not change), as does an empty name or another hash; an unapproved entry accepts nothing in any case.
- **What cannot be written:** a failure for every spec, another framework's check, an unknown status, a short reason, an extra field, two entries that cover the same findings (every pair of keys), a file that does not read or has a key twice.
- **The commands:** what `check`, `gaps` and `gap-approve` print and exit with, on a gaps file and runs of the test's own.
- **Able to fail:** five broken gates must each be caught with a counterexample in words: the approval ignored, the backlog ignored, an unused entry not reported, an error taken for a failure, an unknown backlog item taken as open.

Nothing is sampled within the reduction. A pass covers the rule, the file's shape and the commands as written.

## Reading a failure

```
found [s1.json NOT_RUN] with [* NOT_RUN (not approved, open item)]: the gate says pass; it must fail
```

`found` lists the findings of one case (spec and status; the check is the same throughout). `with` lists the entries: their spec (`*` is every spec), their status, whether the owner approved them as they are, and whether their backlog item is open, closed or not in the backlog. The last words say what the gate decided and what the law says.

**A real bug or a wrong check?** A case where the gate passes and must fail is a real bug: report it with the counterexample and do not change the check. If the rule was changed on purpose (a new status that may be accepted, a new kind of entry), that changes what the owner's approval means and is the owner's to decide; see below.

## When the code changes on purpose

1. A new field on an entry: add it to `CHANGES` in the test (the field test fails until you do) and decide whether it changes what an entry covers; if it does, extend the keys of the enumeration.
2. A new status that may be accepted: it is the owner's decision. Add it to `STATUSES`, to `ACCEPTABLE_STATUSES` and to the law in `lawful`, written independently of the code.
3. Add a broken gate for each new law, so it is seen failing.
4. Run the command, then break the real code on purpose (for example, drop `gap.approved and` from `usable` in `judge`), see the check fail with a readable counterexample, and undo it.
5. Update the table above and move the sync commit.
