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
# Add hashes to all specs in a framework
forge governance run fhts --add-hashes --framework facts --spec-dir specs/

# Verify hashes without running assertions
forge governance run fhts --verify-hashes --framework facts --spec-dir specs/

# Full registry verification
forge governance run fhts --verify-all

# Scan and register specs from all frameworks
forge governance run fhts --scan --framework facts

# Full run (includes hash verification automatically in any framework runner)
forge governance run facts --adapter whk-wms
```

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
| [FATS](FATS.md) | Forge API Test Specification | API contract verification | Hard-fail | Schema + Runner implemented |
| [FACTS](FACTS.md) | Forge Adapter Conformance Test Specification | Adapter lifecycle and data contracts | Hard-fail | Sprint planned |
| [FDTS](FDTS.md) | Forge Data Test Specification | Schema evolution and compatibility | Hard-fail | Planned |
| [FQTS](FQTS.md) | Forge Quality Test Specification | Data quality rules | Hard-fail | Stub |
| [FLTS](FLTS.md) | Forge Lineage Test Specification | Lineage chain integrity | Soft-fail | Planned |
| [FNTS](FNTS.md) | Forge Normalization Test Specification | Unit and definition consistency | Soft-fail | Planned |
| [FSTS](FSTS.md) | Forge Security Test Specification | Security controls and PII handling | Hard-fail | Stub |
| [FOTS](FOTS.md) | Forge Observability Test Specification | Pipeline health and SLOs | Soft-fail | Planned |
| [FPTS](FPTS.md) | Forge Performance Test Specification | Throughput and latency benchmarks | Soft-fail | Planned |
| [FHTS](FHTS.md) | Forge Hash Test Specification | Cross-cutting hash integrity and AI agent governance | Hard-fail | Implemented |

## Shared Infrastructure

All frameworks inherit from a shared base:

- **`FxTSRunner`** (`governance/shared/runner.py`) — Abstract base class handling schema loading, parity checking, and report assembly
- **`FxTSVerdict`** — Structured check result with status, evidence, and violations
- **`FxTSReport`** — Aggregate report with pass/fail counts, timing, and serialization
- **`check_schema_runner_parity()`** — Utility that detects unimplemented schema fields

## Directory Layout

```
src/forge/governance/
├── shared/
│   ├── __init__.py
│   └── runner.py              # FxTSRunner base, verdict/report models, parity checker
├── fats/
│   ├── schema/fats.schema.json
│   ├── specs/                 # Individual endpoint specs
│   └── runners/fats_runner.py
├── facts/
│   ├── schema/facts.schema.json
│   ├── specs/                 # Adapter conformance specs (whk-wms, whk-mes, etc.)
│   └── runners/facts_runner.py
├── fhts/
│   ├── schema/                    # (FHTS uses registry, not traditional schema)
│   ├── specs/fhts-registry.json   # Cross-cutting hash registry
│   └── runners/fhts_runner.py
├── fqts/ ... fsts/ ... (same structure per framework)
```

## Writing a New Spec

1. Choose the appropriate framework (FATS for APIs, FACTS for adapters, FQTS for quality, etc.)
2. Read the framework's documentation (linked above) and JSON Schema
3. Create a new spec file in the framework's `specs/` directory
4. Validate against the schema: `forge governance validate --framework <name> --spec <path>`
5. Run the conformance check: `forge governance run <framework> --spec <path>`
6. Add to CI: include in the framework's test suite

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
| (new) | FOTS | Adapted from UOBS — observability SLOs |
| UNTS | FHTS | Cross-cutting hash registry, AI agent governance, change history |
