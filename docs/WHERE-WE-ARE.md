# Where we are

**Status date:** 2026-11-26 · **Branch:** `reh3376_dev01` (last merged PR: 199) · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) · [Where we are going](WHERE-WE-ARE-GOING.md) · [Roadmap](ROADMAP.md) · [Backlog](../BACKLOG.md)

**Pick-up point (2026-11-26): the design of the security framework's first step is signed as D-23 (`docs/decisions/trust-root-step1.md`, PR 190); the framework is signed as D-21 (PR 187), with its chapters D-20 (approval signing) and D-22 (permissions); of it only the offline half of step 1 is built (`forge_core.trust`, PR 192).** Asked why approvals should rest on one key on one machine, the owner had the design taken to production grade: one framework for identity, sign-in, sessions, permissions, machine identity, secrets, audit, release integrity, signing and the trust anchor, IEC 62443 SL-C 3 mechanisms with SL 3 production's default, development only different data on it. Six adversaries attacked it; their findings are folded in. On the owner's word every human-set expiry was engineered out: freshness is a nonce-bound, signed exchange inside the one-clock exchange, with witnesses (D-21 §14), proved by TLA+ (`docs/decisions/models/freshness/`) and a fleet simulation. Two findings are live defects in today's code. FB-291 is fixed and merged (PR 188): the hub's flags are read by one boolean rule (`forge_core.coerce`), an unclear value stops the hub, tokens must name their expiry, issuer and audience, an unknown role is a 401, no wildcard reaches a hard-limited permission, and authentication's state is on `/v1/info` and `/readyz`. FB-292 is fixed and merged (PR 189): session ids are unguessable and bound to the connection identity that opened them, every Ingest names its module and session with no fallback, and a second Register cannot take over a running module (a stale session is replaced; the same certificate may restart at once). FB-296 is fixed and merged (PR 191): the hub's switch for client certificates was read by truthiness, so with a CA set an unclear word such as `enabled` turned client certificates off without a word; it is read by the one boolean rule now, requiring client certificates with no CA stops the hub at start, and the guard against string-compared flags reads the syntax tree, so the two-line form it missed is caught. D-23 designs step 1, the trust root and identities; three adversaries proved 27 faults in its first draft, and each fix is in the record. It has two roles of root: the owner's FIDO2 keys are the authorities, three of them with any two required, and X.509 certificate roots sit apart. The online keys are on a YubiHSM 2, which the development containers reach through its connector. Every key is generated on its device and attested. One certificate issuer in Python serves the manager and every hub. Enrolment is signed by approvers and checked against a governed allow-list of security-key models, and the identity store is an append-only log. It amends D-21 §10 (three keys), SF-2 (a `test` stage for CI) and §11 (step 1 as two pull requests), and answers D-17 C-6 (the manager is its own layer, `forge_manager`). Step 1a of FB-293 is built and merged (PR 192): `forge_core.trust` answers "is this certificate real?" offline. The certificate profile is the governed list `certificate-roles`; the issuer builds every certificate from it and refuses any request outside it; the verifier checks the chain against the anchor's roots and listed hub intermediates, every profile field, the signatures, the ids and the time, and its Go twin (`forge-core/src/go/trust`, standard library only) gives the same cause on the same 41 vectors and 31 edge chains (a differential probe of the two found four faults in the Python side, an id with a trailing newline among them, all closed); keys sign through PKCS#11 on a device (SoftHSM under the `test` stage, in CI too). Law 1 is checked over every single fault, every pair and the issuer's whole request space (which found and closed a root that could cross-sign another); laws 3 and 4 as far as 1a holds them; `.claude/skills/verify-trust-certificates` and `verify-trust-anchor` say how. The list format moved to 0.2.0 (evidence marks, the trust root's entry shapes), so every list declares it. How Forge installs is designed and signed as D-24 (`docs/decisions/installation-and-devices.md`, 2026-11-25, PR 193; FB-302): the person installing stands up forge-core and the top hub, and every site's hubs and modules are installed through forge-core, rolling down the chain one layer at a time, each hub mirroring its children's images; a release is a numbered manifest naming every image by digest and every component inside, signed by two of the vendor's devices after a second build reproduces it; only listed images are admitted; each service that signs has a `forge-signer` container beside it, the only holder of its device, answering typed requests by scope; one host setting on device nodes; active and standby replicas; development on Docker Desktop's Kubernetes with a software TPM. It amends D-23 T-2, T-3, T-5, T-10, D-20 SG-4 and D-21 §14 FR-2. Its build is FB-231 first, then FB-305 to FB-313; a FIPS edition of the image for regulated sites is FB-303. FB-311 is built (this change): the anchor's form holds two freshness keys in place of one (D-24 Q-7), so forge-core's manager can run an active and a standby, each with its own device. A production anchor holds two; a development or test anchor on one machine may hold one; one key listed twice is refused however its lines are broken; Python and Go refuse and accept the same documents, and the form stays `forge-anchor/1` because no anchor exists yet. Building it showed that the anchor's distribution and freshness keys are held only to the shape of a PEM block, never read as keys (a certificate passes as a freshness key): FB-317, to settle before genesis. FB-315 is fixed and merged (PR 199): the development stack starts. Migration 004 enabled TimescaleDB unconditionally, which plain Postgres refuses, so the init container failed and the hub never started through Compose; it now follows migration 006's rule (the extension only where it is available, hypertables only where it is enabled), a test holds every migration to it, and CI's `hub-image` job starts the whole stack with the image it built. Running the init container also showed that FB-312 had left its entrypoint out of the unprivileged user's reach (a folder mode); fixed, and the image's smoke check reads it. The cleaner shape, one migration chain per database, is FB-316. FB-312 is built and merged (PR 195): the hub image and the development stack name every image by digest and every GitHub Action by commit SHA, Dependabot keeps both current, and a test refuses a floating reference; the runtime image installs nothing with apt, runs as an unprivileged user (uid 10001) with every file readable to it, has no empty entry on its import path, and carries its init entrypoint; proved by building it and running the stack, the hub healthy as that user. Running it found two older faults: MinIO and Bitnami's Kafka no longer publish images (Kafka moved to Apache's own image; MinIO's replacement is FB-314), and `forge-init` fails on migration 004 against plain Postgres (FB-315). FB-231 is built and merged (PR 194): CI's `hub-image` job builds the hub image natively for amd64 and arm64 whenever something it is built from changes, proves it from inside (every package root imports as a real package, the hub app loads, `forge --help` runs) and writes a build record, the image's digest and BuildKit's provenance naming each base image by the digest pulled, which D-24's release manifest (FB-305) will name. Next: D-24's build items (FB-305 to FB-313), and step 1b (the manager service `forge_manager`, the identity log, signed enrolment and the genesis ceremony on the real keys) once the owner has the three YubiKey 5 keys and the YubiHSM 2. D-19 step 3's half-built code is saved outside the tree and resumes as its step 5. Run on every governed spec today, 0 runs pass, 63 are incomplete and 1 fails (D-19 step 2: no claim has a check of the real thing yet).

This page is the honest snapshot: what exists in the repository today, what is wired end to end, what is governed, and what is missing against [`VISION.md`](VISION.md). It is updated before every push that changes the state it describes (rule of 2026-10-16: documentation is current before every push). Numbers are from the tracked tree at the status date; "exists" means code is present, "wired" means it runs in the deployed hub, "governed" means a spec and a gate cover it.

---

## 1. In five lines

1. The **hub ↔ spoke contract works end to end**: a spoke registers, is checked against its FACTS spec, pushes records that are persisted, is pulled (Collect/Backfill/Subscribe) and receives write-backs, over TLS/mTLS both ways with per-spoke tokens.
2. The **OT module runs inside the hub** with OPC-UA connections, a tag engine, the full control-write defense chain (the ISA-18.2 alarm package exists but the host does not compose it yet, FB-115), and drives the MES changeover sequence including the PLC CIP runner.
3. **forge-mes is Go and not yet built**: the imported NestJS backend and Next.js frontend stand in as the interim bridge and speak the spoke contract; the Go rewrite (FB-076) is decided and designed (`docs/decisions/forge-mes-go.md`, signed 2026-11-03); the Go SDK scaffold is its first step.
4. **Six frameworks have a runner** (FATS, FACTS, FTTS, FVTS, FMTS and FUTS); the other seven are planned. **A passing spec does not yet prove that the real thing agrees with it** (the audit of 2026-11-23, `forge-core/docs/fxts/AUDIT-2026-11-23.md`; FB-264 to FB-274): of the runs on every governed spec, 17 pass, 46 are incomplete and 1 fails. CI runs the gate (`forge governance check`), which lets those gaps through only because the owner accepted each of them (FB-266). forge-display does not exist yet; its contract (FVTS) does, with a runner and golden messages.
5. **Not yet**: scoped roles in the gateway, `mod_mes` in the hub, the Go module SDK, the hub-of-hubs federation, Kubernetes, and any management module in Go.

---

## 2. Numbers

| Measure | Value |
|---|---|
| Python: forge-core (`forge-core/src/python/forge_core`) | 132 files, ~29,800 lines |
| Python: forge-hub (`forge-hub/src/python/forge_hub`) | 90 files, ~17,300 lines |
| Python: the modules (nine packages under `forge-modules`) | 144 files, ~31,400 lines |
| Python tests | 303 files, ~70,700 lines, 4,843 test functions (6,582 collected); full suite green on 2026-11-26 on the locked dependency set (6,577 passed, 5 skipped, no expected failure) |
| Go (`forge-core/src/go/`) | 37 files, ~12,600 lines (2,078 of models and 1,665 of their tests, 2,114 of the certificate verifier and its tests, 112 scaffold, generated bindings, 58 lines of daemon/CLI stubs); `gofmt`, `go vet` and `go test` gate CI |
| Interim MES bridge (`forge-modules/forge-mes/bridge`; NestJS + Next.js until the Go forge-mes lands, FB-076) | ~249,000 lines of TypeScript in `backend/src` and ~87,000 in `frontend` (FB-028 removed 93 unused files there; the earlier single figure of ~248,000 was the backend alone) |
| `AdapterService` RPCs | 12 (Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover) |
| Hub REST routes | 41 on the hub app (20 platform, 12 Context Engine, 9 Schema Registry; state changes behind `adapters:write`, `context:write` or `schemas:write`), plus OT i3X (8) and OT control (16; every POST behind `adapters:write`), plus the curation app mounted at `/curation` |
| Storage migrations | 12 (core schema, spoke schemas, canonical, TimescaleDB, lineage, contextual records, adapter registry, module permissions, registry and equipment tables, data-product curation spec, contextual-record context columns, spoke roles without login) |
| FACTS specs | 9, every one with the required `time_governance` section (FB-090); all 9 validate against the schema version they declare and pass the runner's rule checks (forge-ot on 0.2.0 since FB-079, the others on 0.1.0); all 9 approved by reh3376 on 2026-11-13 after the FB-090 re-stamp (`forge governance specs`) |
| FATS specs | 28 (one per route the hub app serves; the hub test holds both directions) |
| FVTS specs | 1: the hub's own (`forge-hub.fvts.json`, approved). The sample fermenter contract the framework's tests use is a test fixture, no module's spec (FB-078) |
| CI jobs | hub-python (installs from `uv.lock` with `uv sync --locked`, FB-096), hub-go, mes-module, secrets-scan, all four required on `main`; hub-image (amd64 and arm64, FB-231: builds the hub image, proves it from inside and records its digest and provenance), not yet required; hub-go, mes-module and hub-image always report but run their steps only when the branch touches what they check (FB-173, 2026-11-19); auto-PR workflow; Deploy Tutorial workflow (Node 22; runs the framework's tests, builds the deck and its two gates on every push that touches it, publishes `main` to GitHub Pages at https://reh3376.github.io/forge/; Pages enabled 2026-10-28) |
| Commits | 1,944 (includes the imported MES history) |

---

## 3. Component by component

Legend: ✅ exists and wired · 🟡 exists, partly wired or partly governed · ⬜ not started. Gaps name the backlog item.

### 3.1 Transport and ingest

| Capability | State | Notes |
|---|---|---|
| gRPC `AdapterService`, Python and Go bindings | ✅ | `forge-core/contract/proto`, `forge-hub/src/python/forge_hub/link`, `forge-core/src/go/gen/forge`; `RecordContext` carries the context field registry's slots (`shift_id`, `event_type`, `event_timestamp`, `work_order_id`) since FB-013 |
| TLS / mTLS hub → spoke and spoke → hub | ✅ | FB-063, FB-072 |
| Per-spoke callback token, scoped hub endpoints | ✅ | FB-063 |
| Push persisted and FACTS-checked at Register | ✅ | FB-053; `forge_hub.ingest`, `forge_hub.ingest.facts_check` |
| Pull: Collect, Backfill, Subscribe/Unsubscribe on the spoke | ✅ | FB-061, FB-071 |
| Hub → spoke write-back (session-bound callback) | ✅ | FB-054 |
| Durable adapter registry and ingest log | ✅ | FB-060, migration 007 |
| FTTS transport spec and runner | ✅ | Schema + runner exist; page `forge-core/docs/fxts/FTTS.md` (2026-11-19); spec at `forge-hub/fxts/ftts/grpc-hardened-transport.ftts.json`, hashed and approved by the owner on 2026-11-18; the transport contract it should become is signed and not built (D-15, FB-164) |
| Transport parity tests for the Go module | ⬜ | FB-055 |
| Hub is the time authority for its spokes and child hubs; skew measured at every link and enforced | 🟡 | Measured and exposed since FB-089 (2026-10-20): offset per adapter and link (spoke, server, source) from every record and from the OPC-UA probe's `CurrentTime`, on `AdapterHealth.clock`, `GET /v1/ingest/stats`, the OT connection status and OpenTelemetry (`forge.clock.offset`, `forge.clock.out_of_tolerance`), one warning per entry into breach of the provisional `FORGE_CLOCK_TOLERANCE_SECONDS` (1 s). Since FB-094 step 2 (2026-11-13) every OPC-UA service response measures the server's clock too (the response-header tap), the probe cadence is a per-connection runtime setting, and each series is keyed by the clock measured (`clock_id`). Enforced on the OT links since FB-093's OT half (2026-11-15: a PLC connection unreadable or outside its class for three probes is refused); hub time in the contract since FB-092 (2026-11-15: the four-timestamp exchange on Register, Health and Ingest; a spoke that reports it is measured two-way and held to its declared class); enforced on the spoke link since FB-093's hub half (2026-11-17: every Register, Health and Ingest request is a probe of the spoke's clock; three probes outside the class, or three with no measurement, refuse the spoke's Register and Ingest until three good probes; a manifest without `time_governance` is refused; the refusal is on the spoke's `AdapterHealth`, the API, the CLI, the log and the metric); the hub's REST ingest carries no exchange and is to be retired (FB-123); no hub → hub link (FB-118); D-9 signed 2026-11-03 (per-link tolerance classes, six record fields, fields first then the exchange, never silent), implementation in the record's step order. Recorded 2026-11-15: nothing checks a Forge host's own clock (FB-119), the IT spokes do not read their source system's clock (FB-120), only OPC UA has a clock reader (FB-117), and the time chain between hubs waits for the hub of hubs (FB-118) |
| Hub stamps `ingestion_time` with its own clock on receipt (gRPC push, pull, REST); the spoke's own send time is `spoke_time`, none invented | ✅ | `IngestPipeline.ingest` → `stamp_receipt`, one hub-clock reading per batch (FB-087, 2026-10-20); `spoke_time` is on the wire since FB-092 (2026-11-15, proto field 10; it was the hub-local `sent_time`), stamped by the spoke as a record leaves, and a send time an older spoke puts in `ingestion_time` is moved there on receipt |
| No record builder invents a source time: a value without a source stamp is refused unless its connection declares `source_timestamp_origin: forge`; then Forge's read time stands in and the record says so (`source_clock`, `source_uncertainty_seconds`); the refusal is on health, status, API, CLI and the `forge.ingest.refused` metric | ✅ | FB-088 (2026-11-13, D-9 step 1): `forge_core.clock.resolve_source_stamp` behind the OPC-UA converter and tag registry, the nine adapters and the IMS collectors, the Ignition bridge, `IngestPipeline.coerce` and the interim MES bridge mapper; the declaration is the FACTS `time_governance` section on the manifest since FB-090 (2026-11-13; a connection parameter that contradicts it is refused at configure, the OT module's per-connection spec refines it); at rest the hypertable still keeps only `source_time` (FB-108) |
| Every spoke declares how it is time-governed (time source, sync protocol, clock-read method, probe cadence, stamp origin, tolerance class, fail closed, per-connection entries); the check is blocking and the deployment requirement is written down | ✅ | FB-090 (2026-11-13, D-9 step 4): required FACTS `time_governance` section and `facts:time-governed`; `AdapterManifest.time_governance` on the wire (proto field 13; Python, Go, bridge) and in every adapter's `manifest.json`; all nine specs re-stamped and approved by the owner; `forge-hub/docs/clock-discipline.md`; enforcement is FB-093 (the OT links since 2026-11-15; the spoke link next, on FB-092's two-way measurement) |
| Every timestamp Forge stores is UTC and timezone-aware; a naive datetime or an offset-less string is rejected at the model | ✅ | `forge_core.clock` (`utc_now`, `require_utc`, `OneClockModel`) behind `RecordTimestamp`, every manufacturing entity, `DataProduct` and the decision models; no `utcnow` left; ruff `DTZ` blocking (FB-014, 2026-10-20). The OT module's `DataValue`/`TagValue` still coerce naive to UTC (OPC UA `DateTime` is UTC by definition) and the adapters read an offset-less source string as UTC (FB-090's `time_governance` section has no field for the offset a spoke assumes; that declaration goes with FB-091) |

