# FACTS Developer Guide

**Forge Adapter Conformance Test Specification**

This guide explains how to write a FACTS spec for a new Forge adapter, how to validate it, and how to troubleshoot common failures.

---

## What FACTS Is and Why It Exists

Every Forge adapter — a connector between an external system (WMS, MES, ERP, historian) and the Forge hub — must declare what it does, how it connects, and what data it produces. FACTS is the governance framework that enforces these declarations.

Without FACTS, adapter behavior is implicit: you discover capabilities by reading code, connection requirements by trial-and-error, and data contracts by inspecting runtime output. FACTS makes all of this explicit, testable, and enforceable before an adapter runs in production.

FACTS follows the FxTS 4-layer pattern:

1. **Schema** (`facts.schema.json`) — defines the structure every FACTS spec must follow
2. **Specs** (`<adapter-id>.facts.json`) — one per adapter, declaring its full contract
3. **Runner** (`facts_runner.py`) — validates specs with one check per schema field
4. **CI Gate** — blocks deployment of non-conforming adapters

The runner enforces **schema-runner parity**: every field in the schema has a corresponding check in the runner. If a new field is added to the schema but not to the runner, the parity check fails hard — silent ignoring is prohibited.

---

## Schema Structure Walkthrough

A FACTS spec has 10 top-level sections (8 required, 2 optional):

### Required Sections

| Section | Purpose |
|---------|---------|
| `spec_version` | Schema version lock — currently `"0.1.0"` |
| `adapter_identity` | Who this adapter is: ID, name, version, type, tier, protocol |
| `capabilities` | What the adapter can do: read, write, subscribe, backfill, discover |
| `lifecycle` | Operational parameters: timeouts, restart policy, state machine |
| `connection` | How to connect: parameters (with types, secrets), auth methods |
| `data_contract` | What data the adapter produces: schema ref, output format, context fields, data sources, sample record |
| `context_mapping` | How raw source fields map to Forge context fields, plus enrichment rules |
| `error_handling` | Retry policy, circuit breaker, dead letter queue, health degradation thresholds |

### Optional Sections

| Section | Purpose |
|---------|---------|
| `metadata` | Free-form dict — spoke name, hub module, cross-spoke field lists, notes |
| `integrity` | FHTS hash governance — spec hash, approval state, change history |

---

## How to Write a FACTS Spec

### Step 1: Identify Your Adapter

Choose values for the identity block:

```json
{
  "adapter_identity": {
    "adapter_id": "my-system",
    "name": "My System Adapter",
    "version": "0.1.0",
    "type": "INGESTION",
    "tier": "MES_MOM",
    "protocol": "graphql+amqp"
  }
}
```

Rules:
- `adapter_id` must be kebab-case, 3–64 characters, matching `^[a-z][a-z0-9-]*$`
- `type` must be one of: `INGESTION`, `BIDIRECTIONAL`, `WRITE_ONLY`, `DISCOVERY_ONLY`
- `tier` must be one of: `OT`, `MES_MOM`, `ERP_BUSINESS`, `HISTORIAN`, `DOCUMENT`
- `version` must be semver (e.g., `1.0.0`, `0.2.1-beta`)
- `protocol` is free-form but should describe actual protocols (e.g., `graphql`, `rest+mqtt`)

### Step 2: Declare Capabilities

```json
{
  "capabilities": {
    "read": true,
    "write": false,
    "subscribe": true,
    "backfill": true,
    "discover": false
  }
}
```

`read` must always be `true` (enforced by schema). The runner performs **cross-field consistency checks** on capabilities:
- If `write: true` → you must have at least one data source with `collection_mode: "write"` or `source_type: "graphql_mutation"`
- If `subscribe: true` → you must have at least one data source with `collection_mode: "subscribe"`

### Step 3: Define Connection Parameters

List every parameter the adapter needs to connect to the source system:

```json
{
  "connection": {
    "params": [
      {
        "name": "graphql_url",
        "type": "url",
        "description": "GraphQL endpoint URL",
        "required": true,
        "secret": false
      },
      {
        "name": "api_key",
        "type": "string",
        "description": "API authentication key",
        "required": true,
        "secret": true
      }
    ],
    "auth_methods": ["api_key", "bearer_token"]
  }
}
```

Rules:
- Param `name` must be snake_case (`^[a-z][a-z0-9_]*$`)
- Param `type` must be one of: `string`, `integer`, `boolean`, `url`, `path`
- At least one auth method required from: `none`, `bearer_token`, `api_key`, `basic`, `oauth2`, `certificate`, `azure_entra_id`

