# FACTS — Forge Adapter Conformance Test Specification

**Framework ID:** FACTS
**Full Name:** Forge Adapter Conformance Test Specification
**CI Gate:** Hard-fail (merge-blocking for production adapters)
**Status:** Schema v0.2.0 (a minor step of 2026-11-23, FB-079 and D-8: words for what FACTS could not say about an OT adapter, and nothing that had a word already; approved by the owner the same day). forge-ot's spec declares 0.2.0; the other eight stay on 0.1.0, which they declare. Schema v0.1.1 (a patch step of 2026-11-22 that corrects one description, FB-226; the nine specs stay on 0.1.0, which they declare). Schema v0.1.0 (vocabulary extended 2026-10-17, backward compatible), runner (`facts:schema-valid` + 35 rule checks whose enums are read from the schema) and 9 adapter specs; all 9 validate against the version they declare; 298 tests under `tests/governance/facts/`. No open gap in the specs
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

**Location:** `forge-core/contract/fxts/facts/schema/facts.schema.json`
**Status:** ✅ Implemented: nine specs, all hashed and approved by the owner

### Adapter Specs

State on 2026-10-17 (`FACTSRunner` over every module's `fxts/facts/`; "Runner" counts the 36-verdict set, `facts:integrity-hash-state` excluded):

| Spec | Tier | Data sources | Context mappings | Capabilities | Hash state | Runner |
|------|------|--------------|------------------|--------------|------------|--------|
| `forge-ims.facts.json` | MES_MOM | 8 (7 gRPC unary, 1 gRPC stream) | 12 + 2 enrichment | read, subscribe, backfill, discover | approved (no approver recorded) | pass |
| `forge-mes.facts.json` | MES_MOM | 18 (10 GraphQL, 1 mutation, 1 RabbitMQ, 2 MQTT, 1 WS, 2 REST, 1 database) | 15 + 3 enrichment | read, **write**, subscribe, backfill, discover | approved (reh3376) | pass |
| `forge-historian.facts.json` | HISTORIAN | 5 (4 REST, 1 WS) | 8 | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; was auto-approved, no approver) | pass |
| `forge-ot.facts.json` | OT | 8 (the five OPC UA client services, the alarm acknowledgement topic, two calls to the system it replaces) | 13 + 10 enrichment | read, **write**, subscribe, backfill, discover | approved (reh3376, 2026-11-23), on schema 0.2.0 | none: 38 of 38 checks pass (FB-079) |
| `forge-scanner.facts.json` | OT | 5 (3 gRPC server unary, 2 gRPC server stream) | 9 | read, subscribe, discover | pending_review (FB-080 re-stamp; was auto-approved, no approver) | pass |
| `forge-cmms.facts.json` | MES_MOM | 5 (3 GraphQL, 1 REST, 1 RabbitMQ) | 19 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by reh3376) | pass |
| `forge-integ-erp-netsuite.facts.json` | ERP_BUSINESS | 5 (3 RabbitMQ, 1 REST, 1 GraphQL) | 12 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by forge-governance-audit) | pass |
| `forge-nms.facts.json` | MES_MOM | 11 (10 REST, 1 WS) | 19 + 2 enrichment | read, subscribe, backfill, discover | pending_review (FB-080 re-stamp; previous hash approved by reh3376) | pass |
| `forge-wms.facts.json` | MES_MOM | 14 (9 GraphQL, 1 subscription, 3 RabbitMQ, 1 REST) | 11 + 3 enrichment | read, subscribe, backfill, discover | approved (reh3376) | pass |

The runner's first verdict is `facts:schema-valid` (JSON Schema 2020-12, one violation per offending path); the 35 rule checks that follow read their closed value sets from the schema's enums, so the two cannot drift (FB-080). `tests/governance/facts/test_specs_schema_valid.py` validates every file in `specs/` in CI; the OT spec is a strict xfail there until FB-079. Adapter-specific material the contract has no slot for — routing rules, cross-module flows, scan rejection, pre-FHTS history notes — lives under `metadata`, which the schema leaves free-form and the runner never inspects. Only the owner approves a hash (`approve_spec_hash(approved_by="reh3376")`); agents re-stamp as `pending_review`. Five specs await that approval after FB-080 moved their out-of-contract fields to `metadata` (content changes; adapter behaviour unchanged). Per-spec test modules exist for forge-wms, forge-mes and forge-ot.

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
│   ├── schema_ref        #   string — contract ref forge://schemas/<spoke>/v<version> (forge_core.schema_ref)
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
├── time_governance       # object — How is this spoke time-governed? (one clock, FB-090; required)
│   ├── time_source       #   enum — hub-ntp | site-ptp | gnss
│   ├── sync_protocol     #   enum — ntp | ptp-cip-sync | ptp-802.1as | profinet-ptcp | none (none fails)
│   ├── clock_read_method #   enum — opcua-response-header | opcua-current-time | cip-wall-clock-time | s7-clock | modbus-registers | sparkplug-payload-timestamp (required when the protocol offers one)
│   ├── clock_probe_interval_seconds # number ≥1 — default probe cadence (30), adjustable per connection at runtime
│   ├── source_timestamp_origin #   enum — device | server | edge | forge
│   ├── tolerance_class   #   enum — T0..T5 | it-lan | it-wan | edge-mqtt (one-clock record P-8)
│   ├── fail_closed       #   const true
│   └── connections[]     #   optional array of per-connection declarations {name, clock_read_method?, clock_probe_interval_seconds?, source_timestamp_origin?, tolerance_class?}
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