### 3.2 Hub platform

| Capability | State | Notes |
|---|---|---|
| Hub REST API (adapters, records, writes, subscriptions, backfill, collect, ingest log, info/health) | ✅ | `forge-hub/src/python/forge_hub/api/main.py` |
| Curation service mounted | ✅ | `/curation`; one curation engine builds each data product's pipeline from its `CurationSpec` and runs it on ingest for the published products the adapter feeds, curated records persisted with the raw ones (FB-009, 2026-10-22) |
| Context Engine (F21) and Schema Registry (F20) | ✅ | Served by the hub under `/v1/context` and `/v1/schemas` (FB-001); Postgres stores through the factory, migration 009 (FB-005); both 2026-10-22 |
| Gateway: auth, RBAC, rate limiting | 🟡 | Middleware exists; auth off by default; only state-changing routes carry a scope (`adapters:write`, `context:write`, `schemas:write`), reads are open (FB-007) |
| Access controller persistence | ✅ | `PersistentAccessController` over `forge_core.module_permissions` / `access_audit` (migration 008), handed out by the storage factory and run by `forge db access` (FB-003, 2026-10-22) |
| Registry/equipment tables in Postgres | ✅ | Migration 009 (FB-005, 2026-10-22) |
| Observer | 🟡 | Package exists; no SLO/FOTS wiring |
| CLI `forge` | ✅ | adapter list/status, governance specs/stamp/approve/run/validate-spec and the schema commands (schemas, schema-diff, schema-release, schema-approve, migrate-spec), migrate up/status/down, db access grant/revoke/list/issue |

