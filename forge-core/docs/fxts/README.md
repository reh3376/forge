# FxTS — Forge Governance Framework Documentation

**Version:** 0.1.0
**Last Updated:** 2026-04-06
**Lineage:** Adapted from MDEMG's UxTS framework

---

## What is FxTS?

FxTS (Forge x Test Specification) is the **specification-first governance and instantiation framework** for the Forge platform. It is not a testing layer. It is the primary mechanism by which the platform's behavior is defined, governed, and enforced.

When an FxTS spec declares something, that declaration is a contractual commitment. The spec is the source of truth — implementation code conforms to specs, not the other way around.

## Core Principles

1. **Specs define what must exist.** A FATS spec declaring an endpoint means that endpoint MUST exist and behave as specified. A FACTS spec declaring adapter capabilities means the adapter MUST implement them.

2. **Schema-runner parity is mandatory.** Every field in an FxTS schema must be enforced by its runner. Silent ignore of schema fields is prohibited. A single unimplemented field causes HARD FAIL.

3. **Runners produce structured verdicts.** Not bare pass/fail, but evidence-backed verdicts with check IDs, spec references, violation details, and timing data.

4. **Hashing lock ensures spec integrity.** Every spec carries a self-contained SHA-256 hash in its `integrity` block. The hash is computed over the canonical JSON representation of the spec excluding the hash field itself. Hash verification is **independent from assertion execution** — a spec can PASS all assertions but have `hash_verified=false` if it was modified. These are orthogonal governance signals. (Inherited from UxTS.)

5. **CI gates enforce compliance.** Hard-fail frameworks block merges. Soft-fail frameworks warn but don't block. No framework is advisory-only.

## Hashing Lock & Hash Governance (FHTS)

Every FxTS spec carries a self-contained integrity hash — a tamper/drift detection mechanism inherited from UxTS. The **FHTS** (Forge Hash Test Specification) framework extends this with hash state tracking, change history, and AI agent governance, adapted from MDEMG's UNTS (Universal Hash Test Specification).

### Two-Layer Architecture

**Layer 1 — Self-Contained Hash (in every spec):** Each spec carries its own `integrity` block with the current hash, state, previous hash, and change history. This makes the spec a portable, self-describing artifact.

**Layer 2 — Cross-Cutting Registry (FHTS):** A central registry tracks hash state across ALL frameworks, enabling scan/verify-all, revert operations, and aggregate reporting. See [FHTS.md](FHTS.md) for full details.

### Integrity Block Format

```json
{
  "integrity": {
    "hash_method": "sha256-c14n-v1",
    "spec_hash": "3a161edf...",
    "hash_state": "approved",
    "previous_hash": "b7f42a01...",
    "approved_by": "reh3376",
    "approved_at": "2026-04-06T12:00:00Z",
    "change_history": [
      {
        "previous_hash": "b7f42a01...",
        "new_hash": "3a161edf...",
        "changed_at": "2026-04-06T11:55:00Z",
        "source": "agent",
        "changed_by": "claude-opus-4-6",
        "change_type": "content",
        "reason": "Updated lifecycle timeouts per sprint plan S1.4"
      }
    ]
  }
}
```

### Hash States

| State | Meaning |
|-------|---------|
| `approved` | Current hash reviewed and approved by authorized actor |
| `modified` | Spec changed since last approval — needs review |
| `pending_review` | Flagged for review by CI or governance workflow |
| `reverted` | Hash rolled back to a previous value |
| `unknown` | Initial state or status uncertain |

### Supported Hash Methods

| Method | Description |
|--------|-------------|
| `sha256-c14n-v1` | Canonical JSON (sorted keys, compact separators) → SHA-256. **Normative.** |
| `sha256-jcs` | Legacy alias for `sha256-c14n-v1`. Backward-compatible. |

### Report Semantics (Extended)

| `hash_verified` | `hash_state` | Meaning |
|-----------------|--------------|---------|
| `true` | `approved` | Spec unmodified, approved — **ideal state** |
| `true` | `modified` | Content matches but state not approved — **needs review** |
| `false` | `modified` | Content changed AND not approved — **investigate immediately** |
| `false` | `approved` | Content changed AFTER approval — **agent drift or tampering** |
| `null` | `unknown` | No integrity block: the two shared verdicts, `hash-verified` and `hash-approved`, fail |

