# FACTS — Forge Adapter Conformance Test Specification

**Framework ID:** FACTS
**Full Name:** Forge Adapter Conformance Test Specification
**CI Gate:** Hard-fail (merge-blocking for production adapters)
**Status:** Schema v0.1.0 (vocabulary extended 2026-10-17, backward compatible), runner (`facts:schema-valid` + 35 rule checks whose enums are read from the schema) and 9 adapter specs; 8 of 9 validate against the schema; 298 tests under `tests/governance/facts/`. Gap: FB-079 (OT spec vocabulary and identity, decision D-8)
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

State on 2026-10-17 (`FACTSRunner` over `src/forge/governance/facts/specs/`; "Runner" counts the 36-verdict set, `facts:integrity-hash-state` excluded):

| Spec | Tier | Data sources | Context mappings | Capabilities | Hash state | Runner |
|------|------|--------------|------------------|--------------|------------|--------|
| `bosc-ims.facts.json` | MES_MOM | 8 (7 gRPC unary, 1 gRPC stream) | 12 + 2 enrichment | read, subscribe, backfill, discover | approved (no approver recorded) | pass |
| `forge-mes.facts.json` | MES_MOM | 18 (10 GraphQL, 1 mutation, 1 RabbitMQ, 2 MQTT, 1 WS, 2 REST, 1 database) | 15 + 3 enrichment | read, **write**, subscribe, backfill, discover | approved (reh3376) | pass |
| `next-trend.facts.json` | HISTORIAN | 5 (4 REST, 1 WS) | 8 | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; was auto-approved, no approver) | pass |
| `ot-module.facts.json` | OT_SCADA (not a FACTS tier) | 21 (OPC-UA, alarm, control-write, Ignition bridge, scripting) | 9 + 10 enrichment | read, **write**, subscribe, backfill, discover | pending_review (FB-073) | 9 failures: `facts:schema-valid` (66 violations) + 8 vocabulary checks (FB-079) |
| `scanner-gateway.facts.json` | OT | 5 (3 gRPC server unary, 2 gRPC server stream) | 9 | read, subscribe, discover | pending_review (FB-080 re-stamp; was auto-approved, no approver) | pass |
| `whk-cmms.facts.json` | MES_MOM | 5 (3 GraphQL, 1 REST, 1 RabbitMQ) | 19 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by reh3376) | pass |
| `whk-erpi.facts.json` | ERP_BUSINESS | 5 (3 RabbitMQ, 1 REST, 1 GraphQL) | 12 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by forge-governance-audit) | pass |
| `whk-nms.facts.json` | MES_MOM | 11 (10 REST, 1 WS) | 19 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by reh3376) | pass |
| `whk-wms.facts.json` | MES_MOM | 14 (9 GraphQL, 1 subscription, 3 RabbitMQ, 1 REST) | 11 + 3 enrichment | read, subscribe, backfill, discover | approved (reh3376) | pass |

