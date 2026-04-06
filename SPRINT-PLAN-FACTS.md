# Sprint Development Plan: FACTS Adapter Conformance Specs

**Plan Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Path:** Roadmap Path 1 — FACTS Adapter Specs (WMS + MES)
**Branch:** `forge_dev01`
**Status:** READY FOR EXECUTION

---

## 1. Problem Statement

Forge needs a formal, enforceable contract that defines what it means for an external system adapter to be "conformant." Without this, adapter development is ad hoc — each adapter would make its own assumptions about lifecycle, capabilities, data shape, error handling, and context mapping. The FACTS (Forge Adapter Conformance Test Specification) framework solves this by defining a JSON Schema for adapter specs, concrete spec files for each adapter (starting with whk-wms and whk-mes), and a runner that enforces every schema field.

**Core question this plan answers:** What must be true about an adapter for Forge to trust it?

---

## 2. Scope & Constraints

### In Scope
- `facts.schema.json` — the schema that all FACTS spec files must conform to
- `facts_runner.py` — the governance runner that enforces FACTS specs
- `whk-wms.facts.json` — FACTS spec for the WMS adapter
- `whk-mes.facts.json` — FACTS spec for the MES adapter
- CLI integration: `forge governance run facts --adapter <id>`
- Unit tests for schema, runner, and spec validation
- Documentation: FACTS developer guide