### 3.3 Storage

| Capability | State | Notes |
|---|---|---|
| Engines: PostgreSQL, TimescaleDB, Neo4j, Redis | ✅ | `forge_hub.storage.engines` |
| Storage router and factory | ✅ | |
| Schema references: one grammar (`forge://schemas/<spoke>[/<Entity>][/v<version>]`), three roles, held at every boundary | ✅ | `forge_core.schema_ref` (FB-008, 2026-10-22); the two registries themselves are not converged: FB-097's design record, `docs/decisions/one-schema-registry.md` (D-10), signed 2026-11-03; its eight steps follow |
| Versioned migrations (12) | ✅ | Online runs through asyncpg on SQLAlchemy's async engine (FB-003); 008 replaces the two 001 tables it had collided with; 011 gives `forge_ts.contextual_records` one column per `RecordContext` slot (FB-013); 002's downgrade drops what each spoke role holds before the role, so a full downgrade runs to base (FB-098, 2026-10-26); 002 creates the spoke roles `NOLOGIN` and 012 closes the placeholder login on a database that applied 002's earlier text, unless Forge issued the role (FB-099, 2026-10-26); 006's downgrade removes the `forge_ts` schema, so a downgrade to base leaves only Alembic's version table (FB-101, 2026-10-27; FB-100 recorded, waits on FB-057 step 2) |
| Forge-issued module database credentials (`forge db access`) | ✅ | FB-057 step 1, migration 008, on the persistent controller since FB-003; password printed once, never stored |
| `mod_mes` schema in the hub (MES data moves in) | ⬜ | FB-057 steps 2–5, after the FB-076 design |
| Backups, restore procedure | ⬜ | No backlog id yet |

