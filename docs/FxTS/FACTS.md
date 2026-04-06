# FACTS — Forge Adapter Conformance Test Specification

**Framework ID:** FACTS
**Full Name:** Forge Adapter Conformance Test Specification
**CI Gate:** Hard-fail (merge-blocking for production adapters)
**Status:** Sprints 1-4 complete — Schema (60 tests) + WMS Spec (48 tests) + MES Spec (64 tests) + Runner (72 tests) = 244/244 passing
**Phase:** F12
**MDEMG Analog:** UPTS

---

## Purpose

FACTS governs adapter behavior. Every external system that connects to Forge does so through an adapter — a plugin that conforms to a standard interface. FACTS defines what "conformant" means: what an adapter must declare about itself (manifest), what capabilities it must implement, how it must behave during its lifecycle, what data contracts it must honor, how it maps source-system fields to Forge's context model, and how it must handle failures.

Without FACTS, adapter development is ad hoc. Each adapter would make its own assumptions about lifecycle, error handling, and data shape. FACTS eliminates this by providing a single, enforceable source of truth per adapter.

## What FACTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Identity** | adapter_id, name, version, type, tier, protocol | Format validation, enum membership, semver compliance |
| **Capabilities** | read, write, subscribe, backfill, discover | Boolean declarations, interface implementation match |
| **Lifecycle** | Startup/shutdown timeouts, health check interval, restart policy | Timeout values positive, policy enum valid |
| **Connection** | Required params, types, secrets, auth methods | Params declared, secrets flagged, auth methods valid |
| **Data Contract** | Output schema ref, format, required context fields, sample record | Schema loadable, context fields non-empty, sample validates |
| **Context Mapping** | Source field → Forge context field mappings, enrichment rules | All context fields have mappings, no orphans |
| **Error Handling** | Retry policy, circuit breaker, dead letter behavior | Retry count/delay positive, circuit breaker configured |

## Schema

**Location:** `src/forge/governance/facts/schema/facts.schema.json`
**Status:** ✅ Implemented (Sprint 1 complete — 60/60 tests passing)

### Adapter Specs

| Spec | Status | Tests | Data Sources | Context Mappings | Capabilities |
|------|--------|-------|--------------|------------------|-------------|
| `whk-wms.facts.json` | ✅ Sprint 2 complete | 48/48 | 14 | 11 + 3 enrichment | read, subscribe, backfill, discover |
| `whk-mes.facts.json` | ✅ Sprint 3 complete | 64/64 | 17 | 15 + 3 enrichment | read, **write**, subscribe, backfill, discover |

**Cross-spoke consistency:** 6 shared context fields (`lot_id`, `shift_id`, `operator_id`, `event_timestamp`, `event_type`, `work_order_id`). Identical shift definitions (America/Kentucky/Louisville, day/night). Shared RabbitMQ exchange topology (`wh.whk01.distillery01.*`). Both MES_MOM tier.

### Top-Level Structure