**Key insight:** `hash_verified=false` with `hash_state=approved` is the most critical signal. It means content was modified AFTER approval — exactly the kind of silent drift that AI agents can introduce.

### What a run says: verdicts and the outcome

A check gives one verdict. There is no verdict that means "skipped" (D-14, F-7; FB-265):

| Verdict | Means | Effect on the run |
|---|---|---|
| `PASS` | the check ran and what it looked at is as the spec says | none |
| `FAIL` | the check ran and found a violation | the run fails |
| `ERROR` | the check, or the runner, broke while running; the cause is in the message | the run fails |
| `NOT_IMPLEMENTED` | the schema lets a spec declare a field that the runner has no check for | the run fails |
| `NOT_RUN` | the check did not run; the message says why and names the backlog item | the run cannot pass |
| `WAIVED` | the spec waives the requirement until a named backlog item (FMTS) | the run cannot pass |

A run has one of three outcomes, and `outcome_of` in `shared/runner.py` is the one place the rule is written:

| Outcome | When | `forge governance run` exits |
|---|---|---|
| `PASS` | there is at least one verdict and every verdict is `PASS` | 0 |
| `FAIL` | a verdict is `FAIL`, `ERROR` or `NOT_IMPLEMENTED`, or there is no verdict at all | 1 |
| `INCOMPLETE` | nothing failed, and a verdict is `NOT_RUN` or `WAIVED` | 3 |

`INCOMPLETE` is not a softer pass. It says that nothing in the run showed a fault and that the run did not look at everything, so it does not show that the spec is met. The summary line names every count that is not zero (`[INCOMPLETE] FMTS — forge-wms: 25/29 checks passed, 4 waived`), the report lists each check that did not run or is waived with its reason, and the JSON report carries `outcome`. A runner that raises gives one `ERROR` verdict, `<framework>:runner-error`, with the exception and where it was raised.

A run that was not asked for live checks says so with one `NOT_RUN` verdict (`fats:live`, `facts:live`, `ftts:live`): a static run has compared the spec with itself and with other files, never with the running thing (the audit of 2026-11-23, `AUDIT-2026-11-23.md`; BACKLOG FB-264).

The law, "a run never passes unless every check ran and passed", is checked for every case on the real code by `tests/governance/test_verdicts_exhaustive.py`; the skill `.claude/skills/verify-fxts-verdicts` says what it covers and how to read a failure.

### What a verdict rests on: kinds of evidence (D-19)

Every verdict names the kind of evidence it rests on (D-19, AE-1), in the field `evidence_kind` of the verdict and of the JSON report:

| Kind | The check looked at |
|---|---|
| `self` | the spec against itself or its own schema |
| `file` | another file: another spec, a manifest, a governed list, the schema registry, the backlog, the names of a module's files, a text search of its sources |
| `artifact` | the real thing: code imported or introspected, the app built in process, the proto, the module run through the conformance kit |
| `none` | nothing of the spec: the check did not run, is waived, or looks at the runner itself |

Each framework declares, as data, every check its runner gives (`forge_core/fxts/<fw>/checks.py`; the shared checks in `fxts/shared/runner.py`): the check's id, or a form with `{name}` placeholders for an id built at run time; the spec properties it looks at, as JSON pointers; and the kind it reaches when it runs (AE-2). The runner base gives each verdict the kind of its declaration, `none` when it did not run or is waived; a verdict whose id is declared nowhere becomes an `ERROR` that names the id, so no check is added without saying what it rests on. That law is checked for every id written in the runners and every verdict on every governed spec by `tests/governance/test_declared_checks.py` (skill `.claude/skills/verify-fxts-evidence`).

`forge governance evidence [framework]` shows each framework's declared checks, their kinds and whether they observed anything on the governed specs, and for each top-level property of the schema the strongest evidence a check could give it and the strongest it got today. In the API framework, for example, `endpoint` has a declared check of the real route, but in the gate it is observed only against the spec itself, because that check runs only with `--live`. Step 2 of D-19 turns every claim with no check of the real thing into a gate finding, let through only as an accepted gap naming the work that adds the check.

### The gate: what gets through, and who decides

`forge governance check` runs every framework over every governed spec, then checks the schema registries, the governed lists and the generated indexes. CI runs it on every push, as its own step after the test suite, and `tests/governance/test_gate.py` runs the same function so `pytest` alone gives a developer the gate's answer (FB-266).