### 3.4 Spokes (adapters)

| Spoke | Code | FACTS spec | Notes |
|---|---|---|---|
| forge-wms | ✅ 772 lines | approved (reh3376, 2026-11-13; FB-090 re-stamp) | reference spec |
| forge-mes | ✅ 1,078 lines + the NestJS spoke | approved (reh3376, 2026-11-13; FB-090 re-stamp) | 18 data sources incl. AuditLog backfill (FB-071) |
| forge-cmms | ✅ 810 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | cross-module flows and pre-FHTS history moved to `metadata` |
| forge-integ-erp-netsuite | ✅ 769 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | same |
| forge-nms | ✅ 853 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | pre-FHTS history moved to `metadata` |
| forge-ims | ✅ 1,909 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | gRPC source types now in the schema |
| forge-historian (historian) | ✅ 801 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | dead-letter keys renamed to the schema's |
| forge-scanner | ✅ 1,403 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | own proto under `proto/scanner`; routing rules and scan rejection moved to `metadata` |
| forge-ot | ✅ (the OT module itself) | approved (reh3376, 2026-11-23; written against FACTS 0.2.0, FB-079) | none: 38 of 38 checks pass; the adapter, its manifest file and the spec are one identity, held by a test |
| csv_file, mqtt_sparkplug, opcua, rest_generic | ⬜ | — | package stubs only (one-line `__init__`) |

The FACTS runner validates every spec against the JSON schema first (`facts:schema-valid`, FB-080) and reads its enums from the schema; all 9 specs validate. Schema 0.2.0 (2026-11-23, FB-079, D-8) added the words an OT adapter needs and nothing that had a word already.

### 3.5 OT module (forge-ot)

