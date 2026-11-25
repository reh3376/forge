---
name: verify-fxts-evidence
description: "Check that every verdict any FxTS runner gives matches a declared check and rests on the kind of evidence it names as reached (self, file, artifact, none), that each framework schema's claim marks split it cleanly, and that every claim no check of the real thing reached is an evidence finding. Use when a change adds, renames or removes a check in a runner (forge-core/src/python/forge_core/fxts/<fw>/runners/<fw>_runner.py, forge-hub/src/python/forge_hub/conformance.py), edits a framework's table of checks (forge-core/src/python/forge_core/fxts/<fw>/checks.py), changes how the runner base assigns evidence or finds claims (shared/runner.py: EvidenceKind, Check, SHARED_CHECKS, declared_checks, declaration_of, with_evidence, evidence_kind_of, evidence_findings, reached_file), changes the marks or the release classifier (shared/schemas.py: MARK_KEY, mark_units, mark_problems, marks_version, diff), or changes a framework's schema; or for 'is this check declared', 'what does this check rest on', 'which claims have no real check', 'verify the evidence kinds'."
---

# Verify the evidence kinds

## The promise and the harm

**Promise (D-19, law 3 and step 2, §12):**

1. Every verdict any runner gives matches a declared check. Its kind is the strongest thing it names in `reached` (`file:<path>`, `artifact:<what>`), `self` when it names nothing, never stronger than its declaration; `none` when it did not run or is waived. A verdict with no declaration, or naming what it reached in another form, is an error.
2. Each framework schema's marks (`x-forge-evidence`: `claim`, `description`, `structure`) split it cleanly, and no check that decides anything reads a description.
3. A claim a spec makes is in its section's `<fw>:evidence-<section>` finding if and only if no verdict of kind `artifact` in that run came from a check covering it or a property above it; the marks in force are the latest approved version's.
4. A mark change is always a minor step and named; a property named like a wording keyword is a name.

**Harm if it breaks:** a check that only compares the spec with itself passes as a check of the real thing, or a claim nothing real was checked against disappears from the gate; the debt step 5 must pay off becomes invisible again (`forge-core/docs/fxts/AUDIT-2026-11-23.md`; BACKLOG FB-264, FB-269 to FB-272, FB-289).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/fxts/<fw>/runners/<fw>_runner.py` | every check id written in it: string literals, the `_verdict` helper's first argument, f-strings in `check_id=` |
| `forge-hub/src/python/forge_hub/conformance.py` | the ids the conformance kit gives (`fmts:m4` to `fmts:m7`) |
| `forge-core/src/python/forge_core/fxts/<fw>/checks.py` | each declaration: id or pattern, the pointers it covers, its kind |
| `forge-core/src/python/forge_core/fxts/shared/runner.py` | `EvidenceKind`, `EVIDENCE_ORDER`, `REACHED_FORM`, `reached_file`, `Check`, `SHARED_CHECKS`, `FxTSVerdict.reached`, `FxTSRunner.declared_checks`, `declaration_of`, `with_evidence`, `evidence_kind_of`, `evidence_findings`, and their calls in `run` |
| `forge-core/src/python/forge_core/fxts/shared/schemas.py` | `MARK_KEY`, `MARKS`, `ROOT_MARK`, `mark_units`, `mark_problems`, `section_id`, `marks_version`, the mark and name cases of `_compare`, `_compare_objects`, `_is_name`, and `release`'s refusal and `changes` |
| `forge-core/contract/fxts/<fw>/schema/<fw>.schema.json` and its registry | the properties the pointers must name; the marks; which version is approved |
| each runner's `reached=` on its `file` and `artifact` checks | what a verdict names; not judged for honesty by the check (below) |

It does **not** decide whether what a verdict names in `reached` was really touched, or whether a declared kind or a mark is honest: a reviewer reads them (`artifact` only when the real thing is run, imported, introspected or called; a text search of files is `file`; a property is `claim` if the real thing could disagree with it). Each release's `changes` names every mark change for the owner's review.

**Sync commit:** `e755ac86` (D-19 step 2, PR 186; step 1 was `536a96c1`, PR 185). See what changed since:

```bash
git log --oneline e755ac86..HEAD -- forge-core/src/python/forge_core/fxts forge-hub/src/python/forge_hub/conformance.py forge-core/contract/fxts
```

## Run it

```bash
uv run pytest tests/governance/test_declared_checks.py tests/governance/test_evidence_claims.py -q
```

About two seconds. The expected result at the sync commit is `924 passed`. `uv run forge governance evidence [framework]` shows the tables, and for each top-level property the strongest evidence declared and the strongest observed today.

## What it does, and why a pass is a proof here

- **Every id a runner can give is read from its source**, not from a list in the test: literals, the `_verdict` helper's literals (prefixed with the framework), the module requirements `fmts:m1` to `fmts:m16` (from `REQUIREMENTS`), and each f-string form, which must equal a declared pattern. So the check reaches ids no spec makes the runner give, such as the failure paths and the live checks.
- **No dead declarations:** each declaration is written somewhere in the runner.
- **Every pointer names a property of the framework's schema**, following `$ref`, `allOf`/`anyOf`/`oneOf`, `additionalProperties`, `patternProperties` and `items`.
- **On every governed spec** (the gate's runs), every verdict has a declaration and the kind the law says: `none` when it did not run or is waived, the declared kind otherwise.
- **Able to fail:** a declaration taken away (an id and a pattern), a pointer to nothing, and a runner that gives an undeclared id must each be caught; the real table was broken on purpose (`facts:time-governed` removed) and the check named it, statically and on every adapter spec. For step 2 the real runner base was broken twice on purpose: a part of a claim counted as covering the whole (caught by the live API case) and a verdict that reached nothing keeping its declared kind (caught by the kind cases).

- **Kinds (step 2):** every combination of status, declared kind and what is named (192) against an oracle; a vacuous pass of an `artifact` check comes out `self`.
- **Marks:** every assignment of marks to a small schema (625) against an oracle that counts the marks on each leaf's path; the six real schemas are clean; four broken schemas and a refused release.
- **Findings:** on every governed spec, the run's evidence findings equal an oracle's; a check of the real thing covers its claims and a part does not cover the whole (a live API check with the release's marks in force); a dropped or invented finding is caught.
- **Releases:** every mark transition at three places is one minor, named change; a property named like each wording keyword is a name.
- **Marks in force:** a release awaiting approval changes nothing; approved, it is in force; none approved, every section is a claim.

## Reading a failure

```
AssertionError: assert ['facts:time-governed'] == []        (test_every_id_written_in_a_runner_is_declared)
```

An id written in the runner has no declaration: add it to `checks.py` with the pointers it looks at and the kind it reaches. A dead declaration names an entry the runner no longer writes: remove it. A pointer failure names `<id> covers <pointer>`: the property moved or the pointer is wrong.

A findings failure names the spec: compare its `<fw>:evidence-*` verdicts with what `forge governance evidence <fw>` says the claims are and which checks covered them. A marks failure names the pointer and what is wrong with it.

**A real bug or a wrong check?** An undeclared id means a check was added without saying what it rests on: declare it, honestly. A scan that misses a new way of building ids (a new helper) is the check's gap: extend `written_ids`, do not weaken the assertion.

## When the code changes on purpose

1. A new check: declare it in the framework's `checks.py`; its kind is what it reaches when it runs.
2. A new helper that builds ids: teach `written_ids` to read it.
3. A new framework: add it to `FRAMEWORKS` in the test and give it a `checks.py`.
4. Run the command, break a real declaration on purpose, see the check name it, restore it.
5. Update the table above and move the sync commit.
