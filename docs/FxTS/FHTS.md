# FHTS — Forge Hash Test Specification

**Framework ID:** FHTS
**Full Name:** Forge Hash Test Specification
**CI Gate:** Hard-fail (merge-blocking)
**Status:** Implemented (registry + runner)
**Phase:** F10 (shared infrastructure)
**MDEMG Analog:** UNTS (Universal Hash Test Specification)

---

## Purpose

FHTS is the cross-cutting hash verification framework for the entire FxTS governance system. Every other framework (FATS, FACTS, FQTS, etc.) produces specs — FHTS ensures those specs haven't been silently modified, tracks their change history, and provides a single registry for monitoring hash integrity across the platform.

Without FHTS, spec modifications are invisible. An AI coding agent could change a timeout value, relax an error handling requirement, or remove a required context field — and no framework would notice unless the specific assertion happened to catch it. FHTS catches the modification itself, regardless of what changed.

### AI Agent Governance

FHTS is specifically designed to govern AI coding agents working in the Forge codebase. It catches:

- **Hallucinations** — agent generates spec content that doesn't match any approved state
- **Context loss** — agent forgets previous decisions and rewrites specs inconsistently
- **Unauthorized changes** — modifications without approval from an authorized actor
- **Structural non-compliance** — changes that violate spec structure conventions
- **Thrashing** — rapid repeated changes indicating the agent is cycling without progress

## Architecture

FHTS operates at two layers:

### Layer 1: Self-Contained Spec Hash (Portable)

Every FxTS spec carries its own integrity block inside the spec JSON:

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

This makes each spec a portable, self-describing artifact. The hash is computed over the canonical JSON representation of the spec excluding the `integrity.spec_hash` field itself.

### Layer 2: Cross-Cutting Registry (Centralized)

The FHTS registry (`fhts/specs/fhts-registry.json`) maintains a central record across all frameworks:

```json
{
  "version": "1.0.0",
  "updated_at": "2026-04-06T12:00:00Z",
  "description": "FHTS Hash Verification Registry",
  "files": [
    {
      "path": "facts/specs/whk-wms.facts.json",
      "framework": "facts",
      "current_hash": "3a161edf...",
      "status": "verified",
      "updated_at": "2026-04-06T12:00:00Z",
      "history": [
        { "hash": "b7f42a01...", "updated_at": "...", "source": "agent", "changed_by": "claude-opus-4-6" }
      ],
      "source_ref": "whk-wms.facts.json",
      "approved_by": "reh3376",
      "approved_at": "2026-04-06T12:00:00Z"
    }
  ]
}
```

## What FHTS Governs

| Aspect | What the registry tracks | What the runner checks |
|--------|--------------------------|------------------------|
| **Hash Presence** | Whether spec has integrity block | `fhts:hash-present` |
| **Hash Verification** | Current hash vs on-disk content | `fhts:hash-verified` |
| **Approval Status** | Hash state + who approved | `fhts:hash-approved` |
| **Registry Tracking** | Spec registered in central registry | `fhts:registry-tracked` |
| **Registry Sync** | Registry hash matches spec hash | `fhts:registry-match` |
| **Agent Governance** | Unapproved agent-sourced changes | `fhts:no-agent-pending` |
| **Churn Detection** | History at capacity (thrashing) | `fhts:history-healthy` |

## Integrity Block Schema

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `hash_method` | string | `"sha256-c14n-v1"` (normative) or `"sha256-jcs"` (legacy alias) |
| `spec_hash` | string | SHA-256 hex digest of canonical JSON (excluding this field) |
| `hash_state` | enum | `approved` · `modified` · `pending_review` · `reverted` · `unknown` |
| `previous_hash` | string \| null | Hash before most recent change (single-step drift detection) |
| `approved_by` | string | Identifier of actor who approved current state |
| `approved_at` | string | ISO8601 timestamp of approval |
| `change_history` | array | Last 3 change entries (newest first) |

### Change History Entry

| Field | Type | Description |
|-------|------|-------------|
| `previous_hash` | string | Hash before this change |
| `new_hash` | string | Hash after this change |
| `changed_at` | string | ISO8601 timestamp |
| `source` | string | `manual` · `ci` · `agent` · `revert` · `spec_update` |
| `changed_by` | string | Actor identifier (agent ID, username, CI job) |
| `change_type` | string | `structural` · `content` · `config` · `revert` |
| `reason` | string | Human-readable reason for the change |

### Hash States

| State | Meaning | Transition |
|-------|---------|------------|
| `approved` | Current hash has been reviewed and approved | Set by `approve_spec_hash()` |
| `modified` | Spec was changed since last approval | Auto-set on any hash change |
| `pending_review` | Flagged for review (e.g. by CI) | Set by governance workflow |
| `reverted` | Hash was rolled back to a previous value | Set by `revert_spec_hash()` |
| `unknown` | Initial state or status uncertain | Default for new specs |

### Report Semantics (Extended)

| `hash_verified` | `hash_state` | Meaning |
|-----------------|--------------|---------|
| `true` | `approved` | Spec unmodified, approved — **ideal state** |
| `true` | `modified` | Content matches but state not approved — **needs review** |
| `false` | `modified` | Content changed AND not approved — **investigate immediately** |
| `false` | `approved` | Content changed AFTER approval — **agent drift or tampering** |
| `true` | `reverted` | Reverted content matches — **verify revert was intentional** |
| `null` | `unknown` | No integrity block — **add hash protection** |