| Capability | State | Notes |
|---|---|---|
| OPC-UA client (asyncua), tag engine, context resolvers | ✅ | `forge_ot.opcua_client`, `tag_engine`, `context`; asyncua pinned `==2.1.0` (FB-085) |
| Tag `source_time` is device time corrected to master by the device's measured clock offset, original stamp and offset recorded | ✅ OPC UA | Since FB-094 step 3 (2026-11-13) the OT builder corrects the source and server stamps by the declared clock's filtered offset where they enter the spoke, and the record keeps the stamp as sent, the offset, the uncertainty and the time quality (all six P-3 fields); the clock is read on every OPC-UA response and on the runtime probe cadence (step 2), and no source time is invented (FB-088). Every value carries its sampling bound (step 6: `max_sampling_uncertainty_ms` per tag, a tighter requirement refused at load). The FACTS declaration is in since FB-090 (2026-11-13) and the refusal since FB-093's OT half (2026-11-15: `CLOCK_UNREADABLE` and `CLOCK_OUT_OF_TOLERANCE` after three consecutive probes against the link's tolerance class, the provider stopped, reads and writes refused, no restart loop, three good probes to resume, the cause on the status, the health, the API and an alarm). Remaining: Logix, S7 and Modbus readers follow their drivers. Design record `docs/decisions/one-clock-ot-source-time.md` drafted 2026-10-21, signed 2026-11-03 |
| ISA-18.2 alarming (state machine, detector, engine, integrations, API) | 🟡 | `forge_ot.alarming`: the package exists and is tested, but the hub's OT host composes no `AlarmEngine`, so it does not run in the deployed hub (FB-115, found 2026-11-15) |
| Control writes: validation → review → interlocks → authorization → write with read-back → audit | ✅ | `forge_ot.control`; audit in the hub store and an external MQTT publisher (FB-066, FB-067) |
| MES changeover: orchestrator, PLC CIP runner, recipe integration, REST | ✅ | FB-062, FB-065 |
| Hosted in the hub with PLC connections, supervision, liveness | ✅ | FB-069, FB-070; `forge_ot.host` |
| i3X REST shape, MQTT ingress, Ignition bridge (read-only parallel run) | ✅ | `i3x`, `mqtt`, `bridge` |
| Scripting SDK replacing `system.*` | ✅ | `forge_core.sdk.scripting` |
| Server-side two-step review and reason codes for writes | ✅ | FB-074 (2026-10-17): `WriteReviewer`, stage/commit REST behind `adapters:write`, `REJECTED_REVIEW`; multi-party approval follows FB-075 (D-1 signed 2026-11-03) |
| OT control changeover/connection POST endpoints behind a hub scope | ✅ | FB-082 (2026-10-17): `adapters:write` on confirm-start, retry-recipe, resume and connection restart; the hub user is the actor on the MES write, audit record and events |
| Batch context resolver wired to MES | ⬜ | FB-020 |
| One adapter identity: the adapter in code, the module's manifest file and the FACTS spec agree on id, version, tier, record format and context fields | ✅ | FB-079 (2026-11-23); `tests/governance/facts/test_ot_module_spec.py` |

### 3.6 forge-mes

| Capability | State | Notes |
|---|---|---|
| NestJS backend + Next.js frontend imported as the bridge | ✅ | `forge-modules/forge-mes/bridge`; spoke speaks the contract (push, pull, Collect, token, TLS) |
| Go rewrite from the module SDK | ⬜ | FB-076; design record signed 2026-11-03 (D-3, `docs/decisions/forge-mes-go.md`): ten steps, the Go SDK scaffold (FB-017) first |
| Prisma data into the hub's `mod_mes` | ⬜ | FB-057 steps 2–5 |
| Frontend retired in favour of forge-display | ⬜ | after forge-display exists |

### 3.7 Module SDK and Go

| Capability | State | Notes |
|---|---|---|
| Python module builder (manifest builder, scaffolder, generators, `forge module init`) | 🟡 | Adapter-style, backend-only templates (FB-017); duplicate SDK copies drift (FB-019) |
| Go models mirroring the core models | ✅ | `forge-core/src/go/internal/models` (2,078 lines, 1,665 of tests; the time exchange and `spoke_time` since FB-092); `Lot.item_id` (FB-010) and the `RecordContext` slots (FB-013) with the Python models; every manufacturing entity has a `New*` constructor with the Python defaults and a `Validate()`, held equal to the Python models by one fixture both suites read (FB-016) |
| Go scaffold | 🟡 | `forge-core/src/go/internal/scaffold` (112 lines); not a module template yet |
| `forged` daemon, `forgectl` | ⬜ | 22- and 36-line placeholders |
| Template module copies (`modules/Forge CMMS`, `Forge ERPI`, `Forge NMS`, `Forge DB Orchestration`) | removed 2026-11-23 | second copies of code in the main tree (D-17 Q-4, FB-201); four rows in the archive |

### 3.8 forge-display and FVTS

| Capability | State | Notes |
|---|---|---|
| FVTS v0.1.0 schema, 20-check runner, render-profile baseline, reference renderer, golden messages, CI gate | ✅ | FB-077 (PR 36); `forge-core/src/python/forge_core/fxts/fvts`, `tests/governance/fvts` |
| forge-ot's own view contract | ⬜ | none yet: what the module offers (alarm lists, the governed write path, settings) is described when forge-display exists, and a site's tags are bound on site, created through forge-ot (FB-251). The invented fermenter sample is a test fixture (FB-078, done 2026-11-23) |
| forge-display design | ✅ | signed 2026-11-20 (D-16): `docs/decisions/forge-display.md` |
| FUTS, the framework for widget specs and view documents: schema 0.2.0, runner, twelve widget specs, the hub's four standard screens, one reference view document | ✅ FB-176 (2026-11-20), FB-187 (2026-11-22) | `forge-core/src/python/forge_core/fxts/futs`, `forge-core/docs/fxts/FUTS.md`; approved by the owner |
| forge-display (server, client, designer), the hub's view spec, the view service | ⬜ | no code; FB-177 to FB-186, in the order of `ROADMAP.md` §4 |
| FVTS open decisions (name, write authority per profile, mobile acknowledge, transport, layout format) | ✅ | D-4 decided 2026-11-03, recorded in `forge-core/docs/fxts/FVTS.md` ("Decisions") |

### 3.9 Governance (FxTS)