### Step 4: Enumerate Data Sources

This is the most important section. Every data source the adapter can read from or write to must be declared:

```json
{
  "data_contract": {
    "schema_ref": "forge://schemas/my-system/v1",
    "output_format": "contextual_record",
    "context_fields": ["entity_id", "event_timestamp", "event_type"],
    "optional_context_fields": ["shift_id", "operator_id"],
    "data_sources": [
      {
        "source_type": "graphql_query",
        "endpoint": "/graphql",
        "description": "Fetch entities",
        "entities": ["Entity", "SubEntity"],
        "collection_mode": "poll"
      },
      {
        "source_type": "rabbitmq",
        "endpoint": "amqp://rabbitmq:5672",
        "description": "Real-time entity events",
        "entities": ["EntityEvent"],
        "collection_mode": "subscribe",
        "exchange": "forge.events",
        "routing_key": "entity.#"
      }
    ],
    "sample_record": {
      "adapter_id": "my-system",
      "source": "graphql",
      "timestamp": "2026-01-01T00:00:00Z",
      "context": {
        "entity_id": "ENT-001",
        "event_timestamp": "2026-01-01T00:00:00Z",
        "event_type": "entity_created"
      },
      "payload": { "name": "Example" }
    }
  }
}
```

Rules:
- `schema_ref` must start with `forge://`
- `output_format` must be `contextual_record` or `raw`
- `context_fields` must not be empty — these are the fields every record must contain
- `source_type` must be one of: `graphql_query`, `graphql_mutation`, `graphql_subscription`, `rest_get`, `rest_post`, `rabbitmq`, `mqtt`, `websocket`, `file`, `database`
- `collection_mode` must be one of: `poll`, `subscribe`, `backfill`, `write`
- Every data source must have at least one entity
- The `sample_record.context` must include all fields listed in `context_fields`

### Step 5: Map Context Fields

Every required context field must have a mapping (from source data) or enrichment rule (computed):

```json
{
  "context_mapping": {
    "mappings": [
      {
        "source_field": "id",
        "context_field": "entity_id",
        "transform": "direct"
      },
      {
        "source_field": "createdAt",
        "context_field": "event_timestamp",
        "transform": "iso8601"
      }
    ],
    "enrichment_rules": [
      {
        "target_field": "shift_id",
        "rule_type": "timestamp_to_shift",
        "config": {
          "timezone": "America/New_York",
          "shifts": {
            "day": { "start": "06:00", "end": "18:00" },
            "night": { "start": "18:00", "end": "06:00" }
          }
        }
      }
    ]
  }
}
```

Rules:
- Every field in `context_fields` must be covered by a mapping or enrichment rule
- Mappings should not target fields that aren't in `context_fields` or `optional_context_fields` (orphan check)
- Enrichment `rule_type` must be one of: `timestamp_to_shift`, `location_to_area`, `lookup`, `computed`, `static`

### Step 6: Configure Error Handling

```json
{
  "error_handling": {
    "retry_policy": {
      "max_retries": 3,
      "initial_delay_ms": 1000,
      "backoff_strategy": "exponential",
      "max_delay_ms": 30000
    },
    "circuit_breaker": {
      "failure_threshold": 5,
      "half_open_after_ms": 30000,
      "success_threshold": 2
    },
    "dead_letter": {
      "enabled": true,
      "topic": "forge.dead_letter.my-system",
      "max_age_hours": 72
    },
    "health_degradation": {
      "degraded_after_failures": 3,
      "failed_after_failures": 10
    }
  }
}
```

Rules:
- `max_retries`: 0–20
- `initial_delay_ms`: ≥ 100
- `backoff_strategy`: `constant`, `linear`, or `exponential`
- `failure_threshold`: ≥ 1
- `half_open_after_ms`: ≥ 1000

### Step 7: Add Integrity Hash

After assembling the complete spec, compute its integrity hash:

```python
import json, hashlib

with open("my-system.facts.json") as f:
    spec = json.load(f)

# Hash everything EXCEPT the integrity block
spec_for_hash = {k: v for k, v in spec.items() if k != "integrity"}
canonical = json.dumps(spec_for_hash, sort_keys=True, separators=(",", ":"))
spec_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

print(f"spec_hash: {spec_hash}")
```

Set the integrity block:

```json
{
  "integrity": {
    "hash_method": "sha256-c14n-v1",
    "spec_hash": "<computed-hash>",
    "hash_state": "approved",
    "previous_hash": null,
    "approved_by": "your-name",
    "approved_at": "2026-01-01T00:00:00Z",
    "change_history": [
      {
        "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
        "new_hash": "<computed-hash>",
        "changed_at": "2026-01-01T00:00:00Z",
        "source": "manual",
        "changed_by": "your-name",
        "change_type": "structural",
        "reason": "Initial spec creation"
      }
    ]
  }
}
```