A check of a spec that failed or did not run is a *finding*. A finding gets through only when an **accepted gap** covers it: an entry in `forge-core/fxts/accepted-gaps.json` that names the framework, the spec (or `*`, every spec of the framework, for a check that did not run only), the check, the status (`FAIL` or `NOT_RUN`), an open backlog item and the reason, and that the owner approved as it is now.

| What | The gate |
|---|---|
| A finding covered by an approved entry whose backlog item is open | let through, and counted under the entry |
| A finding nothing covers, or covered only by an entry not approved as it is now | refused |
| An entry that covers nothing that was found | refused: the gap is closed, the entry is removed |
| An entry whose backlog item is closed or is in neither backlog file | refused |
| A check that broke (`ERROR`), a field with no check (`NOT_IMPLEMENTED`), a run with no verdict | refused, whatever the file says |
| A failure accepted for every spec at once, two entries that cover the same findings, a file that does not read | cannot be written: the file is refused, and then it accepts nothing |
| A stale generated index, a schema registry problem, a governed list that is not usable | refused, whatever the file says |
| A file in a governed folder that is not a kind it may hold, or a spec or governed list outside the governed folders | refused, whatever the file says (the closed set, below) |
| Two specs of one framework with one identity, or a spec not named by its framework's rule | refused, whatever the file says |

An entry's approval is the hash of everything else in the entry, with who approved it and when (`forge governance gap-approve <id> --by reh3376`, on the owner's word). Changing any field afterwards ends the approval. So the file grows, or an entry changes, only on the owner's word, and it shrinks without anyone's: an entry whose gap is closed has to go. A waived requirement of a module is not a finding: the waiver is in the module's spec, which the owner approved. `forge governance gaps` lists the entries and whether each is approved.

The rule is written once, in `judge` (`forge_core/fxts/shared/gaps.py`), and checked for every case on the real code by `forge-core/tests/fxts/test_gaps_exhaustive.py` (skill `.claude/skills/verify-fxts-gate`). The framework tests that once kept their own tables of allowed failures read the file instead (`forge_hub.cli.governance.accepted_checks`).

**The closed set (FB-268).** Every file in a governed folder (an `fxts` folder of the hub or a module, `forge-core/fxts`, `forge-core/contract`) is exactly one kind: a spec of that folder's framework, an object schema, a generated index, the accepted gaps, a schema, a released schema version, a schema registry, a governed list, a proto file or its configuration, or a placeholder. The kinds are data, one rule per place (`RULES` in `forge_core/fxts/locations.py`), and `kind_of(path)` gives every path exactly one kind; that is proved for every folder, suffix and depth a rule names by `forge-core/tests/fxts/test_kinds.py` (skill `.claude/skills/verify-fxts-kinds`). A file no rule names is refused, and so is a spec or a governed list anywhere else, found by its name or by the spec's hash it carries. Samples for tests live under `tests/**/fixtures/` and are left alone (the owner, 2026-11-24). The file list is git's (`git ls-files --cached --others --exclude-standard`), so an ignored file such as `.DS_Store` is not seen, a new file not yet added is, and a checkout without git fails the gate with that cause.

**One identity per spec.** A spec is found by its identity in its framework: an API spec by its method and path (`GET /v1/schemas`), the others by their id. Two specs with one identity are refused, and `forge governance run` given an id that more than one spec has names them all and runs none. Where a framework names its files by rule (`<adapter_id>.facts.json`, `<module_id>.fmts.json`, `<transport_id>.ftts.json`, `<id>.<kind>.futs.json`, `<owner_module>.fvts.json`), a file named otherwise is refused. An object schema's `$id` agrees with its file name and owner, and some view spec of its owner uses it.

What the gate does not do yet: it does not prove that a check can fail (FB-278), the hash framework is not part of it (FB-279), the approval is a name in a field and not a signature (FB-267), and the command line has no permission check point for an approval (FB-280).

### AI Agent Governance

FHTS specifically targets errors made by AI coding agents:

- **Hallucinations:** Agent generates spec content that doesn't match any approved state → caught by `fhts:hash-verified`
- **Context loss:** Agent forgets previous decisions → caught by `fhts:history-healthy` (rapid churn)
- **Unauthorized changes:** Modifications without approval → caught by `fhts:no-agent-pending`
- **Non-compliant changes:** Structural violations → caught by `fhts:hash-approved`