| Framework | State |
|---|---|
| FATS | schema + runner + 28 specs (one per hub-served route) |
| FACTS | schema + runner (`facts:schema-valid` + 35 rule checks, `facts:time-governed` among them since FB-090; enums read from the schema) + 9 specs, each with the required `time_governance` section; all 9 validate (schema 0.2.0 for the OT words, FB-079); all 9 approved by reh3376 on 2026-11-13 after the FB-090 re-stamp |
| FHTS | hashing, verification, approval, revert, registry; owner-only approval in practice |
| FTTS | schema + runner + 1 spec; no doc page |
| FVTS | schema + runner + reference renderer + 1 spec |
| FQTS, FSTS | planned (the empty packages were removed 2026-11-18, D-14) |
| FDTS, FLTS, FNTS, FOTS, FPTS | planned (doc pages only) |
| Spec integrity CLI (`forge governance specs`, `stamp`, `approve`) and `forge governance run` for FATS, FACTS, FVTS, FTTS | ✅ FB-021, FB-083 (2026-10-18) |
| FMTS, the module requirements framework (D-12): schema, schema 2.0.0 since 2026-11-19 (sixteen requirements, FB-165; function, integration section, data classes, buffer and last will, FB-153), four governed lists, runner (29 verdicts per spec, seven requirements checked statically, the transport declarations, waivers), `forge governance run fmts` | ✅ FB-135 (2026-11-17); nine module specs (FB-136, 2026-11-18) awaiting the owner's approval; the conformance kit runs M-4 to M-7 for the Python modules (FB-137, 2026-11-18) |

### 3.10 Security, identity, topology