The hash is computed over the canonical JSON (sorted keys, compact separators, `ensure_ascii=True`) of the spec *excluding* the entire `integrity` block. This avoids circular dependencies since the integrity block references its own hash.

---

## Running the FACTS Runner

### Programmatic (Python)

```python
import asyncio, json
from forge.governance.facts.runners.facts_runner import FACTSRunner

runner = FACTSRunner(
    schema_path="src/forge/governance/facts/schema/facts.schema.json"
)

with open("src/forge/governance/facts/specs/my-system.facts.json") as f:
    spec = json.load(f)

report = asyncio.run(runner.run(target="my-system", spec=spec))

print(f"Passed: {report.passed}")
print(f"Checks: {report.pass_count}/{report.total}")
print(f"Hash verified: {report.hash_verified}")

if not report.passed:
    for v in report.verdicts:
        if v.status.value == "FAIL":
            print(f"  FAIL: {v.check_id} — {v.message}")
```

### Tests (pytest)

```bash
# All FACTS tests
pytest tests/governance/facts/ -v

# Just runner tests
pytest tests/governance/facts/test_facts_runner.py -v

# Just spec tests for a specific adapter
pytest tests/governance/facts/test_whk_wms_spec.py -v
```

---

## Common Failures and How to Fix Them

### `facts:capabilities-read` — FAIL
**Cause:** `capabilities.read` is not `true`. Every adapter must be able to read.
**Fix:** Set `"read": true` in the capabilities block.

### `facts:cross-write-sources` — FAIL
**Cause:** `capabilities.write` is `true` but no data source has `collection_mode: "write"` or `source_type: "graphql_mutation"`.
**Fix:** Either add a write-capable data source or set `write: false`.

### `facts:cross-subscribe-sources` — FAIL
**Cause:** `capabilities.subscribe` is `true` but no data source has `collection_mode: "subscribe"`.
**Fix:** Add a subscribe data source (e.g., RabbitMQ, MQTT, WebSocket) or set `subscribe: false`.

### `facts:context-mapping-coverage` — FAIL
**Cause:** A field in `context_fields` has no mapping and no enrichment rule.
**Fix:** Add a mapping in `context_mapping.mappings` or an enrichment rule in `enrichment_rules` that targets the missing field.

### `facts:context-mapping-no-orphans` — FAIL
**Cause:** A mapping targets a `context_field` that isn't declared in `context_fields` or `optional_context_fields`.
**Fix:** Either add the field to `context_fields`/`optional_context_fields` or remove the orphan mapping.

### `facts:data-contract-sample-coverage` — FAIL
**Cause:** The `sample_record.context` doesn't include all required `context_fields`.
**Fix:** Add the missing fields to `sample_record.context`.

### `facts:integrity-hash-state` — FAIL
**Cause:** `hash_state` is `modified` or `pending_review` — the spec was changed without re-approval.
**Fix:** Recompute the hash (Step 7 above) and set `hash_state: "approved"`.

### `parity:*` — NOT_IMPLEMENTED
**Cause:** The schema has a field that the runner doesn't check. This is a runner bug, not a spec bug.
**Fix:** Report this as a bug — schema-runner parity is mandatory.

---

## Cross-Spoke Consistency

When multiple adapters share context (e.g., WMS and MES both produce `lot_id`, `shift_id`), their FACTS specs should use identical field names and compatible definitions. The `metadata.cross_spoke_fields` list documents shared fields.

Current shared fields between `whk-wms` and `whk-mes`:
- `lot_id`, `shift_id`, `operator_id`, `event_timestamp`, `event_type`, `work_order_id`

Shift definitions must match: same timezone, same day/night boundaries.

---

## Reference: Existing Specs

| Adapter | File | Data Sources | Capabilities | Tests |
|---------|------|-------------|--------------|-------|
| `whk-wms` | `specs/whk-wms.facts.json` | 14 (9 GraphQL, 1 subscription, 3 RabbitMQ, 1 REST) | read, subscribe, backfill, discover | 48 |
| `whk-mes` | `specs/whk-mes.facts.json` | 17 (10 GraphQL, 1 mutation, 1 RabbitMQ, 2 MQTT, 1 WS, 2 REST) | read, write, subscribe, backfill, discover | 64 |

These serve as reference implementations. When writing a new spec, start from the one closest to your adapter's architecture and modify it.