```
facts.schema.json
├── spec_version          # string — Schema version (semver)
├── adapter_identity      # object — Who is this adapter?
│   ├── adapter_id        #   string — kebab-case unique ID
│   ├── name              #   string — Human-readable name
│   ├── version           #   string — Adapter version (semver)
│   ├── type              #   enum — INGESTION | BIDIRECTIONAL | WRITE_ONLY | DISCOVERY_ONLY
│   ├── tier              #   enum — OT | MES_MOM | ERP_BUSINESS | HISTORIAN | DOCUMENT
│   └── protocol          #   string — Connection protocol(s) (e.g., "graphql+amqp")
├── capabilities          # object — What can this adapter do?
│   ├── read              #   boolean (required, must be true)
│   ├── write             #   boolean
│   ├── subscribe         #   boolean
│   ├── backfill          #   boolean
│   └── discover          #   boolean
├── lifecycle             # object — How does the adapter behave?
│   ├── startup_timeout_ms    # integer
│   ├── shutdown_timeout_ms   # integer
│   ├── health_check_interval_ms # integer
│   └── restart_policy        # enum — always | on_failure | never
├── connection            # object — How does Forge connect to the source system?
│   ├── params[]          #   array of ConnectionParam
│   └── auth_methods[]    #   array of strings (none, bearer_token, api_key, basic, oauth2, certificate, azure_entra_id)
├── data_contract         # object — What does the adapter produce?
│   ├── schema_ref        #   string — forge:// URI to output schema
│   ├── output_format     #   enum — contextual_record | raw
│   ├── context_fields[]  #   array of required context field names
│   ├── optional_context_fields[] # array of optional context field names
│   ├── data_sources[]    #   array of {source_type, endpoint, description, entities, collection_mode}
│   └── sample_record     #   object — example ContextualRecord
├── context_mapping       # object — How do source fields become Forge context?
│   ├── mappings[]        #   array of {source_field, context_field, transform?}
│   └── enrichment_rules  #   object — rules for derived context
├── error_handling        # object — How must the adapter handle failure?
│   ├── retry_policy      #   object — {max_retries, initial_delay_ms, backoff_strategy, max_delay_ms}
│   ├── circuit_breaker   #   object — {failure_threshold, half_open_after_ms, success_threshold}
│   ├── dead_letter       #   object — {enabled, topic, max_age_hours}
│   └── health_degradation # object — {degraded_after_failures, failed_after_failures}
├── integrity             # object — Hashing lock + AI agent governance (FHTS)
│   ├── hash_method       #   string — "sha256-c14n-v1" (normative)
│   ├── spec_hash         #   string — SHA-256 hex digest (excluded from own hash input)
│   ├── hash_state        #   enum — approved | modified | pending_review | reverted | unknown
│   ├── previous_hash     #   string | null — Hash before most recent change
│   ├── approved_by       #   string — Who approved current hash state
│   ├── approved_at       #   string — ISO8601 timestamp of approval
│   └── change_history[]  #   array of {previous_hash, new_hash, changed_at, source, changed_by, change_type, reason}
└── metadata              # object — Free-form adapter-specific data
```

## Runner

**Location:** `src/forge/governance/facts/runners/facts_runner.py`
**Class:** `FACTSRunner(FxTSRunner)`
**Status:** ✅ Implemented (Sprint 4 complete — 72/72 runner tests passing)
**Tests:** `tests/governance/facts/test_facts_runner.py`

### Check Catalog

#### Static Checks (spec + manifest validation)

| Check ID | Category | What it validates |
|----------|----------|-------------------|
| `facts:spec-version` | Identity | Spec version supported |
| `facts:identity-id-format` | Identity | adapter_id is kebab-case, no spaces |
| `facts:identity-version` | Identity | Version is valid semver |
| `facts:identity-tier` | Identity | Tier is valid enum member |
| `facts:identity-protocol` | Identity | Protocol string non-empty |
| `facts:capabilities-read` | Capabilities | read is true (required for all adapters) |
| `facts:capabilities-valid` | Capabilities | All capability fields are boolean |
| `facts:lifecycle-timeouts` | Lifecycle | All timeouts are positive integers |
| `facts:lifecycle-restart` | Lifecycle | Restart policy is valid enum |
| `facts:connection-params` | Connection | Each param has name and type |
| `facts:connection-secrets` | Connection | Secret params exist and are flagged |
| `facts:connection-auth` | Connection | At least one auth method declared |
| `facts:data-contract-schema` | Data Contract | Schema ref is loadable |
| `facts:data-contract-format` | Data Contract | Output format is valid enum |
| `facts:data-contract-context` | Data Contract | Context fields list non-empty |
| `facts:data-contract-sample` | Data Contract | Sample record validates against schema |
| `facts:context-coverage` | Context Mapping | All declared context fields have mappings |
| `facts:context-no-orphans` | Context Mapping | No mappings target undeclared context fields |
| `facts:error-retry` | Error Handling | Retry count and delay are positive |
| `facts:error-circuit-breaker` | Error Handling | Failure threshold and reset timeout configured |
| `facts:error-dead-letter` | Error Handling | Dead letter topic is set |
| `facts:metadata-valid` | Metadata | Metadata is a dict (always passes) |

#### Live Checks (adapter instantiation, `--live` flag)

| Check ID | What it validates |
|----------|-------------------|
| `facts:live-manifest-match` | Adapter's `manifest` attribute matches spec declarations |
| `facts:live-configure` | `configure()` succeeds with spec connection params |
| `facts:live-start-stop` | `start()` → HEALTHY → `stop()` → STOPPED transitions |
| `facts:live-health` | `health()` returns valid `AdapterHealth` |
| `facts:live-collect` | `collect()` yields at least one `ContextualRecord` |
| `facts:live-context-fields` | Collected records contain all required context fields |
| `facts:live-capability-interfaces` | Declared capabilities have matching interface implementations |

