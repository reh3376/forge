---
name: verify-fxts-kinds
description: "Check a change to what counts as a governed file (the kinds a governed folder may hold, where a spec may live, how a spec of each framework is named, what is a stray or a fixture) against every folder, suffix and depth the rules name. Use when a change touches forge-core/src/python/forge_core/fxts/locations.py (RULES, Kind, kind_of, is_spec_name, SPEC_SUFFIXES, STRAY_SUFFIXES, FIXTURES), adds a framework or a kind of governed file, or moves a governed folder; or for 'is every file governed', 'can a spec hide', 'verify the closed set'."
---

# Verify the closed set of governed files

## The promise and the harm

**Promise:** every file in a governed folder (an `fxts` folder of the hub or a module, `forge-core/fxts`, `forge-core/contract`) is exactly one known kind, or `unknown`, which the gate refuses; a file anywhere else is a test fixture, a stray (named as a governed file), or nothing to governance. No path has two kinds, and no path has none.

**Harm if it breaks:** a spec sits where the gate does not look, or is run as the wrong framework's spec, and passes for something nobody checked. Before 2026-11-24 a spec could be nested, misnamed, left in a module's own folder or copied under a new name, and the governance command did not see it (the FxTS audit, `forge-core/docs/fxts/AUDIT-2026-11-23.md` §2.4; BACKLOG FB-268).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/fxts/locations.py` | `RULES` and `Rule.match`, `kind_of`, `matching_rules`, `is_governed_place`, `is_spec_name`, `SPEC_SUFFIXES`, `STRAY_SUFFIXES`, `NAMED_SUFFIXES`, `CONTRACT_FRAMEWORKS`, `FIXTURES`, `GOVERNED_KINDS`, `OTHER_KINDS` |

It does **not** cover what the gate does with a kind (`closed_set_problems`, `identity_problems` in `forge-hub/src/python/forge_hub/cli/governance.py`, tested in `forge-hub/tests/cli/test_governance_closed_set.py`), or whether git's file list is the repository's (that is git's).

**Sync commit:** the commit that closes FB-268 (it is named in `BACKLOG-DONE.md`, row FB-268, once the change is merged). See what changed since:

```bash
git log --oneline <that commit>..HEAD -- forge-core/src/python/forge_core/fxts/locations.py
```

If that prints commits you did not check, look before you trust a pass. Move the sync commit forward only after you have confirmed the check still describes the code.

## Run it

```bash
uv run pytest forge-core/tests/fxts/test_kinds.py -q
```

Well under a second. The expected result at the sync commit is `9 passed`.

## What it does, and why a pass is a proof here

- `kind_of` reads only the path, and the rules look at four things in it: the owner folder, the folders under `fxts` or the contract, the depth, and the file name.
- **The grid** crosses every owner (the hub, a module, a hidden folder that is no module), every folder a rule names and some it does not (an unknown framework, a folder nested one deeper than any rule allows), and every file name a rule names, each in every place, plus hidden files, `.DS_Store` and plain files: about 2,800 paths. `test_the_grid_reaches_every_rule_and_every_kind` fails when a rule or a kind is added that the grid does not reach.
- **Two answers for every path:** `kind_of`, and `oracle` in the test, written a second time with plain conditions instead of the rules' patterns. They must agree; and no path may match two rules (`matching_rules`).
- **The real tree:** no file the repository holds today is `unknown` or `stray`.
- **Able to fail:** four broken rule sets must each be caught with the path that shows it: the API rule without its naming rule (as the old `*.json` glob was), object schemas allowed one folder deeper, an index rule that overlaps the real one, a placeholder rule that reaches the proto folder.

A pass covers the rules as written, for every combination of the four things they read.

## Reading a failure

```
forge-hub/fxts/fats/forge-x.facts.json is Kind(name='spec', framework='fats', owner='forge-hub'); it must be Kind(name='unknown', framework='', owner='')
```

The path, what `kind_of` said, and what the law says. `matches 2 rules` instead means two rules claim one path: the rules overlap.

**A real bug or a wrong check?** If `kind_of` gives a governed kind to a path the oracle calls `unknown` or `stray`, the code lets a file through: report it with the path and do not change the check. If the layout was changed on purpose (a new framework, a new kind, a folder moved), update the oracle to the new layout, written independently of the rules, and see below.

## When the code changes on purpose

1. A new framework with specs: add it to `SPEC_SUFFIXES` (and `NAMED_SUFFIXES` follows); the grid picks it up. Teach `oracle` its naming rule.
2. A new kind of governed file: add its `Rule` and its name to `GOVERNED_KINDS`; add a name and a folder for it to `NAMES` or `_folders()` in the test, and its condition to `oracle`.
3. Add a broken rule set for the new rule, so it is seen failing.
4. Run the command, then break the real code on purpose (for example, drop the `fats` exclusion of named suffixes in `is_spec_name`), see the check fail with the path, and undo it.
5. Update the table above and move the sync commit.