The runner's first verdict is `facts:schema-valid` (JSON Schema 2020-12, one violation per offending path); the 35 rule checks that follow read their closed value sets from the schema's enums, so the two cannot drift (FB-080). `tests/governance/facts/test_specs_schema_valid.py` validates every file in `specs/` in CI; the OT spec is a strict xfail there until FB-079. Adapter-specific material the contract has no slot for — routing rules, cross-module flows, scan rejection, pre-FHTS history notes — lives under `metadata`, which the schema leaves free-form and the runner never inspects. Only the owner approves a hash (`approve_spec_hash(approved_by="reh3376")`); agents re-stamp as `pending_review`. Five specs await that approval after FB-080 moved their out-of-contract fields to `metadata` (content changes; adapter behaviour unchanged). Per-spec test modules exist for whk-wms, forge-mes and ot-module.

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
│   ├── params[]          #   array of {name, type, required, secret, description, default (typed to match type), validation}
│   └── auth_methods[]    #   array of strings (none, bearer_token, api_key, basic, oauth2, certificate, azure_entra_id, mtls, device_token)
├── data_contract         # object — What does the adapter produce?
│   ├── schema_ref        #   string — forge:// URI to output schema
│   ├── output_format     #   enum — contextual_record | raw
│   ├── context_fields[]  #   array of required context field names
│   ├── optional_context_fields[] # array of optional context field names
│   ├── external_contract_ref #   string — URI of an external contract this one derives from (e.g. AsyncAPI)
│   ├── data_sources[]    #   array of {name?, source_type, endpoint, description, entities, collection_mode}
│   └── sample_record     #   object — example ContextualRecord
├── context_mapping       # object — How do source fields become Forge context?
│   ├── mappings[]        #   array of {source_field, context_field, transform?}
│   └── enrichment_rules[] #  array of {target_field, rule_type, config, description}
├── error_handling        # object — How must the adapter handle failure?
│   ├── retry_policy      #   object — {max_retries, initial_delay_ms, backoff_strategy, max_delay_ms, jitter, retryable_errors}
│   ├── circuit_breaker   #   object — {failure_threshold, half_open_after_ms, success_threshold}
│   ├── dead_letter       #   object — {enabled, topic, max_age_hours, description}
│   └── health_degradation # object — {degraded_after_failures, failed_after_failures}
├── integrity             # object — Hashing lock + AI agent governance (FHTS)
│   ├── hash_method       #   string — "sha256-c14n-v1" (normative)
│   ├── spec_hash         #   string — SHA-256 hex digest (excluded from own hash input)
│   ├── hash_state        #   enum — approved | modified | pending_review | reverted | unknown
│   ├── previous_hash     #   string | null — Hash before most recent change
│   ├── approved_by       #   string — Who approved current hash state
│   ├── approved_at       #   string — ISO8601 timestamp of approval
│   └── change_history[]  #   array of {previous_hash, new_hash, changed_at, source, changed_by, change_type, reason}
└── metadata              # object — Free-form; the only open section (adapter-specific material lives here); never inspected by the runner
```

Every other section is closed (`additionalProperties: false`). The enums, as the schema carries them today and the runner reads them (`FactsVocabulary`): `source_type` graphql_query, graphql_mutation, graphql_subscription, rest_get, rest_post, rabbitmq, mqtt, websocket, file, database, grpc_unary, grpc_stream, grpc_server_unary, grpc_server_stream · `collection_mode` poll, subscribe, backfill, write, push · `auth_methods` none, bearer_token, api_key, basic, oauth2, certificate, azure_entra_id, mtls, device_token · `rule_type` timestamp_to_shift, location_to_area, lookup, computed, static, enum_normalize, composite · lifecycle states REGISTERED, CONNECTING, HEALTHY, DEGRADED, FAILED, STOPPED · `type` INGESTION, BIDIRECTIONAL, WRITE_ONLY, DISCOVERY_ONLY · `tier` OT, MES_MOM, ERP_BUSINESS, HISTORIAN, DOCUMENT. The gRPC, `push`, mTLS/device-token and the two enrichment rule types were added on 2026-10-17 (FB-080) because live spokes already used them; the OT vocabulary waits on D-8.

## Runner

**Location:** `src/forge/governance/facts/runners/facts_runner.py`
**Class:** `FACTSRunner(FxTSRunner)`
**Status:** ✅ Implemented — `facts:schema-valid` plus 35 rule checks; enums read from the schema (FB-080)
**Tests:** `tests/governance/facts/test_facts_runner.py`, `test_specs_schema_valid.py` (every spec), per-spec modules

### Check Catalog

#### Static Checks (spec validation)

`facts:schema-valid` runs first. Every enum below is read from `facts.schema.json` at import (`FactsVocabulary`), so the runner and the schema cannot disagree (FB-080). A full spec yields 36 verdicts; checks marked *conditional* are emitted only when the section is present or only on failure.

| Check ID | Category | What it validates |
|----------|----------|-------------------|
| `facts:schema-valid` | Schema | Spec validates against `facts.schema.json` (JSON Schema 2020-12); one violation per offending JSON path |
| `facts:spec-version` | Identity | `spec_version` is `0.1.0` |
| `facts:identity-id-format` | Identity | `adapter_id` is kebab-case, 3–64 chars |
| `facts:identity-id-match` | Identity | `adapter_id` equals the run target |
| `facts:identity-name` | Identity | `name` is 1–128 chars |
| `facts:identity-version` | Identity | `version` is semver |
| `facts:identity-type` | Identity | `type` is in the schema enum |
| `facts:identity-tier` | Identity | `tier` is in the schema enum |
| `facts:identity-protocol` | Identity | `protocol` is non-empty |
| `facts:capabilities-read` | Capabilities | `read` is `true` |
| `facts:capabilities-<cap>-type` | Capabilities | each declared capability is boolean (*conditional*, on failure) |
| `facts:capabilities-valid` | Capabilities | summary when no capability check failed |
| `facts:lifecycle-startup_timeout_ms` | Lifecycle | integer 1,000–300,000 |
| `facts:lifecycle-shutdown_timeout_ms` | Lifecycle | integer 1,000–60,000 |
| `facts:lifecycle-health_check_interval_ms` | Lifecycle | integer 1,000–300,000 |
| `facts:lifecycle-restart-policy` | Lifecycle | `restart_policy` is in the schema enum |
| `facts:lifecycle-state-transitions` | Lifecycle | every `from`/`to` is a schema lifecycle state (*conditional*) |
| `facts:connection-params-present` | Connection | at least one param |
| `facts:connection-params-valid` | Connection | snake_case names, `type` in the schema enum |
| `facts:connection-auth-methods` | Connection | at least one method, each in the schema enum |
| `facts:data-contract-schema-ref` | Data Contract | `schema_ref` starts with `forge://` |
| `facts:data-contract-output-format` | Data Contract | `output_format` is in the schema enum |
| `facts:data-contract-context-fields` | Data Contract | `context_fields` is non-empty |
| `facts:data-contract-sources-valid` | Data Contract | `source_type` and `collection_mode` in the schema enums, ≥1 entity per source (*conditional*) |
| `facts:data-contract-sample-coverage` | Data Contract | `sample_record.context` carries every required context field (*conditional*) |
| `facts:context-mappings-present` | Context Mapping | at least one mapping |
| `facts:context-mapping-coverage` | Context Mapping | every required context field is mapped or enriched |
| `facts:context-mapping-no-orphans` | Context Mapping | mappings target declared fields |
| `facts:context-enrichment-valid` | Context Mapping | `rule_type` in the schema enum (*conditional*) |
| `facts:error-retry-policy` | Error Handling | `max_retries` 0–20, `initial_delay_ms` ≥100, `backoff_strategy` in the schema enum |
| `facts:error-circuit-breaker` | Error Handling | `failure_threshold` ≥1, `half_open_after_ms` ≥1,000 |
| `facts:metadata` | Metadata | `metadata` is a dict (free-form, never inspected) |
| `facts:integrity-present` | Integrity | integrity block present (SKIP when absent) |
| `facts:integrity-hash-format` | Integrity | `spec_hash` is 64-char hex |
| `facts:integrity-hash-state` | Integrity | `approved` passes; `modified`/`pending_review` fail with severity *warning* |
| `facts:cross-write-sources` | Cross-field | `write: true` needs a write source (`collection_mode: write` or `graphql_mutation`) (*conditional*) |
| `facts:cross-subscribe-sources` | Cross-field | `subscribe: true` needs a `subscribe` source (*conditional*) |
| `facts:cross-ingestion-read` | Cross-field | `INGESTION` type requires `read` (*conditional*, on failure) |

#### Live Checks (adapter instantiation, `live=True`) — planned; today the runner emits one `facts:live-not-implemented` SKIP

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

### forge-mes (Forge Manufacturing Execution System)

**Spec File:** `src/forge/governance/facts/specs/forge-mes.facts.json`
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