## Runner

**Location:** `src/forge/governance/fhts/runners/fhts_runner.py`
**Class:** `FHTSRunner(FxTSRunner)`

### Check Catalog

| Check ID | Category | What it validates | Gate |
|----------|----------|-------------------|------|
| `fhts:hash-present` | Presence | Spec has integrity block with hash | Hard |
| `fhts:hash-verified` | Verification | Current content matches stored hash | Hard |
| `fhts:hash-approved` | Governance | Hash state approved by authorized actor | Hard |
| `fhts:registry-tracked` | Registry | Spec registered in FHTS registry | Soft |
| `fhts:registry-match` | Registry | Registry hash matches spec's self-contained hash | Hard |
| `fhts:no-agent-pending` | Agent Gov | No unapproved agent-sourced changes | Hard |
| `fhts:history-healthy` | Health | Change history not at capacity (no thrashing) | Soft |

### Usage

```bash
# Add hashes to all specs in a framework
forge governance run fhts --add-hashes --framework facts --spec-dir specs/

# Verify hashes without running assertions
forge governance run fhts --verify-hashes --framework facts --spec-dir specs/

# Full registry verification
forge governance run fhts --verify-all

# Scan and register specs from all frameworks
forge governance run fhts --scan --framework facts

# JSON report output
forge governance run fhts --verify-all --format json --output reports/fhts.json
```

## Registry

**Location:** `src/forge/governance/fhts/registry.py`
**Class:** `FHTSRegistry`
**Persistence:** `governance/fhts/specs/fhts-registry.json`

### Operations

| Operation | Description | MDEMG UNTS Analog |
|-----------|-------------|-------------------|
| `register()` | Add or update tracked file | `RegisterTrackedFile` |
| `update_hash()` | Set new expected hash with audit trail | `UpdateHash` |
| `revert_hash()` | Roll back to previous hash from history | `RevertToPreviousHash` |
| `approve()` | Mark current hash as approved | (new for Forge) |
| `verify()` | Recompute on-disk hash and compare | `VerifyNow` |
| `verify_all()` | Verify all tracked files | `VerifyNow` (all) |
| `scan_framework_specs()` | Discover and register specs from a directory | `ScanAndSync` |
| `get_history()` | Return hash change history | `GetHashHistory` |

## Relationship to Other Frameworks

| Framework | Relationship to FHTS |
|-----------|---------------------|
| **FATS** | FHTS tracks hash integrity of all FATS endpoint specs |
| **FACTS** | FHTS tracks hash integrity of all FACTS adapter specs |
| **FQTS** | FHTS tracks hash integrity of all FQTS quality specs |
| **FSTS** | FHTS tracks hash integrity of all FSTS security specs |
| **All others** | Every FxTS spec can be registered in the FHTS registry |

## Design Decisions

1. **Why a separate framework (not embedded in each runner)?** Hash governance is a cross-cutting concern. Embedding it in each runner would mean 9 separate implementations of the same logic. FHTS centralizes it with a single registry and runner, while each framework runner only needs to call `verify_spec_hash()` for quick inline checks.

2. **Why both Layer 1 and Layer 2?** Layer 1 (self-contained hash in the spec) makes each spec portable — you can verify a spec without the registry. Layer 2 (central registry) adds history, cross-framework visibility, and enables operations like scan/verify-all. They're complementary.

3. **Why 3 history entries (not unlimited)?** Matches MDEMG UNTS `MaxHistoryEntries = 3`. This is enough to detect thrashing (3 changes = possible context loss) and enable one-step revert, without unbounded growth. The registry is a JSON file in git — it needs to stay small.

4. **Why track `source` and `changed_by`?** This is the core of AI agent governance. When an agent modifies a spec, the change is recorded with `source: "agent"` and `changed_by: "claude-opus-4-6"`. The `fhts:no-agent-pending` check then flags any agent changes that haven't been approved by a human. This closes the loop: agents can make changes, but humans must approve them.

5. **Why `hash_state` is separate from `hash_verified`?** They're orthogonal signals (inherited from UxTS/UNTS). `hash_verified` is a technical fact (does content match stored hash?). `hash_state` is a governance signal (has this hash been reviewed?). A spec can be `hash_verified=true` but `hash_state=modified` — meaning the content is consistent with the stored hash, but that hash was set by an agent and no human has approved it yet.

## Dependencies

- Shared FxTS runner infrastructure (`governance/shared/runner.py`)
- All other FxTS frameworks (FHTS scans their spec directories)
- No external dependencies beyond Pydantic

## Implementation Status

| Component | Status |
|-----------|--------|
| Spec-level integrity block (Layer 1) | ✅ Implemented in `shared/runner.py` |
| Hash history + state tracking | ✅ Implemented in `shared/runner.py` |
| FHTS Registry (Layer 2) | ✅ Implemented in `fhts/registry.py` |
| FHTS Runner | ✅ Implemented in `fhts/runners/fhts_runner.py` |
| CLI integration | ⬜ Planned (Sprint 1, task S1.6) |
| CI gate workflow | ⬜ Planned (Sprint 4) |
| Registry JSON persistence | ✅ Implemented |
| Framework scanner | ✅ Implemented (`scan_framework_specs()`) |