| Capability | State | Notes |
|---|---|---|
| Role model designed in dialogue (R-1 … R-19) | ✅ | `docs/decisions/roles.md`, signed 2026-11-03 (Q21: a derived copy of assignments at the site hub; Q22: the ladder as an optional preset); enforcement is FB-075 |
| Scoped roles enforced in the gateway | ⬜ | FB-075 (two role enums today: gateway `Role`, OT `WriteRole`) |
| Identity methods (OIDC, local, service; then LDAP/AD; then SAML) | ⬜ | R-10 |
| Hub of hubs (site / enterprise / area), upward audit, on-demand data | ⬜ | R-9, R-13, R-14, R-16, R-17; no code |
| Offline token verification, one-hour default lifetime | ⬜ | R-8, R-15 |
| Repository hardening | 🟡 | public again since 2026-10-17 (owner's call, ahead of Support's GC); secret scanning, push protection, CodeQL default setup, Dependabot, private vulnerability reporting and fork-PR approval on; gitleaks in CI; the 4 open secret-scanning alerts are the rotated whk-mes values still reachable through `refs/pull/4..8` until Support GCs (ticket #4862642); non-provider patterns and validity checks are owner toggles the API refuses (FB-044) |

### 3.11 Deployment and operations

| Capability | State | Notes |
|---|---|---|
| Docker Compose (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, forge-init, forge-hub; minio opt-in) | ⚠️ dev only: every image pinned by digest (FB-312); Kafka on Apache's image since Bitnami stopped publishing; MinIO publishes no image any more, so it is behind `--profile object-store` until FB-314 replaces it; the stack starts, init and hub, and CI's `hub-image` job runs it on every change to what the image is built from (FB-315) | `deploy/docker` |
| Hub container image | ✅ | `deploy/docker/Dockerfile.forge`, built from `uv.lock` with `uv sync --locked` (dependency layer before the source, `ot` extra in, dev tooling out; `.dockerignore` keeps the context to what it copies) since FB-096 (2026-10-24) |
| Hub health probes (`/v1/health`, `/readyz`) | ✅ | All seven compose-stack components (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio) since FB-006 (2026-10-22) |
| Clock discipline requirement (the NTP/PTP chain from the top hub, tolerance classes, what fails closed, the new-site checklist) | ✅ written | `forge-hub/docs/clock-discipline.md` (FB-090, 2026-11-13); enforced on PLC connections since FB-093's OT half (2026-11-15); the spoke link is measured two-way since FB-092 and enforced since FB-093's hub half (2026-11-17) |
| Kubernetes production deployment | ⬜ | owner note; no backlog id |
| Backups, SLOs, performance baselines | ⬜ | FOTS/FPTS planned |

### 3.12 Engineering platform

| Practice | State |
|---|---|
| One backlog item per PR, auto-PR, owner merges on green | ✅ (A-8) |
| Every finding fixed or recorded in `BACKLOG.md` | ✅ (122 items recorded to date) |
| Documentation current before every push | ✅ rule since 2026-10-16 |
| Owner-only spec approval | ✅ `forge governance approve <spec> --by reh3376` (FB-021); nobody runs it on the owner's behalf |
| MDEMG/Jiminy governed memory, local models only | 🟡 instance per project (A-10); found 2026-11-14 on the owner's machine: two MDEMG servers answer on port 9999 (forge's container on IPv4, the mdemg checkout's native server on IPv6) and the hooks' `localhost` reaches the native one, so session memory has not been going to forge's instance (`docs/MDEMG-INIT-BUGS.md`, Bug 11; Bugs 9, 10 and 12 the same day). The owner's decision of 2026-11-15: port 9999 belongs to the mdemg repository, ports are assigned dynamically at init and at start-up, and the fix is the mdemg agent's; the report handed to it is `docs/MDEMG-PORT-OWNERSHIP-REPORT.md`. Until it lands, forge's hooks keep reaching the native server |
| Lint gate | ✅ `ruff check` and `ruff format --check` clean and blocking since FB-022 (2026-10-18), no rule ignored since FB-084, `DTZ` (no naive datetimes) blocking since FB-014 (2026-10-20); the interim frontend's type check clean and blocking since FB-028 (2026-11-17); backend jest on the interim NestJS code still advisory (FB-048, FB-036; it goes when FB-076 retires that code) |
| Dependency lock | ✅ `uv.lock` committed (FB-096, 2026-10-24); CI, the hub image and the README quick start install with `uv sync --locked`, which fails on a stale lock, so a dependency moves only through a committed re-lock; Dependabot proposes Python bumps on the `uv` ecosystem, manifest and lock together (FB-102); `tests/test_dependency_lock.py` holds the lock to the manifest and the installers to the lock |
| Top-level documents are the key documents only | ✅ FB-081 (2026-10-18): twelve planning records retired, rationale in `docs/PRINCIPLES.md` |
| Onboarding tutorial | ✅ FB-103 (2026-10-27): `docs/tutorial.md` (contributor track F1–F11, end-user track U1–U12, 24 diagrams; a section on time synchronisation in each track since 2026-11-15, F9 and U10, FB-121, speaker notes; reviewed slide by slide against the tree on 2026-11-13 with the three-layer process control framework added to both tracks, FB-114, published 2026-11-14 with PR 96) rendered by the vendored tutorial-forge into `build/tutorial-static/` (gitignored); `make sync-tutorial-embed`, the drift gate and the FSD invariants check run locally and in the Deploy Tutorial workflow; live at https://reh3376.github.io/forge/ since 2026-10-28 (the owner enabled Pages; the live page passes the FSD §16.5 invariants and its breadcrumb matches the deck); framework tutorial-forge 1.1.0 since 2026-11-03 (FB-104 and FB-105 fixed upstream in mdemg and re-vendored) |

---

### 3.13 Process control (PC-L1 / PC-L2 / PC-L3)

| Item | State | Notes |
|---|---|---|
| Decision record, owner-signed | ✅ | `docs/decisions/process-control-framework.md` (D-11, 2026-11-13, the owner's PR 93); agent context in `docs/decisions/process-control-framework-context.md` |
| Forge review (read-only) answering what the tree says for O-2 to O-4 | ✅ | 2026-11-13, record §4a; FB-112 recorded; nine questions open for the owner |
| Framework FSD (vocabulary, invariants, autonomy model, contracts between layers) | ⬜ | FB-110; after the owner's round-4 answers (home and format of FSDs among them) |
| PC-L1, PC-L2, PC-L3 FSDs; FxTS specs for each contract before code | ⬜ | FB-110 (S-1) |
| MPC Supervisor module | ⬜ | new build (M-6); language O-2 |
| Controller write path (origin, cycle write, heartbeat class, timing) | ⬜ | FB-112, designed in the PC-L2 FSD |
| Prior-art search on F-2 | ⬜ | FB-111, before any IP filing or public positioning |

## 4. Open decisions (owner)

On 2026-11-03 the owner decided D-1, D-3, D-4, D-8, D-9 and D-10, one question at a time, and signed the four records; on 2026-11-13 the owner signed D-11 (the process control framework) in their own PR 93. D-5 and D-7 remain open.

| # | Decision | Blocks |
|---|---|---|
| D-1 | Platform role model — **signed 2026-11-03** (`docs/decisions/roles.md`, R-1 … R-19) | nothing; FB-075, FB-078 and the multi-party approval step above FB-074 can start |
| D-3 | forge-mes Go design — **signed 2026-11-03** (`docs/decisions/forge-mes-go.md`, round 2) | nothing; FB-017 (Go half), FB-076, FB-057 steps 2–5 and FB-055 can start, in the record's step order |
| D-4 | FVTS open items — **decided 2026-11-03** (`forge-core/docs/fxts/FVTS.md`, "Decisions") | nothing; forge-display design can start |
| D-5 | Hub core language (Python vs Rust) — parked | nothing in the current sequence |
| D-7 | Scope of the Go standard (OT module and Python adapters) | long-term shape of the Python packages under `forge-modules` |
| D-8 | FACTS vocabulary for OT adapters — **decided 2026-11-03, narrowed by the owner 2026-11-23**: the schema gains a word only for a new meaning | done: FACTS 0.2.0 and the OT spec, both approved 2026-11-23 (FB-079) |
| D-9 | One clock: which established standards to adopt — **signed 2026-11-03** (`docs/decisions/one-clock-ot-source-time.md`, round 2: tolerance classes, six record fields, `origin: forge` allowed, 30 s default cadence adjustable at runtime, NTP with T0 acceptable, fields first then the exchange, never silent) | nothing; FB-088, FB-094 (steps 2, 3, 6) and FB-090 done 2026-11-13, FB-093's OT half (step 5) and FB-092 (step 7) 2026-11-15; FB-093's hub half and FB-091 follow |
| D-10 | One schema registry — **signed 2026-11-03** (`docs/decisions/one-schema-registry.md`, round 2) | nothing; FB-097's eight steps |
| D-11 | Three-layer process control framework (PC-L1/PC-L2/PC-L3) — **signed 2026-11-13** (`docs/decisions/process-control-framework.md`, rounds 1 to 3, Q-1 to Q-50; the owner's PR 93); the Forge review done 2026-11-13 (§4a), nine round-4 questions open, O-2, O-3 and O-4 among them | WS-12: the framework FSD and the layer FSDs (FB-110); nothing is implemented before its FSD |
| D-12 | Forge module requirements — **signed 2026-11-17** (`docs/decisions/forge-module-requirements.md`: everything that registers is a module; the FMTS framework above FACTS; amended 2026-11-19 with M-12 to M-16 from the transport contract (FB-165); eleven original baseline requirements; the time contract; enforcement in the scaffold, CI and at Register; named waivers for today's modules) | FB-135 to FB-140, FB-123, FB-127 |
| D-13 | The integration module builder — **signed 2026-11-18** (`docs/decisions/integration-module-builder.md`: a generic integration host, governed flows, a block library with sandboxed scripts, approval per hub, forge-creds, forge-display's design mode) | FB-154, with FB-142, FB-143, FB-153, FB-155 |
| D-14 | What every FxTS framework provides — **signed 2026-11-18** (`docs/decisions/fxts-framework-baseline.md`: twelve requirements enforced by one test, F-11 and F-12 added 2026-11-24 from D-19; every spec hashed; a framework is planned or complete; schema versions with approved hashes) | All five steps done: FB-159, FB-160, FB-149 with FB-152, FB-161, FB-151 (2026-11-19) |
| D-15 | The hub-to-module transport contract — **signed 2026-11-18** (`docs/decisions/transport-contract.md`: T-1 to T-16; records at least once with store and forward, commands at most once and expiring (a command is only a write to a process controller, and a business write-back is delivered once and only once: owner, 2026-11-19), numbers by data class, mutual TLS in production) | FB-164, FB-165, with FB-142, FB-151, FB-153. Amended 2026-11-19: data classes as parents and sub-classes, the pruning strategy for a full buffer, the last will |
| D-16 | The forge-display design — **signed 2026-11-20** (`docs/decisions/forge-display.md`: a Go module plus one TypeScript and React client, schema-first, FUTS for view documents and widgets, the core decides, role-based writes on any profile, instances declared per module, Python in worker processes with approved packages; amends D-4, D-13, D-15; sets the sequence) | FB-176 to FB-185, FB-075, FB-017; the spike done and its three points final (FB-179) |
| D-17 | The structure of the repository — **signed 2026-11-22** (`docs/decisions/repository-structure.md`: forge-core, forge-hub, forge-modules as three self-contained folders; import rules held by a test; a spec lives with what it describes; the hub's id becomes forge-hub). Nothing moved yet: FB-197 to FB-203 |
| D-18 | Admission: how a hub decides that a module may attach — **signed 2026-11-23** (`docs/decisions/approved-spec-register.md`: one decision for every way of attaching; admitted only on a spec promoted on that hub; requirements, causes and authorities as data; signed approval records; four laws). Nothing built (FB-256 to FB-263) |
| D-19 | Approvals and evidence — **signed 2026-11-24** (`docs/decisions/approvals-and-evidence.md`: every verdict names its evidence; a claim without a check of the real thing is a visible, accepted gap; an approval is an SSH-signed record binding content, schema, module, a run and a sequence number; no rule trusts a signer's time). Nothing built (FB-264, FB-267, FB-258) |
| D-20 | Approval signing — **signed 2026-11-25** (`docs/decisions/approval-signing.md`: D-21's signing chapter; a signed release list per approval act, the owner's key in every root change, every approved version kept, strict FIDO2 and WebAuthn, deployment approvals to Part 11; amends D-19 AE-8 to AE-12, C-6 and §13) | Nothing built; D-21's step 5 (FB-293) |
| D-21 | The security framework — **signed 2026-11-24** (`docs/decisions/security-framework.md`: identity, authentication, sessions, authorization, machine identity, secrets, audit, release integrity, signing and the trust anchor as one framework; IEC 62443 SL-C 3 mechanisms with SL 3 production's default; development only different data on it, never a switch; forge-core holds each deployment's anchor and masters roles; amends D-1 R-16, R-18 and §8, D-15 Q-8 and T-12, D-17 C-4; chapters `permissions-framework.md` and `approval-signing.md`, proposed) | Nothing built; FB-291, FB-292 first, then the build order of its §11 (FB-293) |
| D-22 | The permissions framework — **signed 2026-11-25** (`docs/decisions/permissions-framework.md`: D-21's authorization chapter; one decision point, a permission on every object and widget, grants by place, a governed catalog of permissions per module, denied widgets in four treatments) | Nothing built; D-21's step 2 (FB-293) |
| D-23 | The trust root and identities, the design of D-21's step 1 — **signed 2026-11-25** (`docs/decisions/trust-root-step1.md`: the owner's FIDO2 keys as the authorities, three with any two required, and X.509 certificate roots apart; every key generated on its device and attested; the online keys on a YubiHSM 2; one issuer in Python for the manager and every hub; enrolment signed by approvers against a governed allow-list of security-key models; an append-only identity log; amends D-21 §10, SF-2 and §11, answers D-17 C-6) | Step 1a built (`forge_core.trust` and its Go twin, PR 192; two freshness keys in the anchor's form, FB-311); step 1b next, with the devices (FB-293), after FB-317 and FB-307 |
| D-24 | Installation and devices — **signed 2026-11-25** (`docs/decisions/installation-and-devices.md`: two phases, the installer standing up forge-core and the top hub and every site installed through forge-core down the chain; a numbered release manifest signed by two devices; only listed images admitted; a signer container as each device's sole holder answering typed requests by scope; one host setting; active and standby replicas; development on Docker Desktop's Kubernetes; amends D-23, D-20 SG-4, D-21 §14 FR-2) | Nothing built; FB-231, then FB-305 to FB-313 |

---

## 5. Largest gaps against the vision

1. **No forge-display** (vision §P-8): its design is signed (D-16) and the contract and runner exist; the module, its view-document framework and the designer do not.
2. **No management module in Go** (vision §3.3): the migrated NestJS/Next.js application stands in for forge-mes until the Go module is built; the SDK template does not exist yet.
3. **No scoped roles in force** (vision §P-11): the gateway's auth is off by default; the role model is signed (D-1, 2026-11-03) and not yet enforced (FB-075).
4. **No federation** (vision §P-10): a single hub only; no hub-of-hubs code.
5. **Seven governance frameworks are planned** (none is half-built since 2026-11-18); FACTS now validates against its own schema and all nine of its specs carry owner-approved hashes (FB-090 re-stamp, approved 2026-11-13).
6. **No production deployment** (vision §P-12).
7. **Clock discipline enforced on the plant floor and on every spoke the hub registers; not on Forge's own hosts or between hubs** (principle "one clock", owner 2026-10-18): every spoke declares how it is time-governed since FB-090 (2026-11-13) and the deployment requirement is written down, and a PLC connection whose clock is unreadable or outside its class is refused since FB-093's OT half (2026-11-15), and since FB-092 (2026-11-15) the hub gives its time to every spoke in the contract and keeps each reporting spoke's clock two-way, and since FB-093's hub half (2026-11-17) it refuses a spoke whose clock is outside its class or that reports no measurement; but its own REST ingest carries no exchange until it is retired (FB-123), the baseline every module must meet is not written down (FB-124), it checks no clock of its own (FB-119) and has no hub above or below it (FB-118; a tag's source time is corrected by the measured server or device clock on OPC UA since FB-094 step 3; no source time is invented since FB-088 on 2026-11-13, a value without one is refused unless the connection declares origin forge; naive timestamps are rejected since FB-014, the hub stamps receipt since FB-087 and every link's offset is measured and alerted since FB-089, all 2026-10-20).

---

## 6. How to update this page

Before a push that changes any row above: change the row, the numbers in §2 if they moved, and the status date. If a decision in §4 is taken, move it to `ROADMAP.md` §1 and remove it here. New gaps get a backlog id first, then a row.
