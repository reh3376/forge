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
| `null` | `unknown` | No integrity block — hash verification skipped |

**Key insight:** `hash_verified=false` with `hash_state=approved` is the most critical signal. It means content was modified AFTER approval — exactly the kind of silent drift that AI agents can introduce.

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
forge governance stamp forge-core/src/python/forge_core/fxts/facts/specs/forge-wms.facts.json \
    --by claude-code --reason "FB-nnn: what changed" --source agent --change-type content

# The owner approves the stored hash (refused when the content no longer matches it)
forge governance approve forge-core/src/python/forge_core/fxts/facts/specs/forge-wms.facts.json --by reh3376

# Validate a spec against the schema version it declares, or a named one
forge governance validate-spec forge-core/src/python/forge_core/fxts/fvts/specs/forge-ot.fvts.json
forge governance validate-spec forge-core/src/python/forge_core/fxts/fvts/specs/forge-ot.fvts.json --schema-version 0.1.0

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
forge governance run fvts forge-ot-views --format json --output reports/fvts-forge-ot.json
forge governance run ftts grpc-hardened-transport
forge governance run fmts path/to/module.fmts.json # the module requirements; skipped checks are listed
forge governance run fats /v1/health --live        # live checks: FATS, FACTS, FTTS
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
| [FVTS](FVTS.md) | Forge View Test Specification | Module ↔ forge-display contract: points, objects (collections with a schema), alarms, actions, surfaces, render profiles | Hard-fail | Schema 0.2.0 + runner + reference renderer; 2 specs: the hub's own (approved) and the plant-floor reference (awaiting the owner, FB-078) |
| [FUTS](FUTS.md) | Forge UI Test Specification | What a screen is made of: widget specs and view documents (laid-out screens) | Hard-fail | Schema 0.2.0 + runner; 17 specs (twelve widgets, the hub's four standard screens, one reference view document); nothing renders them yet (FB-181) |
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

Signed by the owner on 2026-11-18: [`docs/decisions/fxts-framework-baseline.md`](../decisions/fxts-framework-baseline.md) (D-14), ten requirements, F-1 to F-10. A framework is either **planned** (a documentation page that says so; no code, no specs) or it meets the whole baseline. In force today:

- **Every spec carries a hash** (F-4). The 28 FATS specs and the FTTS spec were stamped on 2026-11-18, and the owner approved them the same day. Two specs await approval: `forge-mes.fmts.json` (FB-155) and `forge-ot.fvts.json` (FB-078).
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