### Usage (Planned)

```bash
# Static validation
forge governance run facts --adapter whk-wms
forge governance run facts --spec path/to/whk-wms.facts.json

# Live validation (requires adapter code)
forge governance run facts --adapter whk-wms --live

# JSON report output
forge governance run facts --adapter whk-wms --format json --output reports/facts-whk-wms.json
```

## First Adapter Specs

### whk-wms (Whiskey House Warehouse Management System)

**Spec File:** `src/forge/governance/facts/specs/whk-wms.facts.json`
**Tier:** MES_MOM
**Protocol:** graphql+amqp
**Capabilities:** read, subscribe, backfill, discover (no write)

Data sources:
- GraphQL API (100+ queries, 80+ mutations) — barrel, lot, customer, storage, events
- RabbitMQ topics (`wh.whk01.distillery01.*`) — 60+ ERP sync topics
- GraphQL Subscriptions — printer status, sync progress

Context fields: `manufacturing_unit_id` (barrel), `lot_id`, `physical_asset_id` (storage location), `business_entity_id` (customer), `event_timestamp`, `event_type`

### whk-mes (Whiskey House Manufacturing Execution System)

**Spec File:** `src/forge/governance/facts/specs/whk-mes.facts.json`
**Tier:** MES_MOM
**Protocol:** graphql+amqp+mqtt
**Capabilities:** read, write, subscribe, backfill, discover

Data sources:
- GraphQL API (71 resolvers) — production orders, schedules, recipes, batches, equipment, tests
- REST API (`/api/*`) — MQTT rules, enzyme config, system config
- RabbitMQ topics (`wh.whk01.distillery01.*`) — 32+ ERP sync topics
- MQTT (dynamic broker configs) — equipment phases, process parameters, time-series
- WebSocket gateway — real-time MQTT message relay

Context fields: `work_order_id` (production order), `batch_id`, `process_definition_id` (recipe), `equipment_phase`, `process_parameters`, `quality_result`, `lot_id`, `shift_id`, `operating_mode`

## Relationship to Other Frameworks

| Framework | Relationship to FACTS |
|-----------|----------------------|
| **FATS** | FACTS validates the adapter; FATS validates the APIs the adapter exposes (if any) |
| **FQTS** | FACTS ensures the adapter produces data; FQTS ensures the data meets quality standards |
| **FSTS** | FACTS checks adapter auth methods; FSTS validates security controls end-to-end |
| **FLTS** | FACTS checks context mapping; FLTS validates lineage chain integrity downstream |
| **FOTS** | FACTS checks health reporting; FOTS validates pipeline-level observability SLOs |
| **FHTS** | FHTS tracks hash integrity of all FACTS adapter specs, enabling revert, change history, and AI agent governance |

## Design Decisions

1. **Why separate from FATS?** FATS validates API endpoint contracts (static, HTTP-centric). FACTS validates adapter runtime behavior (dynamic, lifecycle-centric). An adapter may not even expose an API — it might just subscribe to MQTT topics.

2. **Why live checks are optional?** The spec is the source of truth. Static checks validate the spec itself. Live checks require adapter code, which may not exist yet (spec-first development). Live checks are added when the adapter is implemented (Path 3).

3. **Why context_mapping is a top-level section?** Context is Forge's core differentiator. Every record must carry operational context (batch, lot, shift, equipment, recipe). Making this explicit in the FACTS spec forces adapter developers to think about context mapping upfront, not as an afterthought.

4. **Why the hashing lock?** (Inherited from UxTS, extended by FHTS) Without the integrity hash, a spec could be silently modified — for example, an AI coding agent could relax a timeout, remove a required context field, or weaken an error handling requirement. The hashing lock operates at two layers: Layer 1 (self-contained hash in the spec) detects content drift; Layer 2 (FHTS cross-cutting registry) tracks change history, records who made each change, and flags unapproved agent modifications. This is particularly important for FACTS because adapter conformance specs are long-lived contracts that shouldn't change without review. See [FHTS.md](FHTS.md) for the full hash governance framework.
