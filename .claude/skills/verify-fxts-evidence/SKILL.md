---
name: verify-fxts-evidence
description: "Check that every verdict any FxTS runner gives matches a declared check and names its kind of evidence (self, file, artifact, none). Use when a change adds, renames or removes a check in a runner (forge-core/src/python/forge_core/fxts/<fw>/runners/<fw>_runner.py, forge-hub/src/python/forge_hub/conformance.py), edits a framework's table of checks (forge-core/src/python/forge_core/fxts/<fw>/checks.py), changes how the runner base assigns evidence (shared/runner.py: EvidenceKind, Check, SHARED_CHECKS, declared_checks, declaration_of, with_evidence), or changes a framework's schema; or for 'is this check declared', 'what does this check rest on', 'verify the evidence kinds'."
---

# Verify the evidence kinds

## The promise and the harm

**Promise (D-19, law 3):** every verdict any runner gives matches a declared check, and names the kind of evidence it rests on: the spec itself (`self`), another file (`file`), the real thing (`artifact`), or nothing (`none`: not run, waived, or about the runner rather than the spec). A verdict with no declaration is an error, never a silent pass.

**Harm if it breaks:** a check is added that reads like a check of the real thing and only compares the spec with itself, and nobody can see it; the debt step 5 must pay off becomes invisible again (`forge-core/docs/fxts/AUDIT-2026-11-23.md`; BACKLOG FB-264).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/fxts/<fw>/runners/<fw>_runner.py` | every check id written in it: string literals, the `_verdict` helper's first argument, f-strings in `check_id=` |
| `forge-hub/src/python/forge_hub/conformance.py` | the ids the conformance kit gives (`fmts:m4` to `fmts:m7`) |
| `forge-core/src/python/forge_core/fxts/<fw>/checks.py` | each declaration: id or pattern, the pointers it covers, its kind |
| `forge-core/src/python/forge_core/fxts/shared/runner.py` | `EvidenceKind`, `Check`, `SHARED_CHECKS`, `FxTSRunner.declared_checks`, `declaration_of`, `with_evidence`, and their call in `run` |
| `forge-core/contract/fxts/<fw>/schema/<fw>.schema.json` | the properties the pointers must name |

It does **not** decide whether a declared kind is honest (a reviewer reads the table: `artifact` only when the real thing is run, imported, introspected or called; a text search of files is `file`), nor whether a claim has a check of the real thing at all (D-19 step 2).

**Sync commit:** the commit that builds D-19 step 1 (named in `BACKLOG-DONE.md` or the FB-264 row once merged). See what changed since:

```bash
git log --oneline <that commit>..HEAD -- forge-core/src/python/forge_core/fxts forge-hub/src/python/forge_hub/conformance.py forge-core/contract/fxts
```

## Run it

```bash
uv run pytest tests/governance/test_declared_checks.py -q
```

About a second. The expected result at the sync commit is `29 passed`. `uv run forge governance evidence [framework]` shows the tables, and for each top-level property the strongest evidence declared and the strongest observed today.

## What it does, and why a pass is a proof here

- **Every id a runner can give is read from its source**, not from a list in the test: literals, the `_verdict` helper's literals (prefixed with the framework), the module requirements `fmts:m1` to `fmts:m16` (from `REQUIREMENTS`), and each f-string form, which must equal a declared pattern. So the check reaches ids no spec makes the runner give, such as the failure paths and the live checks.
- **No dead declarations:** each declaration is written somewhere in the runner.
- **Every pointer names a property of the framework's schema**, following `$ref`, `allOf`/`anyOf`/`oneOf`, `additionalProperties`, `patternProperties` and `items`.
- **On every governed spec** (the gate's runs), every verdict has a declaration and the kind the law says: `none` when it did not run or is waived, the declared kind otherwise.
- **Able to fail:** a declaration taken away (an id and a pattern), a pointer to nothing, and a runner that gives an undeclared id must each be caught; the real table was broken on purpose (`facts:time-governed` removed) and the check named it, statically and on every adapter spec.

## Reading a failure

```
AssertionError: assert ['facts:time-governed'] == []        (test_every_id_written_in_a_runner_is_declared)
```

An id written in the runner has no declaration: add it to `checks.py` with the pointers it looks at and the kind it reaches. A dead declaration names an entry the runner no longer writes: remove it. A pointer failure names `<id> covers <pointer>`: the property moved or the pointer is wrong.

**A real bug or a wrong check?** An undeclared id means a check was added without saying what it rests on: declare it, honestly. A scan that misses a new way of building ids (a new helper) is the check's gap: extend `written_ids`, do not weaken the assertion.

## When the code changes on purpose

1. A new check: declare it in the framework's `checks.py`; its kind is what it reaches when it runs.
2. A new helper that builds ids: teach `written_ids` to read it.
3. A new framework: add it to `FRAMEWORKS` in the test and give it a `checks.py`.
4. Run the command, break a real declaration on purpose, see the check name it, restore it.
5. Update the table above and move the sync commit.