Every change records `source` (agent/manual/ci), `changed_by` (agent ID), and `reason` — creating a full audit trail.

### CLI Commands

```bash
# Hash state of every spec: state, hash, does it still verify, who approved it
forge governance specs                 # --pending: only the ones awaiting approval

# Re-hash a spec after editing it: history entry, pending_review, approver fields dropped
forge governance stamp forge-modules/forge-wms/fxts/facts/forge-wms.facts.json \
    --by claude-code --reason "FB-nnn: what changed" --source agent --change-type content

# The owner approves the stored hash (refused when the content no longer matches it)
forge governance approve forge-modules/forge-wms/fxts/facts/forge-wms.facts.json --by reh3376

# Validate a spec against the schema version it declares, or a named one
forge governance validate-spec forge-hub/fxts/fvts/forge-hub.fvts.json
forge governance validate-spec forge-hub/fxts/fvts/forge-hub.fvts.json --schema-version 0.1.0

# Schema versions: list them, compare two, release an edited schema, move a spec forward
forge governance schemas
forge governance schema-diff fmts 0.1.0 0.2.0
forge governance schema-release fmts --summary "FB-nnn: what changed"
forge governance migrate-spec <spec> --to 0.3.0 --by <who>

# The owner approves a schema version's hash
forge governance schema-approve fmts 0.3.0 --by reh3376

# Run one framework's checks on one spec: a spec file, or its id looked up in the
# framework's spec directory (endpoint path, adapter_id, view_id, transport_id, module_id)
forge governance run facts forge-wms
forge governance run fvts forge-hub-views --format json --output reports/fvts-forge-hub.json
forge governance run ftts grpc-hardened-transport
forge governance run fmts path/to/module.fmts.json # the module requirements; what did not run or is waived is listed
forge governance run fats /v1/health --live        # live checks: FATS, FACTS, FTTS
forge governance run fats "POST /v1/schemas"       # an API spec is a method and a path; a path two specs share is refused

# What each framework's checks rest on: the spec itself, another file, or the real thing
forge governance evidence fats

# The gate: every framework over every governed spec; exit 1 unless nothing is refused
forge governance check
forge governance gaps                              # the accepted gaps, and whether each is approved
forge governance gap-approve fats-live --by reh3376 # the owner, on their own word
```

Every runner verifies the hash of the spec it runs; `stamp` and `approve` rewrite only the
`integrity` block of a spec file, so the review diff is the change to the hash record.

### Aggregate Integrity Reporting

Every runner report includes an `integrity` block summarizing hash status:

```json
{
  "integrity": {
    "total_hashed": 5,
    "verified": 4,
    "mismatched": 1,
    "no_hash": 0,
    "approved": 3,
    "modified_unapproved": 1,
    "reverted": 0,
    "agent_changes_pending": 1,
    "warnings": ["AGENT CHANGES PENDING REVIEW: 1 change(s) from AI agents have not been approved."]
  }
}
```

## Four-Layer Architecture

Every FxTS framework follows the same structure:

| Layer | Purpose | Artifact |
|-------|---------|----------|
| **Schema** | Defines the structure all specs must conform to | `{framework}.schema.json` |
| **Specs** | Declare specific behavioral contracts | `*.{framework}.json` |
| **Runner** | Enforces specs against live or mocked systems | `{framework}_runner.py` |
| **CI Gate** | Blocks non-conformant changes from merging | GitHub Actions workflow |

## Framework Inventory