Every other section is closed (`additionalProperties: false`). The enums, as the schema carries them today and the runner reads them (`FactsVocabulary`): `source_type` graphql_query, graphql_mutation, graphql_subscription, rest_get, rest_post, rabbitmq, mqtt, websocket, file, database, grpc_unary, grpc_stream, grpc_server_unary, grpc_server_stream, opcua_browse, opcua_read, opcua_subscribe, opcua_history_read, opcua_write · `collection_mode` poll, subscribe, backfill, write, push, on_demand · `auth_methods` none, bearer_token, api_key, basic, oauth2, certificate, azure_entra_id, mtls, device_token · `rule_type` timestamp_to_shift, location_to_area, lookup, computed, static, enum_normalize, composite, opcua_property_read · lifecycle states REGISTERED, CONNECTING, HEALTHY, DEGRADED, FAILED, STOPPED · `type` INGESTION, BIDIRECTIONAL, WRITE_ONLY, DISCOVERY_ONLY · `tier` OT, MES_MOM, ERP_BUSINESS, HISTORIAN, DOCUMENT. The gRPC, `push`, mTLS/device-token and the two enrichment rule types were added on 2026-10-17 (FB-080) because live spokes already used them. Schema 0.2.0 (2026-11-23, FB-079, D-8) added the OPC UA client services, `on_demand`, the parameter types `enum` and `object`, and `opcua_property_read`. The rule the owner set for it: the schema gains a word only for a meaning it could not express; where it has a word, a spec uses that word (`none` and not `anonymous`, the six module states and not a connection's states), and what is not a source of data is not listed as one.

### Time governance (one clock, FB-090)

Every spoke declares how it is time-governed, because records from different sources only reconcile if their stamps come from one master time (owner's principle, 2026-10-18; `docs/decisions/one-clock-ot-source-time.md`, signed 2026-11-03). The section is **required**: a spec without it fails `facts:time-governed`, and a party whose clock is outside its class for three consecutive probes is refused (FB-093: enforced on the OT module's PLC connections since 2026-11-15, each held to the `tolerance_class` its `connections[]` entry or the section declares; the hub measures a spoke two-way since FB-092, 2026-11-15, and since FB-093's hub half, 2026-11-17, refuses the Register and the Ingest of a spoke that is outside its class or reports no measurement for three probes, and the Register of a manifest without this section). The declaration also drives the hub's behaviour at runtime: `source_timestamp_origin` is the rule FB-088 applies to a value that arrives without a source stamp (only `forge` lets Forge's read time stand in), `clock_probe_interval_seconds` is the default cadence the operator adjusts per connection, and `tolerance_class` is the limit the measured offset is held to. A spoke whose connections are site configuration (the OT module) declares its defaults here and each connection's own origin and cadence in its connection configuration (`PlcConnectionSpec`), which must agree; a spoke that knows its connections statically lists them in `connections[]`. The deployment requirement behind the section is `forge-hub/docs/clock-discipline.md`.

The same section rides on the adapter manifest (`AdapterManifest.time_governance`, proto field 13) and is what the adapter base, the OT module and the ingest pipeline read for the stamp origin. Connection configuration must agree with it: a `source_timestamp_origin` connection parameter that contradicts the declaration is refused when the adapter is configured (`TimeGovernanceConflictError`, counted on the health as `time_governance_conflict`), one that repeats it passes.

## Runner

**Location:** `forge-core/src/python/forge_core/fxts/facts/runners/facts_runner.py`
**Class:** `FACTSRunner(FxTSRunner)`
**Status:** ✅ Implemented — `facts:schema-valid` plus 35 rule checks; enums read from the schema (FB-080)
**Tests:** `forge-core/tests/fxts/facts/` (the runner and the schema); `tests/governance/facts/test_specs_schema_valid.py` (every spec) and the per-spec modules, which move with their modules

### Check Catalog

#### Static Checks (spec validation)

`facts:schema-valid` runs first. Every enum below is read from `facts.schema.json` at import (`FactsVocabulary`), so the runner and the schema cannot disagree (FB-080). A full spec yields 36 verdicts; checks marked *conditional* are emitted only when the section is present or only on failure.

| Check ID | Category | What it validates |
|----------|----------|-------------------|
| `facts:schema-valid` | Schema | Spec validates against `facts.schema.json` (JSON Schema 2020-12); one violation per offending JSON path |
| `facts:spec-version` | Identity | `spec_version` is a released version of the schema |
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
| `facts:data-contract-schema-ref` | Data Contract | `schema_ref` is a contract ref, `forge://schemas/<spoke>/v<version>` (or a version ref of one of its schemas); the schema's `pattern` holds the same grammar (FB-008) |
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
| `facts:time-governed` | Time Governance | section present; every enum in the schema; `sync_protocol` is not `none`; `fail_closed` is `true`; `clock_probe_interval_seconds` ≥1; `clock_read_method` is one the spoke's protocol can perform and is declared when the protocol offers one (opcua, cip/ethernet-ip/logix, s7, modbus, sparkplug); each `connections[]` entry names its connection and obeys the same rules. **Blocking** (one clock, FB-090; `docs/decisions/one-clock-ot-source-time.md` P-7) |
| `facts:metadata` | Metadata | `metadata` is a dict (free-form, never inspected) |
| `facts:integrity-hash-format` | Integrity | `spec_hash` is 64-char hex |
| `facts:hash-verified`, `facts:hash-approved`, `facts:schema-current` | Integrity | the three verdicts every framework gets from the shared runner (D-14, F-4, F-10): the hash covers the content, the owner approved it, and the schema version it records stands. A spec with no integrity block fails the first two |
| `facts:cross-write-sources` | Cross-field | `write: true` needs a write source (`collection_mode: write` or `graphql_mutation`) (*conditional*) |
| `facts:cross-subscribe-sources` | Cross-field | `subscribe: true` needs a `subscribe` source (*conditional*) |
| `facts:cross-ingestion-read` | Cross-field | `INGESTION` type requires `read` (*conditional*, on failure) |

#### Live Checks (adapter instantiation, `live=True`): not built. Every run gives one `facts:live` verdict, `NOT_RUN`, so no adapter spec's run passes: nothing compares a spec with the module's code (BACKLOG FB-271)

| Check ID | What it validates |
|----------|-------------------|
| `facts:live-manifest-match` | Adapter's `manifest` attribute matches spec declarations |
| `facts:live-configure` | `configure()` succeeds with spec connection params |
| `facts:live-start-stop` | `start()` → HEALTHY → `stop()` → STOPPED transitions |
| `facts:live-health` | `health()` returns valid `AdapterHealth` |
| `facts:live-collect` | `collect()` yields at least one `ContextualRecord` |
| `facts:live-context-fields` | Collected records contain all required context fields |
| `facts:live-capability-interfaces` | Declared capabilities have matching interface implementations |

### Usage

```bash
# Static validation: by adapter_id (looked up in each module's fxts/facts) or by file
forge governance run facts forge-wms
forge governance run facts path/to/forge-wms.facts.json

# Live validation (instantiates and exercises the adapter)
forge governance run facts forge-wms --live

# JSON report (also printed with --format json)
forge governance run facts forge-wms --output reports/facts-forge-wms.json
```

The command exits 1 when any check fails and prints the failed checks with their violations; the first verdict is always `facts:schema-valid`.

Spec integrity is on the CLI already (FB-021): `forge governance specs --pending` lists what awaits approval, `forge governance stamp <spec> --by <who> --reason <why>` re-hashes an edited spec, `forge governance approve <spec> --by <owner>` records the owner's approval, and `forge governance validate-spec <path>` checks a file against this schema.

## First Adapter Specs

### forge-wms (Forge Warehouse Management System)

**Spec File:** `forge-modules/forge-wms/fxts/facts/forge-wms.facts.json`
**Tier:** MES_MOM
**Protocol:** graphql+amqp
**Capabilities:** read, subscribe, backfill, discover (no write)

Data sources:
- GraphQL API (100+ queries, 80+ mutations) — barrel, lot, customer, storage, events
- RabbitMQ topics (`wh.whk01.distillery01.*`) — 60+ ERP sync topics
- GraphQL Subscriptions — printer status, sync progress

Context fields: `manufacturing_unit_id` (barrel), `lot_id`, `physical_asset_id` (storage location), `business_entity_id` (customer), `event_timestamp`, `event_type`

### forge-mes (Forge Manufacturing Execution System)

**Spec File:** `forge-modules/forge-mes/fxts/facts/forge-mes.facts.json`
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

## Integrity

Whether a spec carries a hash, whether it verifies and whether the owner approved it are the two verdicts every framework gets from the shared runner since 2026-11-18 (D-14): `facts:hash-verified` and `facts:hash-approved`. FACTS's own `integrity-present` and `integrity-hash-state` said the same less strictly and were removed on 2026-11-19; `facts:integrity-hash-format` stays. A FACTS spec edited after its approval now fails its run.