### Out of Scope
- Actual adapter implementation (that's Path 3)
- FQTS specs for data quality (separate framework)
- Live endpoint testing against production systems
- CI/CD pipeline integration (future sprint)

### Constraints
- **Spec-first:** Specs are written BEFORE any adapter code. The spec IS the source of truth.
- **Schema-runner parity:** Every field in `facts.schema.json` must have a corresponding check in `facts_runner.py`. Silent ignore is prohibited.
- **Python 3.12+, UV, Ruff:** All code follows project standards.
- **No production system changes:** whk-wms and whk-mes are read-only templates. Specs describe how Forge connects TO them, not changes to them.

---

## 3. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| `forge.governance.shared.runner` (FxTSRunner base) | ✅ Complete | Base class, verdict model, schema-runner parity checking, hash governance (FHTS Layer 1) |
| `forge.governance.fhts` (FHTS registry + runner) | ✅ Complete | Cross-cutting hash registry, AI agent governance, adapted from MDEMG UNTS |
| `forge.governance.fats` (FATS runner reference) | ✅ Complete | Reference implementation for building framework-specific runners |
| `forge.core.models.adapter` (AdapterManifest, etc.) | ✅ Complete | Pydantic models for adapter identity, capabilities, contracts |
| `forge.adapters.base.interface` (AdapterBase) | ✅ Complete | Abstract interface that adapters must implement |
| whk-wms repo (local clone) | ✅ Mounted | `/Users/reh3376/whk-wms` → API surface studied |
| whk-mes repo (local clone) | ✅ Mounted | `/Users/reh3376/whk-mes` → API surface studied |

---

## 4. Implementation Plan

### Sprint 1: FACTS Schema Design

**Effort:** Medium | **Duration:** ~4 hours
**Epic:** Define the JSON Schema that governs all FACTS spec files.

#### Rationale

The schema is the constitution. Every decision about what makes an adapter "conformant" is encoded here. The schema must cover seven domains: identity, capabilities, lifecycle, connection, data contract, context mapping, and error handling. Each domain maps to a section of the `AdapterManifest` and `AdapterBase` interface already defined in the scaffold.

#### Tasks

**S1.1: Analyze existing adapter models for schema derivation**

Study the existing Pydantic models (`AdapterManifest`, `AdapterCapabilities`, `ConnectionParam`, `DataContract`, `AdapterHealth`) and the abstract interface (`AdapterBase`, capability mixins) to determine exactly which fields the FACTS schema needs.

Source files:
- `src/forge/core/models/adapter.py` — manifest, capabilities, health, state
- `src/forge/adapters/base/interface.py` — lifecycle, collect, validate, mixins
- `src/forge/core/models/contextual_record.py` — what adapters produce

**S1.2: Design `facts.schema.json`**

Create the JSON Schema (draft 2020-12) with these top-level sections:

```
facts.schema.json
├── spec_version          # Schema version (semver)
├── adapter_identity      # adapter_id, name, version, type, tier, protocol
├── capabilities          # read, write, subscribe, backfill, discover (boolean declarations)
├── lifecycle             # configure, start, stop, health (behavioral requirements)
│   ├── startup_timeout_ms
│   ├── shutdown_timeout_ms
│   ├── health_check_interval_ms
│   └── restart_policy
├── connection            # connection_params (name, type, required, secret)
│   ├── params[]
│   └── auth_methods[]
├── data_contract         # what the adapter produces
│   ├── schema_ref        # pointer to the output schema
│   ├── output_format     # contextual_record | raw
│   ├── context_fields[]  # required context fields on every record
│   └── sample_record     # example ContextualRecord for validation
├── context_mapping       # how source fields map to Forge context
│   ├── mappings[]        # source_field → context_field pairs
│   └── enrichment_rules  # rules for deriving context (e.g., shift from timestamp)
├── error_handling        # how the adapter must behave on failure
│   ├── retry_policy
│   ├── circuit_breaker
│   └── dead_letter_behavior
└── metadata              # free-form adapter-specific metadata
```

**S1.3: Include integrity block in schema (FHTS — adapted from MDEMG UNTS)**

The `facts.schema.json` must include an expanded `integrity` section for hash governance. This is adapted from MDEMG's UNTS (Universal Hash Test Specification) and provides two layers: self-contained hash verification (Layer 1) and hash state/history tracking for AI agent governance (Layer 2).

```json
"integrity": {
  "type": "object",
  "properties": {
    "hash_method": {
      "type": "string",
      "enum": ["sha256-c14n-v1", "sha256-jcs"],
      "default": "sha256-c14n-v1"
    },
    "spec_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$",
      "description": "SHA-256 hex digest of spec content (excluding this field)"
    },
    "hash_state": {
      "type": "string",
      "enum": ["approved", "modified", "pending_review", "reverted", "unknown"],
      "default": "unknown",
      "description": "Governance state — tracks whether changes have been approved"
    },
    "previous_hash": {
      "type": ["string", "null"],
      "description": "Hash before most recent change (single-step drift detection)"
    },
    "approved_by": {
      "type": "string",
      "description": "Identifier of actor who approved current hash state"
    },
    "approved_at": {
      "type": "string",
      "format": "date-time",
      "description": "When the hash state was last approved"
    },
    "change_history": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "properties": {
          "previous_hash": { "type": "string" },
          "new_hash": { "type": "string" },
          "changed_at": { "type": "string", "format": "date-time" },
          "source": { "type": "string", "enum": ["manual", "ci", "agent", "revert", "spec_update"] },
          "changed_by": { "type": "string" },
          "change_type": { "type": "string", "enum": ["structural", "content", "config", "revert"] },
          "reason": { "type": "string" }
        },
        "required": ["previous_hash", "new_hash", "changed_at", "source"]
      },
      "description": "Last 3 hash changes for audit trail and AI agent governance"
    }
  },
  "required": ["hash_method", "spec_hash"]
}
```

The shared runner infrastructure (`governance/shared/runner.py`) implements:
- `compute_spec_hash()` — deterministic canonical JSON → SHA-256
- `verify_spec_hash()` — compare stored vs. computed hash (Layer 1)
- `verify_spec_integrity()` — full integrity analysis including state, history, and governance warnings (Layer 2)
- `add_spec_hash()` — stamp a spec with integrity hash, pushing old hash to history
- `approve_spec_hash()` — mark current hash as approved by an authorized actor
- `revert_spec_hash()` — roll back to a previous hash from history

The FHTS framework (`governance/fhts/`) provides the cross-cutting registry:
- `FHTSRegistry` — central registry tracking all specs across all frameworks
- `FHTSRunner` — 7-check validation (hash-present, hash-verified, hash-approved, registry-tracked, registry-match, no-agent-pending, history-healthy)

**S1.4: Write schema validation tests**

- Schema self-validates against JSON Schema meta-schema
- Minimal valid spec passes validation
- Missing required fields are caught
- Invalid enum values are caught
- Nested object validation works (connection params, context mappings)
- Integrity block validation (hash format, method enum, hash_state enum, change_history structure)
- FHTS governance: agent-sourced change triggers `hash_state: modified`
- FHTS governance: `approve_spec_hash()` transitions state to `approved`

**S1.5: Register FACTS schema in governance directory**

Place at `src/forge/governance/facts/schema/facts.schema.json` with proper `$id` and `$schema` references.

**S1.6: Write FxTS framework feature documentation**

Every FxTS framework created or substantially modified during this sprint must have a corresponding feature/functionality document in `docs/FxTS/`. Each framework gets its own standalone document covering purpose, what it governs, schema structure, runner behavior, usage examples, design decisions, and implementation status.

**Documentation directory:** `forge-platform/docs/FxTS/`

| Document | Framework | Content Level |
|----------|-----------|---------------|
| `README.md` | FxTS overview | Full — index of all 10 frameworks, shared infrastructure, principles |
| `FATS.md` | FATS | Full — already implemented, complete check catalog and usage |
| `FACTS.md` | FACTS | Full — primary deliverable of this sprint, schema walkthrough + spec examples |
| `FHTS.md` | FHTS | Full — hash governance, AI agent oversight, registry, UNTS lineage |
| `FDTS.md` | FDTS | Structured stub — purpose, planned schema, design decisions |
| `FQTS.md` | FQTS | Detailed stub — includes example spec (from ARCHITECTURE.md) |
| `FSTS.md` | FSTS | Structured stub — purpose, OWASP mapping, planned schema |
| `FLTS.md` | FLTS | Structured stub — lineage chain requirements, W3C PROV alignment |
| `FNTS.md` | FNTS | Structured stub — ISA-88 alignment, unit conversion governance |
| `FOTS.md` | FOTS | Structured stub — observability SLOs, OpenTelemetry alignment |
| `FPTS.md` | FPTS | Structured stub — three-tier performance profiles |

These documents are **living documentation** — they evolve as each framework is implemented. The initial versions written during this sprint establish the structure and design intent. Subsequent sprints flesh out the details as schemas, runners, and specs are built.

**Requirement:** Documentation must be written/updated for every FxTS framework touched during any sprint. This is not optional.

#### Gate S1-GATE
- [ ] `facts.schema.json` validates against JSON Schema draft 2020-12 meta-schema
- [ ] Minimal valid spec fixture passes validation
- [ ] 5+ negative test cases caught (missing required fields, bad types, invalid enums)
- [ ] All 11 FxTS docs exist in `docs/FxTS/` (README + 10 framework docs including FHTS)
- [ ] FACTS.md reflects the schema designed in S1.2
- [ ] Ruff clean, all tests pass

---

### Sprint 2: WMS FACTS Spec

**Effort:** Large | **Duration:** ~6 hours
**Epic:** Write the complete FACTS spec for the whk-wms adapter.
**Depends on:** Sprint 1

#### Rationale

The WMS is the simpler of the two production systems (barrel tracking, inventory, storage — no MQTT/equipment integration). Starting here gives us a clean first spec to validate the schema design before tackling MES complexity.

#### Tasks

**S2.1: Catalog WMS data sources**

From the API surface analysis, identify every data source the WMS adapter will collect from:

| Source Type | Endpoint/Topic | Data Entities | Collection Mode |
|---|---|---|---|
| GraphQL Query | `/graphql` — `barrels`, `lots`, `customers`, `storageLocations` | Barrel, Lot, Customer, StorageLocation | Poll (collect) |
| GraphQL Query | `/graphql` — `barrelEvents`, `barrelAudits` | BarrelEvent, AuditRecord | Poll (collect, backfill) |
| GraphQL Subscription | WebSocket — printer status, sync progress | PrinterStatus, SyncProgress | Subscribe |
| REST | `POST /inventory-upload` | InventoryBatch | Write (reverse direction) |
| RabbitMQ | `wh.whk01.distillery01.*` (60+ topics) | ERP sync events | Subscribe |

**S2.2: Define WMS adapter identity and capabilities**

```json
{
  "adapter_identity": {
    "adapter_id": "whk-wms",
    "name": "Whiskey House WMS Adapter",
    "version": "0.1.0",
    "type": "INGESTION",
    "tier": "MES_MOM",
    "protocol": "graphql+amqp"
  },
  "capabilities": {
    "read": true,
    "write": false,
    "subscribe": true,
    "backfill": true,
    "discover": true
  }
}
```

**S2.3: Define WMS connection parameters**

From the WMS docker-compose and `.env` patterns:

| Param | Type | Required | Secret | Description |
|---|---|---|---|---|
| `graphql_url` | string | yes | no | WMS GraphQL endpoint (e.g., `http://localhost:3000/graphql`) |
| `rabbitmq_url` | string | yes | no | AMQP connection URL |
| `rabbitmq_subscribe_group` | string | yes | no | Consumer group for distributed consumption |
| `jwt_token` | string | yes | yes | Bearer token for API authentication |
| `azure_tenant_id` | string | no | no | Azure AD tenant (if using Azure auth) |
| `azure_client_id` | string | no | yes | Azure AD client ID |
| `azure_client_secret` | string | no | yes | Azure AD client secret |

**S2.4: Define WMS data contract and context mapping**

What the adapter produces:

- **Output format:** `contextual_record`
- **Context fields (required):** `lot_id`, `barrel_id`, `storage_location_id`, `customer_id`, `timestamp`
- **Context fields (optional):** `whiskey_type`, `fill_date`, `warehouse_id`, `recipe_id`

Context mappings (source → Forge):

| WMS Field | Forge Context Field | Notes |
|---|---|---|
| `barrel.id` | `manufacturing_unit_id` | Primary tracked unit |
| `barrel.lot.id` | `lot_id` | Material grouping |
| `barrel.storageLocation` | `physical_asset_id` | Warehouse/floor/rick/position/tier |
| `barrel.customer.id` | `business_entity_id` | Current owner |
| `barrelEvent.timestamp` | `event_timestamp` | Immutable audit point |
| `barrelEvent.type` | `event_type` | Entry, withdrawal, transfer, movement |

**S2.5: Define WMS error handling requirements**

| Aspect | Requirement |
|---|---|
| Retry policy | Exponential backoff, max 5 retries, initial 1s delay |
| Circuit breaker | Open after 3 consecutive failures, half-open after 30s |
| Dead letter | Failed records written to `forge.dead-letter.whk-wms` topic |
| Health degradation | DEGRADED after 2 consecutive health check failures, FAILED after 5 |

**S2.6: Assemble `whk-wms.facts.json`**

Combine all sections into a complete, schema-valid FACTS spec file.

**S2.7: Stamp integrity hash, approve, and register in FHTS**

After assembly, stamp the spec with its integrity hash using `add_spec_hash()`, approve it with `approve_spec_hash()`, register it in the FHTS registry, then validate against `facts.schema.json`. The approved integrity hash becomes the baseline — any future modifications will be detected by both the self-contained hash (Layer 1) and the FHTS registry (Layer 2).

```python
from forge.governance.shared.runner import add_spec_hash, approve_spec_hash
from forge.governance.fhts.registry import FHTSRegistry

# Stamp and approve
spec = json.load(open("whk-wms.facts.json"))
add_spec_hash(spec, source="manual", changed_by="reh3376", reason="Initial spec creation")
approve_spec_hash(spec, approved_by="reh3376")
json.dump(spec, open("whk-wms.facts.json", "w"), indent=2)

# Register in FHTS registry
registry = FHTSRegistry(base_path=Path("src/forge/governance"))
registry.load()
registry.register("facts/specs/whk-wms.facts.json", "facts", spec["integrity"]["spec_hash"], "whk-wms spec")
registry.approve("facts/specs/whk-wms.facts.json", approved_by="reh3376")
registry.save()
```

#### Gate S2-GATE
- [ ] `whk-wms.facts.json` validates against `facts.schema.json`
- [ ] All 7 top-level sections present and populated
- [ ] Connection params cover both JWT and Azure AD auth paths
- [ ] Context mapping covers all primary WMS entities (barrel, lot, location, customer, event)
- [ ] Peer review: spec accurately represents the WMS API surface

---

### Sprint 3: MES FACTS Spec

**Effort:** Large | **Duration:** ~6 hours
**Epic:** Write the complete FACTS spec for the whk-mes adapter.
**Depends on:** Sprint 1 (schema), Sprint 2 (WMS spec as reference)

#### Rationale

The MES is more complex than WMS: it has MQTT equipment integration, production order lifecycle, recipe management, batch execution, quality testing, and formula evaluation. The spec must capture these additional data sources and richer context fields while using the same schema structure proven in Sprint 2.

#### Tasks

**S3.1: Catalog MES data sources**

| Source Type | Endpoint/Topic | Data Entities | Collection Mode |
|---|---|---|---|
| GraphQL Query | `/graphql` — 71 resolvers | ProductionOrder, ScheduleOrder, Recipe, Batch, Inventory, Equipment, Tests | Poll (collect) |
| GraphQL Mutation | `/graphql` | Write-back for operational state changes | Write |
| REST | `/api/*` — MQTT rules, enzyme config, system config | Configuration entities | Poll (collect) |
| RabbitMQ | `wh.whk01.distillery01.*` (32+ topics) | ERP sync events (matching WMS topology) | Subscribe |
| MQTT | Dynamic broker configs via `UNSBrokerConfiguration` | Equipment phases, process parameters, batch time-series | Subscribe |
| WebSocket | Socket.io gateway | Real-time MQTT messages to clients | Subscribe |

**S3.2: Define MES adapter identity and capabilities**

```json
{
  "adapter_identity": {
    "adapter_id": "whk-mes",
    "name": "Whiskey House MES Adapter",
    "version": "0.1.0",
    "type": "INGESTION",
    "tier": "MES_MOM",
    "protocol": "graphql+amqp+mqtt"
  },
  "capabilities": {
    "read": true,
    "write": true,
    "subscribe": true,
    "backfill": true,
    "discover": true
  }
}
```

Note: MES adapter has `write: true` because Forge may need to push decisions back into the production order lifecycle.

**S3.3: Define MES connection parameters**

All WMS connection params plus:

| Param | Type | Required | Secret | Description |
|---|---|---|---|---|
| `mqtt_host` | string | no | no | MQTT broker host (dynamic via UNS config) |
| `mqtt_port` | integer | no | no | MQTT broker port |
| `mqtt_username` | string | no | yes | MQTT auth username |
| `mqtt_password` | string | no | yes | MQTT auth password |
| `mqtt_ca_cert` | string | no | yes | CA certificate for mTLS |
| `mqtt_client_cert` | string | no | yes | Client certificate for mTLS |
| `mqtt_client_key` | string | no | yes | Client private key for mTLS |

**S3.4: Define MES data contract and context mapping**

**Context fields (required):** `production_order_id`, `batch_id`, `recipe_id`, `equipment_id`, `timestamp`
**Context fields (optional):** `lot_id`, `shift_id`, `operating_mode`, `schedule_order_id`, `whiskey_type`

Context mappings (MES-specific):

| MES Field | Forge Context Field | Notes |
|---|---|---|
| `productionOrder.id` | `work_order_id` | Production unit of work |
| `batch.id` | `batch_id` | Execution-level tracking |
| `recipe.id` | `process_definition_id` | How to make it |
| `equipmentPhase.name` | `equipment_phase` | Current production step |
| `batch.timeSeriesData` | `process_parameters` | Temporal measurement data |
| `test.result` | `quality_result` | Quality measurement |
| `mashingProtocol.stepActual` | `process_step_actual` | Actual vs. planned step execution |
| `inventoryTransfer` | `material_movement` | Lot/item movement event |

**S3.5: Define MES error handling requirements**

Same base requirements as WMS with additions:
- MQTT reconnection: automatic with exponential backoff, certificate rotation awareness
- Multi-broker failover: if primary MQTT broker fails, try secondary from UNS config
- Equipment data buffering: buffer up to 60s of MQTT messages during connection recovery

**S3.6: Assemble `whk-mes.facts.json`**

**S3.7: Stamp integrity hash, approve, register in FHTS, and cross-reference with WMS spec**

Stamp integrity hash (same as S2.7), approve, register in FHTS registry, validate against schema, then cross-reference with WMS spec. Both specs should use the same schema version, same context field naming conventions, compatible error handling patterns, both must have valid integrity hashes, and both must be registered in the FHTS registry with `approved` status.

#### Gate S3-GATE
- [ ] `whk-mes.facts.json` validates against `facts.schema.json`
- [ ] All 7 top-level sections present and populated
- [ ] MQTT connection params cover certificate-based, username/password, and hybrid auth
- [ ] Context mapping covers production order lifecycle (order → schedule → batch → equipment → test)
- [ ] Cross-reference: shared context fields use identical names in both WMS and MES specs
- [ ] Peer review: spec accurately represents the MES API surface

---

### Sprint 4: FACTS Runner Implementation

**Effort:** Large | **Duration:** ~8 hours
**Epic:** Build the governance runner that enforces FACTS specs against adapters.
**Depends on:** Sprint 1 (schema), Sprint 2 + 3 (specs to test against)

#### Rationale

The runner is what gives FACTS its teeth. Without it, specs are just documentation. The runner must enforce every field in `facts.schema.json` — schema-runner parity is non-negotiable. The runner has two modes: **static** (validate spec + manifest without running the adapter) and **live** (instantiate the adapter, exercise its lifecycle, verify data output).

#### Tasks

**S4.1: Define FACTS check categories**

Following the FATS runner pattern, the FACTS runner performs checks in categories:

| Category | Check IDs | What it validates |
|---|---|---|
| **Identity** | `facts:identity-*` | adapter_id format, name, version semver, tier enum, protocol format |
| **Capabilities** | `facts:capabilities-*` | Declared capabilities match implemented interfaces (mixins) |
| **Lifecycle** | `facts:lifecycle-*` | configure/start/stop/health methods exist, timeouts respected |
| **Connection** | `facts:connection-*` | Required params declared, secret params flagged, auth methods valid |
| **Data Contract** | `facts:data-contract-*` | Schema ref exists, output format valid, context fields non-empty |
| **Context Mapping** | `facts:context-*` | All declared context fields have mappings, no orphan mappings |
| **Error Handling** | `facts:error-*` | Retry policy valid, circuit breaker configured, dead letter topic set |

**S4.2: Implement `FACTSRunner` class**

```python
class FACTSRunner(FxTSRunner):
    framework = "FACTS"
    version = "0.1.0"

    _ENFORCED_FIELDS: ClassVar[set[str]] = {
        "spec_version",
        "adapter_identity",
        "capabilities",
        "lifecycle",
        "connection",
        "data_contract",
        "context_mapping",
        "error_handling",
        "metadata",
    }
```

Subclass `FxTSRunner`, implement `_run_checks()` and `implemented_fields()`. Follow the FATS runner pattern exactly: one `_check_*` method per enforced field, each returning an `FxTSVerdict`.

**S4.3: Implement static checks**

Static checks validate the spec file and (optionally) the adapter's manifest without instantiating the adapter:

- `_check_spec_version()` — verify supported version
- `_check_identity()` — validate adapter_id format (kebab-case, no spaces), semver version, valid tier enum, protocol string
- `_check_capabilities()` — verify at minimum `read: true`, validate boolean-only fields
- `_check_lifecycle()` — verify timeout values are positive integers, restart_policy is valid enum
- `_check_connection()` — verify params have names and types, secret params exist, at least one auth method
- `_check_data_contract()` — verify schema_ref points to a loadable schema, context_fields non-empty, sample_record validates
- `_check_context_mapping()` — verify all context_fields have at least one mapping, no duplicate target fields
- `_check_error_handling()` — verify retry count/delay are positive, circuit breaker thresholds are reasonable
- `_check_metadata()` — verify metadata is a dict (always passes — metadata is free-form)

**S4.4: Implement live checks (adapter instantiation)**

Live checks exercise the actual adapter:

- `_live_check_manifest_match()` — compare adapter's `manifest` attribute against spec declarations
- `_live_check_configure()` — call `configure()` with params from spec, verify no exception
- `_live_check_start_stop()` — call `start()`, verify state transitions to HEALTHY, then `stop()`, verify STOPPED
- `_live_check_health()` — call `health()`, verify returns `AdapterHealth` with expected fields
- `_live_check_collect()` — call `collect()`, verify yields at least one `ContextualRecord`
- `_live_check_context_fields()` — verify collected records contain all required context fields
- `_live_check_capability_interfaces()` — if `subscribe: true`, verify adapter implements `SubscriptionProvider`, etc.

**S4.5: Implement CLI integration**

Add `forge governance run facts` command:

```
Usage: forge governance run facts [OPTIONS]

Options:
  --adapter TEXT     Adapter ID to validate (loads spec from governance/facts/specs/)
  --spec PATH        Path to FACTS spec file (overrides adapter lookup)
  --live / --static  Run live adapter checks or static spec-only checks (default: static)
  --format TEXT      Output format: summary | json | verbose (default: summary)
  --output PATH      Write report to file
```

**S4.6: Write comprehensive tests**

- Unit tests for each `_check_*` method (pass and fail cases)
- Integration test: run against `whk-wms.facts.json` in static mode
- Integration test: run against `whk-mes.facts.json` in static mode
- Schema-runner parity test: verify `implemented_fields()` matches `facts.schema.json`
- FHTS hash governance tests:
  - Valid spec with correct hash → `hash_verified=True`
  - Spec with tampered content → `hash_verified=False`, assertions still execute
  - Spec without integrity block → `hash_verified=None`
  - Verify `report.integrity` aggregate counts are correct (including approved, modified_unapproved, agent_changes_pending)
  - Hash state transitions: `unknown → approved → modified → approved`
  - Agent-sourced change triggers `hash_state: modified` and `fhts:no-agent-pending` fail
  - `approve_spec_hash()` clears governance warnings
  - `revert_spec_hash()` restores previous hash and records revert in history
  - Change history capped at 3 entries (MAX_HASH_HISTORY)
  - FHTS registry: register, update_hash, revert_hash, verify, verify_all
  - FHTS registry: scan_framework_specs discovers and registers all spec files
- Edge cases: empty spec, missing sections, extra unknown fields, malformed JSON

#### Gate S4-GATE
- [ ] `FACTSRunner` passes schema-runner parity (0 NOT_IMPLEMENTED verdicts)
- [ ] All static checks produce correct PASS/FAIL for known-good and known-bad specs
- [ ] `whk-wms.facts.json` passes all static checks
- [ ] `whk-mes.facts.json` passes all static checks
- [ ] CLI command works: `forge governance run facts --adapter whk-wms --format json`
- [ ] ≥90% test coverage on `facts_runner.py`
- [ ] Ruff clean, all tests pass

---

### Sprint 5: Verification & Documentation

**Effort:** Small | **Duration:** ~3 hours
**Epic:** End-to-end verification, cross-reference with PLAN.md, documentation.
**Depends on:** Sprints 1–4

#### Tasks

**S5.1: Full verification run**

Execute the complete FACTS pipeline and capture reports:

```bash
# Static validation — both specs
forge governance run facts --adapter whk-wms --format json --output reports/facts-whk-wms.json
forge governance run facts --adapter whk-mes --format json --output reports/facts-whk-mes.json

# Verify reports
python -c "
import json
for name in ['whk-wms', 'whk-mes']:
    report = json.load(open(f'reports/facts-{name}.json'))
    print(f'{name}: {report[\"pass_count\"]}/{report[\"total\"]} checks passed')
    assert all(v['status'] in ('PASS', 'SKIP') for v in report['verdicts']), f'{name} has failures'
print('All FACTS specs conform.')
"
```

**S5.2: Cross-reference with PLAN.md**

Verify deliverables match what PLAN.md section "F12: FACTS" and "F32/F33: WHK Adapters" require. Update PLAN.md status if needed.

**S5.3: Write FACTS developer guide**

Create `docs/governance/facts-developer-guide.md`:

- What FACTS is and why it exists
- Schema structure walkthrough
- How to write a FACTS spec for a new adapter
- How to run the FACTS runner
- Common failures and how to fix them
- Example: annotated whk-wms spec

**S5.4: Update PHASES.md status**

Mark F12 deliverables as complete (or partially complete with remaining items noted).

**S5.5: Retrospective notes**

Capture any schema design decisions that should be revisited, any runner limitations discovered, and any patterns that emerged that apply to other FxTS frameworks (FQTS, FSTS, etc.).

#### Gate S5-GATE
- [ ] Both specs pass full static validation with 0 failures
- [ ] FACTS developer guide written and reviewed
- [ ] PHASES.md updated to reflect completed work
- [ ] No Ruff violations, all tests pass
- [ ] Retrospective notes captured

---

## 5. Testing Plan

### Tier 1: Unit Tests
- Schema validation utilities (load, validate, parity check)
- Each `_check_*` method in `FACTSRunner` (pass case + ≥1 fail case)
- CLI argument parsing and output formatting
- Fixture-based: use JSON spec fixtures for known-good and known-bad inputs

### Tier 2: Integration Tests
- Full runner execution against `whk-wms.facts.json`
- Full runner execution against `whk-mes.facts.json`
- Schema-runner parity verification
- CLI end-to-end: invoke via subprocess, verify exit code and output

### Tier 3: Conformance Tests
- Static mode: both specs pass all checks
- Report serialization: JSON output round-trips correctly
- Cross-spec consistency: shared context field names match between WMS and MES specs

---

## 6. Commit Strategy

| Sprint | Commit(s) | Description |
|---|---|---|
| S1 | 2 | `feat(governance): add FACTS schema (facts.schema.json)` then `docs(governance): add FxTS framework documentation (docs/FxTS/)` |
| S2 | 1 | `feat(governance): add WMS FACTS spec (whk-wms.facts.json)` |
| S3 | 1 | `feat(governance): add MES FACTS spec (whk-mes.facts.json)` |
| S4 | 2–3 | `feat(governance): implement FACTSRunner with static checks` then `feat(governance): add FACTS live checks and CLI integration` |
| S5 | 1 | `docs(governance): add FACTS developer guide and update PHASES.md` |

---

## 7. Verification Checklist

- [x] `facts.schema.json` self-validates against JSON Schema meta-schema
- [x] `whk-wms.facts.json` validates against `facts.schema.json` with valid integrity hash
- [x] `whk-mes.facts.json` validates against `facts.schema.json` with valid integrity hash
- [x] Both specs have `hash_verified=True` when run through the FACTS runner
- [x] `FACTSRunner.implemented_fields()` matches all top-level schema properties
- [x] Schema-runner parity check passes (0 NOT_IMPLEMENTED)
- [x] All static checks PASS for both specs (WMS: 34/34, MES: 35/35)
- [ ] CLI command produces valid JSON report — **deferred** (S4.5 not implemented)
- [x] All tests pass (`pytest tests/governance/facts/` — 244/244)
- [x] Ruff clean (`ruff check src/forge/governance/facts/`)
- [x] FACTS developer guide exists (`docs/governance/facts-developer-guide.md`)
- [x] All 10 FxTS framework docs exist in `docs/FxTS/` (README + 9 frameworks)
- [x] FACTS.md and FATS.md are full feature docs (not stubs)
- [x] Remaining 7 framework docs have structured stubs with purpose, schema, and design decisions
- [x] PHASES.md updated (F12, F32, F33 deliverable checkboxes)

---

## 8. Documentation Updates

| Document | Update |
|---|---|
| `PHASES.md` | Mark F12 FACTS deliverables as complete |
| `PLAN.md` | Add FACTS to "completed governance frameworks" section |
| `docs/governance/facts-developer-guide.md` | New — full developer guide |
| `src/forge/governance/facts/README.md` | New — package-level overview |
| `docs/FxTS/README.md` | New — FxTS framework index and shared principles |
| `docs/FxTS/FATS.md` | New — full feature doc for implemented FATS framework |
| `docs/FxTS/FACTS.md` | New — full feature doc for FACTS (primary sprint deliverable) |
| `docs/FxTS/FDTS.md` | New — structured stub for planned FDTS framework |
| `docs/FxTS/FQTS.md` | New — detailed stub with example spec for FQTS |
| `docs/FxTS/FSTS.md` | New — structured stub for FSTS with OWASP mapping |
| `docs/FxTS/FLTS.md` | New — structured stub for lineage governance |
| `docs/FxTS/FNTS.md` | New — structured stub for normalization governance |
| `docs/FxTS/FOTS.md` | New — structured stub for observability governance |
| `docs/FxTS/FPTS.md` | New — structured stub for performance governance |

**FxTS Documentation Policy:** Every sprint that creates or modifies an FxTS framework must update its corresponding doc in `docs/FxTS/`. Framework docs are living documents that evolve with the implementation.

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Schema too rigid — can't express diverse adapter types | Medium | High | Design with optional sections. OT adapters don't need GraphQL params. |
| Runner scope creep — live checks require full adapter impl | High | Medium | Sprint 4 implements live check structure but marks them SKIP without adapter. Path 3 fills them in. |
| Context field naming conflicts between WMS and MES | Low | High | Sprint 3 includes explicit cross-reference task. Establish naming convention early. |
| FACTS schema changes after runner is built | Medium | Medium | Schema-runner parity check will catch any drift immediately. |

---

## 10. Documents Accessed

| Document | Purpose |
|---|---|
| `forge-platform/PLAN.md` | Master plan alignment |
| `forge-platform/PHASES.md` | Phase numbering, F12/F30/F32/F33 deliverables |
| `forge-platform/ARCHITECTURE.md` | Component architecture reference |
| `forge-platform/src/forge/governance/shared/runner.py` | FxTSRunner base class |
| `forge-platform/src/forge/governance/fats/runners/fats_runner.py` | Reference runner implementation |
| `forge-platform/src/forge/core/models/adapter.py` | AdapterManifest, capabilities, health models |
| `forge-platform/src/forge/adapters/base/interface.py` | AdapterBase, capability mixins |
| `whk-wms/schema.graphql` | WMS GraphQL API surface |
| `whk-wms/infrastructure/rabbitmq/definitions.json` | WMS RabbitMQ topology |
| `whk-mes/apps/whk-recipe-configuration/prisma/schema.prisma` | MES data model |
| `whk-mes/apps/whk-recipe-configuration/src/` | MES module structure, auth, MQTT, RabbitMQ |

---

## 11. Retrospective Notes (S5.5)

### Design Decisions Worth Revisiting

1. **Hash scope: entire integrity block excluded.** The original `compute_spec_hash` dropped only `integrity.spec_hash`, but `change_history[].new_hash` references the spec hash — creating a circular dependency. Fixed to exclude the entire integrity block. This means changes to `hash_state`, `approved_by`, or `change_history` do NOT affect the hash, which is the correct design (integrity is metadata about the spec, not governed content). If a future FxTS framework needs to hash integrity metadata, a second-layer hash should be added.

2. **`ensure_ascii=True` for canonical JSON.** Non-ASCII characters (em-dashes, accented names) produce different byte sequences depending on `ensure_ascii`. Setting `True` ensures `\u2014` is always used instead of `—`, making canonical hashing portable across Python builds, JSON parsers, and operating systems. This should be adopted as an FxTS-wide convention.

3. **`read: true` is hardcoded.** The schema and runner both require `capabilities.read = true`. A future `WRITE_ONLY` adapter type would need this relaxed. Consider making the read requirement conditional on adapter type.

### Patterns That Apply to Other FxTS Frameworks

1. **Cross-field consistency checks** — FQTS (quality), FSTS (security), and FOTS (observability) will all need cross-section validation. The pattern of checking capability declarations against data source/rule existence is reusable.

2. **Enrichment rules as first-class mappings** — The context_mapping section's enrichment_rules pattern (computed fields that satisfy required context without direct source mapping) will be needed by FQTS for derived quality metrics.

3. **`_minimal_spec()` test factory** — Building a minimal valid spec in tests and then selectively breaking one section at a time is far more maintainable than loading and modifying real spec files. Every future runner test suite should use this pattern.

4. **Cross-spoke consistency tests** — When two adapters share context fields (WMS lot_id = MES lot_id), cross-reference tests should be in the dependent spec's test file. This pattern scales to N adapters.

### Runner Limitations Discovered

1. **No CLI integration yet** — S4.5 was deferred. `forge governance run facts --adapter <id>` is planned but not implemented.
2. **Live checks return SKIP** — S4.4 deferred to Path 3 (requires adapter code). The `_live_checks` method is a placeholder.
3. **No report persistence** — Reports are generated in-memory. A future sprint should add report archiving to the governance database.
4. **No multi-spec cross-validation in runner** — Cross-spoke consistency is tested in pytest but not enforceable via the runner. Consider a `FACTSCrossValidator` for CI.

### Test Coverage Summary

| Test File | Tests | Category |
|-----------|-------|----------|
| `test_facts_schema.py` | 60 | Schema validation (meta, missing fields, enums, patterns, nesting, integrity) |
| `test_whk_wms_spec.py` | 48 | WMS spec conformance (identity, capabilities, connection, data, mapping, errors, integrity, metadata) |
| `test_whk_mes_spec.py` | 64 | MES spec conformance (same as WMS + cross-reference, MQTT, write capability) |
| `test_facts_runner.py` | 72 | Runner checks (unit per method, integration against both specs, parity, FHTS, edge cases) |
| **Total** | **244** | |