| Framework | Full Name | Scope | CI Gate | Status |
|-----------|-----------|-------|---------|--------|
| [FATS](FATS.md) | Forge API Test Specification | API contract verification | Hard-fail | Schema + Runner implemented; 28 specs, hashed and approved 2026-11-18; thin, to be built out (FB-162) |
| [FACTS](FACTS.md) | Forge Adapter Conformance Test Specification | Adapter lifecycle and data contracts | Hard-fail | Schema + runner (`facts:schema-valid` + 35 rule checks, enums read from the schema) + 9 specs; 8 validate, the OT spec waits on FB-079 |
| [FDTS](FDTS.md) | Forge Data Test Specification | Schema evolution and compatibility | Hard-fail | Planned |
| [FQTS](FQTS.md) | Forge Quality Test Specification | Data quality rules | Hard-fail | Planned |
| [FLTS](FLTS.md) | Forge Lineage Test Specification | Lineage chain integrity | Soft-fail | Planned |
| [FNTS](FNTS.md) | Forge Normalization Test Specification | Unit and definition consistency | Soft-fail | Planned |
| [FSTS](FSTS.md) | Forge Security Test Specification | Security controls and PII handling | Hard-fail | Planned |
| [FOTS](FOTS.md) | Forge Observability Test Specification | Pipeline health and SLOs | Soft-fail | Planned |
| [FPTS](FPTS.md) | Forge Performance Test Specification | Throughput and latency benchmarks | Soft-fail | Planned |
| [FHTS](FHTS.md) | Forge Hash Test Specification | Cross-cutting hash integrity and AI agent governance | Hard-fail | Implemented |
| [FVTS](FVTS.md) | Forge View Test Specification | Module ↔ forge-display contract: points, objects (collections with a schema), alarms, actions, surfaces, render profiles | Hard-fail | Schema 0.2.0 + runner + reference renderer; 1 spec: the hub's own (approved). The framework's tests use a sample fermenter contract kept as a test fixture, which is no module's spec (FB-078) |
| [FUTS](FUTS.md) | Forge UI Test Specification | What a screen is made of: widget specs and view documents (laid-out screens) | Hard-fail | Schema 0.2.0 + runner; 16 specs (twelve widgets, the hub's four standard screens); a reference view document is a test fixture; nothing renders them yet (FB-181) |
| [FMTS](FMTS.md) | Forge Module Test Specification | The requirements every module meets: the baseline, the time contract, references to its other specs, waivers (`docs/decisions/forge-module-requirements.md`, D-12) | Hard-fail | Schema + Runner + conformance kit implemented; 9 specs, 8 approved (the interim MES bridge is pending, FB-155) |
| [FTTS](FTTS.md) | Forge Transport Test Specification | The transport between a hub and every module: wire format, RPCs, errors | Hard-fail | Schema + Runner implemented; 1 spec, hashed and approved 2026-11-18; the signed transport contract is not built (D-15, FB-164) |

## Shared Infrastructure

All frameworks inherit from a shared base:

- **`FxTSRunner`** (`governance/shared/runner.py`) — Abstract base class handling schema loading, parity checking, and report assembly
- **`FxTSVerdict`** — Structured check result with status, evidence, and violations
- **`FxTSReport`** — Aggregate report with pass/fail counts, timing, and serialization
- **`check_schema_runner_parity()`** — Utility that detects unimplemented schema fields

## Directory Layout

```
forge-core/src/python/forge_core/fxts/
├── shared/
│   ├── __init__.py
│   └── runner.py              # FxTSRunner base, verdict/report models, parity checker
├── fats/
│   ├── schema/fats.schema.json
│   ├── specs/                 # Individual endpoint specs
│   └── runners/fats_runner.py
├── facts/
│   ├── schema/facts.schema.json
│   ├── specs/                 # Adapter conformance specs (forge-wms, forge-mes, etc.)
│   └── runners/facts_runner.py
├── fhts/
│   ├── schema/                    # (FHTS uses registry, not traditional schema)
│   ├── specs/fhts-registry.json   # Cross-cutting hash registry
│   └── runners/fhts_runner.py
└── (FMTS, FVTS and FTTS have the same structure; a planned framework has no directory)
```

## What every framework provides

Signed by the owner on 2026-11-18: [`docs/decisions/fxts-framework-baseline.md`](../../../docs/decisions/fxts-framework-baseline.md) (D-14), ten requirements, F-1 to F-10. A framework is either **planned** (a documentation page that says so; no code, no specs) or it meets the whole baseline. In force today:

- **Every spec carries a hash** (F-4). The 28 FATS specs and the FTTS spec were stamped on 2026-11-18, and the owner approved them the same day. One spec awaits approval: `forge-mes.fmts.json` (FB-155).
- **Every run gives two verdicts for it**, in every framework, from the shared runner: `<framework>:hash-verified` fails when the spec's content does not match its recorded hash, `<framework>:hash-approved` when the owner has not approved it. A spec with no hash fails both.
- **Every spec lives in its framework's `specs/` directory** and is listed by `forge governance specs` (F-5). There is no other place for a spec.

- **Every schema is versioned and hashed** (F-2), and **every spec records the schema version and hash it was approved against** (F-10), since 2026-11-19 (FB-151). A released version is never edited; a change is a new version whose hash the owner approves; every run gives a third verdict, `<framework>:schema-current`. The rules, the layout and the commands are in [FHTS, "Schema Versions"](FHTS.md#schema-versions).

`tests/governance/test_framework_baseline.py` walks every framework against the ten on every run. It allows no gap: the list of known gaps is empty since FB-151.

## Writing a New Spec

1. Choose the appropriate framework (FATS for APIs, FACTS for adapters, FMTS for a module's requirements, FQTS for quality, etc.). Every highly repeatable process has a spec (A-13, owner 2026-11-17); if no framework fits, that is a finding for `BACKLOG.md`
2. Read the framework's documentation (linked above) and JSON Schema
3. Create a new spec file in the framework's `specs/` directory
4. Validate against the schema: `forge governance validate-spec <path>`
5. Run the conformance check: `forge governance run <framework> <path or id>` (exit 1 on any failed check)
6. Add to CI: include in the framework's test suite
7. Stamp it (`forge governance stamp <path> --by <you> --reason <why>`); the owner approves it with `forge governance approve <path> --by <owner>`

## Designing a spec, a schema or a framework: the checklist

The steps above are how a spec is filed. These four are how one is designed (the owner, 2026-11-22). They apply to a new spec, a change to a schema, and a new framework. They are held in order.

1. **Shape first.** Decide the data before any rule or runner: the entities, their fields, and how each will be read and by whom. Trace every way the spec is used (the runner, the CLI listing, the generated index, the module that carries it). Ask what another actor may change at the same time; where the answer is not "nothing", give each actor its own part.
   - *Think it through from sender to receiver* (the owner, 2026-11-23). A schema describes something that is sent, carried and received, so ask of each in turn:
     - **The sender.** What is its purpose? Who or what produces it, and what do they need to convey?
     - **The transmission.** How does it travel, and what must still be true when it arrives late, twice, or after the format has moved on?
     - **The receiver.** Who or what receives it, and how will they use it? From the document alone, can the receiver tell what to do with it and where it belongs? Which version of the format is it? Has the receiver seen a document of this construction before, and what does it do if it has not?
   - A question the document cannot answer for its receiver is a field the schema is missing.
2. **Make the wrong thing impossible to write.** Put the domain in the structure, so that an invalid spec does not validate: a closed list over a free string, one field over two that must agree, a state with its allowed moves over a set of flags. A rule the schema can state is in the schema; the runner holds only what a schema cannot say. Do not force it: a plain field stays plain when its meaning is clear and local.
3. **Check once, at the edge.** A spec is validated where it enters: against the schema version it declares, by the framework's runner. A value from outside is coerced once to its declared type and refused when it is ambiguous, and the coerced value is what is acted on. Code behind that edge trusts what it was handed.
   - *The exception:* on the path of a write to a process controller, validation, the review gate, the interlocks and authorization are separate layers on purpose. None of them is a repeat of another, and none is removed as one.
4. **When a requirement changes, revise the shape.** Ask what the spec would be had the requirement been there from the start, and compare it with what exists. Do not add a field, a flag or a special case beside a shape that no longer fits.
   - *What follows is a proposal, not an edit:* a schema changes by release (`forge governance schema-release`), a signed record by the owner's amendment, the proto by addition within a major version. Name what the new shape contradicts, and the owner decides.

A new framework also meets the baseline of [What every framework provides](#what-every-framework-provides).

## Relationship to UxTS (MDEMG)

| UxTS Framework | FxTS Adaptation | Key Differences |
|----------------|-----------------|-----------------|
| UATS | FATS | Manufacturing context fields, batch/lot awareness |
| UPTS | FACTS | Extended for adapter lifecycle, context mapping, capability mixins |
| UDTS | FDTS | Schema Registry integration, compatibility modes |
| USTS | FSTS | Manufacturing-specific PII/compliance rules |
| UNTS | FNTS | Engineering unit conversion, ISA-88 alignment |
| UBTS | FPTS | Manufacturing throughput patterns (burst, sustained) |
| (new) | FQTS | No UxTS analog — new for manufacturing data quality |
| (new) | FLTS | No UxTS analog — new for lineage/provenance chains |
| (new) | FVTS | No UxTS analog — new for forge-display view contracts |
| (new) | FOTS | Adapted from UOBS — observability SLOs |
| UNTS | FHTS | Cross-cutting hash registry, AI agent governance, change history |
