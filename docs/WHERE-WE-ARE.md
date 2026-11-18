# Where we are

**Status date:** 2026-11-17 · **Branch:** `reh3376_dev01` (last merged PR: 102) · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) · [Where we are going](WHERE-WE-ARE-GOING.md) · [Roadmap](ROADMAP.md) · [Backlog](../BACKLOG.md)

**Pick-up point (2026-11-17, evening): FB-028 is done: the interim MES frontend type-checks clean and its CI check blocks. The next step is unchanged: FB-125 (the root `CLAUDE.md`), then FB-124, FB-123 and FB-126, then FB-091.** FB-028 in short, at the owner's direction from the CI log: a clean install as CI does it showed 228 type errors in the Next.js frontend imported from whk-mes, whose build ignores type errors; 93 files no product page uses were removed (30 debug and test pages, 55 files nothing imported, the broken running-recipe route with its service and queries), the lock file's wrong version-19 React type packages were removed and `@testing-library/dom` added (both approved by the owner), and the remaining errors were fixed in the code with no compiler flag relaxed, five of them real defects (the schedule edit modal's yield panel, the QR scanner's sound, the health monitor's status, the mashing sheet's draft entries, a password length in a log). The owner confirmed the same day that `forge-display` is the module that renders every Forge frontend (A-3), and left the course for the interim frontend to Claude: keep it as the MES user interface until forge-display exists, without its dead code. Five items recorded on the way (FB-130 a committed `node_modules` directory, FB-131 the frontend's failing unit tests, FB-132 the lock file's remaining mismatches, FB-133 the build that ignores type errors, FB-134 stale imported notes) and FB-129 (a failed Dependabot update). PR 101 (Dependabot, Python dependencies) and PR 102 (FB-093's hub half) merged on 2026-11-17. **Earlier the same day: FB-093 is done on both halves.** The hub refuses a spoke whose clock it cannot trust: every Register, Health and Ingest request is a probe of the spoke's clock, three probes outside the declared class or without a measurement refuse the spoke's Register and Ingest, and three good ones readmit it. The same day the owner answered six questions on goals and requirements, one at a time. The next step is FB-125 (a root `CLAUDE.md` with the goal and the standing rules, the MES `CLAUDE.md` corrected, its four subagents removed), then FB-124 (the forge module requirements record for the owner to sign, and its FxTS spec), FB-123 (retire the hub's REST ingest) and FB-126 (the report for the mdemg agent), then FB-091. The owner's answers of 2026-11-17, asked after a prompt audit of the Claude Code configuration: (1) the repository's documents win over Jiminy guidance, and a disagreement is an MDEMG defect, because the guidance should be derived from the ingested codebase, documentation included (FB-126); (2) forge gets a short root `CLAUDE.md` carrying the goal and the standing rules, which until now lived in one agent's private memory files (FB-125); (3) a spoke that does not implement the time exchange is refused at runtime, and "this should never occur", because module requirements make time sync a core requirement; (4) all modules speak to the hub through gRPC, third-party software is never integrated with the hub directly, an integration module is the middleware for a third-party REST API and carries that integration's time requirement, so the hub's own REST ingest is retired (FB-123); (5) the MES `CLAUDE.md` is corrected and its four subagents are removed (FB-125); (6) the minimum module requirements live in a forge module requirements document the owner signs and are controlled by a new FxTS spec for module development / creation, which defines a `time_contract` between each module and every database and plant-floor device with its hub (FB-124). The goal in the owner's words: "Forge is first and foremost a manufacturing sector solution for properly deployed digital infrastructure. The ultimate goal is to facilitate an enterprise's ability to make better decisions at all levels of the business based on the data generated within the business." Decisions A-11 and A-12 in `ROADMAP.md` §1 carry (3), (4), (6) and (1). The owner added two requirements the same day: the Claude files must clearly define what Forge is, why it is being built and its ultimate goal (FB-125), and the developer and user tutorial must reflect the codebase as it is, so both tracks are reviewed against the change and updated before every push that triggers the auto-PR (A-8, in force from this PR). FB-093's hub half in short: `SpokeClockGates` holds one gate per adapter id on the class its manifest declares, kept across sessions; the spoke's own requests are the probes, because the hub cannot open a call to a spoke; a measurement rides on `SpokeTime` (Register, Health) or in three headers on Ingest; `CLOCK_OUT_OF_TOLERANCE` after three measurements outside the class, `CLOCK_UNREADABLE` after three requests with none, either cleared by three good probes, at most one probe a second counted; a refused spoke's Register answers `accepted=false`, its Ingest fails with `FAILED_PRECONDITION` before a record is read, `POST /v1/records` answers 409, and Health is answered throughout so the spoke goes on measuring; a manifest without `time_governance` is refused at Register; the refusal is an error line, the `forge.ingest.refused` metric, the hub's `AdapterHealth` of the spoke (DEGRADED, `clock_state`, `clock_gate`, `refusals`, `last_refusal`) pushed to the registry at once, the API and `forge adapter health`; the Python `SpokeClient` and the interim MES bridge report their measurement with every request and raise a named error on a refusal. No proto message changed (four metadata headers were added) and no FATS or FACTS spec changed. Six items recorded on the way (FB-123 to FB-128). FB-092 (2026-11-15), the record's step 7, in short: hub time is in the contract (a spoke sends T1 with Register, Health and Ingest, the hub answers with T2 and T3, the spoke measures its clock against the hub's and reports it, and the hub keeps every reporting spoke's clock two-way, held to its declared class); `SpokeTime` and `HubTime` on the three RPCs and `spoke_time` on the record (proto field 10, the renamed `sent_time`); `TimeExchange` computes offset and round trip by RFC 5905; the Python `SpokeClient` and the interim MES bridge implement it, the Go models carry it; an older hub is still served (an older spoke was too, until FB-093's hub half); no FATS or FACTS spec changed; the FTTS spec's contract section had drifted and is corrected (FB-122). PR 99 (the one-clock tutorial sections and FB-117 to FB-121) and PR 98 (FB-093's OT half: a PLC connection whose clock cannot be read, or is outside its tolerance class, for three consecutive probes stops delivering until three good ones, and says so) merged on 2026-11-15. The same day, at the owner's direction, every time-synchronisation gap was made sure of in the backlog (FB-117 clock readers for Logix, S7, Modbus and Sparkplug; FB-118 the time chain between hubs; FB-119 Forge does not check its own host's clock; FB-120 the IT spokes do not read their source system's clock) and the tutorial gained a section on one clock in each track (F9 and U10, FB-121). PR 97 (2026-11-15) brought this page to date and recorded MDEMG bugs 9 to 12 and the port-ownership report for the mdemg agent; PR 96 (FB-114) merged on 2026-11-14. Development resumed on `reh3376_dev01` on 2026-11-13 after PR 93, the owner's own PR: the three-layer process control framework decision record (D-11, `docs/decisions/process-control-framework.md`, signed 2026-11-13; FB-110, FB-111) and its agent context (`docs/personal/Process-Control-Framework-Context-for-Agent.md`). The read-only Forge review the record asked for was done the same day: its facts and proposed answers to O-2, O-3 and O-4 are in the record's §4a and the roadmap's D-11 entry, FB-112 (the controller write path) is recorded, and nine questions wait for the owner. The owner left the pick-up to Claude: FB-090 first, because it is fully specified by the signed one-clock record and the framework's MPC deployment is a spoke that needs that declaration; the process-control FSDs (WS-12) start once the owner has answered the review's questions. FB-114 done the same day (PR 96, merged 2026-11-14: every slide of both tutorial tracks reviewed against the tree, stale claims corrected, the three-layer process control framework added to both tracks, the counts refreshed; the Deploy Tutorial workflow published it on the merge, and the live page reads `Last verified: 2026-11-13` with the three contributor slides and the end-user slide on the framework). FB-093's OT half followed on 2026-11-15 (D-9 step 5): every PLC connection has a clock gate (`ClockGate`: three consecutive probes that cannot read the clock enter `CLOCK_UNREADABLE`, three whose offset exceeds the link's tolerance class enter `CLOCK_OUT_OF_TOLERANCE`, three good ones clear either); the class is the connection's `tolerance_class`, else its FACTS entry, else T0, with P-8's tolerances in place of the provisional 1 s; a refused connection's provider is stopped, its tags are neither read, written nor collected, the restart loop does not apply and an operator restart answers 409; the refusal is an error line, on the connection status (`clock_state`, `clock_gate`), on `AdapterHealth` (DEGRADED, `refusals`, `last_refusal`; HEALTHY again on recovery) and an alarm where the host has an alarm engine; a probe cadence under 1 s is refused at load. Two findings on the way: the hub's OT host composes no alarm engine (FB-115), and T2 to T5 carry IEC figures the owner has not approved and a probe cannot resolve (FB-116). FB-092 followed the same day and FB-093's hub half on 2026-11-17 (both above). **Next step: FB-125**, then FB-124, FB-123 and FB-126, then FB-091, FB-097's eight steps, FB-017 and the forge-mes steps. PR 95 (FB-090, D-9 step 4): every spoke declares how it is time-governed. The FACTS schema has a required `time_governance` section (time source, sync protocol, clock-read method, probe cadence, stamp origin, tolerance class, `fail_closed: true`, optional per-connection entries) and the runner's blocking `facts:time-governed` check refuses a missing section, an undisciplined clock, a cadence under 1 s, a clock-read method the protocol cannot perform or none where it offers one; all nine specs carry it (the OT spec: `opcua-current-time`, 30 s, `server`, `T0`; the IT spokes: `hub-ntp`/`ntp`, `server`, `it-lan`) and were re-stamped and approved by the owner the same day (`forge governance approve <spec> --by reh3376`, nine specs); the section rides on `AdapterManifest.time_governance` (proto field 13; Python, Go, the interim MES bridge) and in every adapter's `manifest.json`, and it is now the one declaration the adapter base, the OT module and the ingest pipeline read for the stamp origin (manifest metadata declares nothing any more); a connection parameter that contradicts it is refused at configure (`time_governance_conflict` on the health, raised); the deployment requirement is `docs/deployment/clock-discipline.md`. Two findings on the way: the whk-nms builder ignored the NMS's own `last_seen`/`detected_at`/`discovered_at` stamps (fixed), and the FACTS runner does not check the change-history chain, which hid a gap in forge-mes's history (FB-113). PR 91 (FB-094 step 6): every tag carries `max_sampling_uncertainty_ms` (one-clock record P-6), a requirement tighter than the acquisition gives (the scan class interval, a Query tag's poll interval; `BaseTag.sampling_bound_ms`) is refused at load, and the acquisition's bound goes on every stamped OT value as `source_uncertainty_seconds`, added to the clock's bound once corrected; with it FB-094 is complete for what the tree has (the Logix, S7 and Modbus readers follow their drivers). PR 90 (FB-094 step 3, the correction on entry): `RecordTimestamp` carries all six fields of the one-clock record's P-3 (`source_time_as_sent`, `source_offset_seconds` and `time_quality` join `source_clock` and `source_uncertainty_seconds`; proto fields 5, 7 and 9 and the `TimeQuality` message, on the Python, Go and bridge models and both serialisers), the OT builder corrects the source and server stamps by the declared clock's filtered estimate (`ClockEstimate` from the tracker, NTP's 1/8 weight) where they enter the spoke and keeps the stamp as sent, the offset, the uncertainty (half the probe round trip plus the scan interval) and the time quality, every builder writes the stamp's fields through `SourceStamp.timestamp_fields()`, and the hub never corrects again (P-10); the FATS/FACTS re-stamp waits for FB-092 (Q-6: once, at the end). PR 89 (FB-094 step 2, clock readers): every OPC-UA response now measures the server's clock (a tap on asyncua's `_send_request` reads `ResponseHeader.Timestamp`, T1/T3/T4 NTP style), the `CurrentTime` probe runs on a per-connection cadence the operator changes at runtime (`POST /control/connections/{name}/clock-probe-interval`, 1 s minimum, value and setter on the status), `ClockOffsetTracker` keys each series by the clock measured (`server:WHK01`, `device:WHK01`; `clocks()`, the `forge.clock.id` metric attribute), `PlcConnectionSpec` declares `source_timestamp_origin` and names the probe cadence `clock_probe_interval_seconds`, and a probe answered without a clock value is counted on the status (`clock_unreadable`) ahead of FB-093's refusal; Logix, S7 and Modbus readers implement the shared `ClockReader` surface when their drivers land, and Sparkplug's one-way publish stamp follows its ingest adapter. PR 88 (FB-088, the first one-clock step): no record builder invents a source time any more (the OPC-UA converter and tag registry, the nine adapters, the BOSC collectors, the Ignition bridge, the REST path and the interim MES bridge); a value without a source stamp is refused unless its connection declares `source_timestamp_origin: forge`, and then Forge's own read time stands in with `source_clock=forge` and the poll bound as `source_uncertainty_seconds` (the first two of the record's six time-quality fields, proto 6 and 8, on the Python, Go and bridge models); a refusal is never silent (the adapter goes DEGRADED, `AdapterHealth.refusals`/`last_refusal`/`error_message`, the `forge.ingest.refused` metric, `forge adapter status`, the REST response and ingest log). Two findings were recorded on the way (FB-108: the hypertable persists only `source_time`; FB-109: a remote spoke's own health never reaches the hub) and one fixed (`forge.clock.offset` is a gauge: the histogram dropped negative offsets). After the one-clock steps come FB-097's eight steps, then FB-017 and the forge-mes steps. On 2026-11-03 the owner answered every open design question one at a time (34 answers: D-3 Q-1 to Q-10, D-9 Q-1 to Q-6, D-10 Q-1 to Q-8, D-1 Q21 and Q22, D-8, the seven FVTS items of D-4) and declared the answers the signature of the four records: `docs/decisions/forge-mes-go.md`, `one-clock-ot-source-time.md`, `one-schema-registry.md` and `roles.md` now read `approved by reh3376 on 2026-11-03`, each with the answers and a debt check per answer in its last section. Two standing rules came with the answers: **no silent failure** (a refusal or fail-closed state raises an alarm at once and is visible on status, health, API, CLI and forge-display) and **no decision that pins the platform in**. Two backlog items were recorded from the answers (FB-106 GraphQL gateway hub module, FB-107 local-model formula assistant). Implementation starts next, one PR each, in the recommended order: the one-clock steps (FB-088 first, then FB-094's clock readers and fields, FB-090, FB-093, FB-092, FB-091), then FB-097's eight steps, then the forge-mes Go steps beginning with the Go SDK scaffold (FB-017), with FB-075 and FB-079 alongside; forge-display design (M4) is unblocked. FB-104 and FB-105 (the vendored tutorial framework's heading-pin and sidebar-label defects, and its vulnerable lockfile that failed the Dependabot security updates on `main` six times per push) were done on 2026-11-03 upstream in mdemg as tutorial-forge 1.1.0 and re-vendored here unchanged: a pin attaches by position to the first heading after it (29 of 34 pins on the mdemg site had been dead), heading text is normalised once for slugs and sidebar labels, reveal-md is gone, puppeteer 25 and mermaid 12 need Node 22 (the Deploy Tutorial workflow moves to it and runs the framework's nine tests), and `npm audit` reports 0 findings. FB-068 (the embedded broker's RETAIN semantics for local subscribers: a live message arrives with RETAIN=0, a new subscription gets the retained store replayed with RETAIN=1) was done on 2026-10-29. No other decision-free backlog item is left: FB-100 waits on FB-057 step 2; FB-097 on D-10 (`decisions/one-schema-registry.md`, Q-1 to Q-8); FB-088 and FB-090 to FB-094 on the owner's signature of the one-clock record (D-9); the rest on D-1, D-3, D-4 and D-8 (§4). FB-103, the Forge tutorial package built with `scripts/tutorial-forge` (two tracks from a landing fork, contributor onboarding and end-user overview; deck `docs/tutorial.md`, config `tutorial.config.json`, output `build/tutorial-static/`), modelled on the MDEMG tutorial at https://reh3376.github.io/mdemg/, was delivered on 2026-10-27 (PR 78) and is live at https://reh3376.github.io/forge/ since 2026-10-28, when the owner enabled GitHub Pages and the Deploy Tutorial workflow published `main`.

This page is the honest snapshot: what exists in the repository today, what is wired end to end, what is governed, and what is missing against [`VISION.md`](VISION.md). It is updated before every push that changes the state it describes (rule of 2026-10-16: documentation is current before every push). Numbers are from the tracked tree at the status date; "exists" means code is present, "wired" means it runs in the deployed hub, "governed" means a spec and a gate cover it.

---

## 1. In five lines

1. The **hub ↔ spoke contract works end to end**: a spoke registers, is checked against its FACTS spec, pushes records that are persisted, is pulled (Collect/Backfill/Subscribe) and receives write-backs, over TLS/mTLS both ways with per-spoke tokens.
2. The **OT module runs inside the hub** with OPC-UA connections, a tag engine, the full control-write defense chain (the ISA-18.2 alarm package exists but the host does not compose it yet, FB-115), and drives the MES changeover sequence including the PLC CIP runner.
3. **forge-mes is Go and not yet built**: the imported NestJS backend and Next.js frontend stand in as the interim bridge and speak the spoke contract; the Go rewrite (FB-076) is decided and designed (`docs/decisions/forge-mes-go.md`, signed 2026-11-03); the Go SDK scaffold is its first step.
4. **Governance is real for four frameworks** (FATS, FACTS, FTTS, FVTS) plus FHTS hashing; the other seven are stubs or planned. forge-display does not exist yet; its contract (FVTS) does, with a runner and golden messages.
5. **Not yet**: scoped roles in the gateway, `mod_mes` in the hub, the Go module SDK, the hub-of-hubs federation, Kubernetes, and any management module in Go.

---

## 2. Numbers

| Measure | Value |
|---|---|
| Python hub (`src/forge`) | 355 files, ~72,200 lines |
| Python tests | 269 files, ~59,700 lines, 4,335 test functions (4,625 collected); full suite green on 2026-11-17 on the locked dependency set (4,618 passed, 5 skipped, 2 expected failures) |
| Go (`go/`) | 32 files, ~10,500 lines (2,078 of models and 1,665 of their tests, 112 scaffold, generated bindings, 58 lines of daemon/CLI stubs); `gofmt`, `go vet` and `go test` gate CI |
| Interim MES bridge (`modules/Forge MES`; NestJS + Next.js until the Go forge-mes lands, FB-076) | ~249,000 lines of TypeScript in `backend/src` and ~87,000 in `frontend` (FB-028 removed 93 unused files there; the earlier single figure of ~248,000 was the backend alone) |
| `AdapterService` RPCs | 12 (Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover) |
| Hub REST routes | 41 on the hub app (20 platform, 12 Context Engine, 9 Schema Registry; state changes behind `adapters:write`, `context:write` or `schemas:write`), plus OT i3X (8) and OT control (16; every POST behind `adapters:write`), plus the curation app mounted at `/curation` |
| Storage migrations | 12 (core schema, spoke schemas, canonical, TimescaleDB, lineage, contextual records, adapter registry, module permissions, registry and equipment tables, data-product curation spec, contextual-record context columns, spoke roles without login) |
| FACTS specs | 9, every one with the required `time_governance` section (FB-090); 8 validate against the schema and pass the runner's rule checks, ot-module fails `facts:schema-valid` + 8 vocabulary checks (FB-079); all 9 approved by reh3376 on 2026-11-13 after the FB-090 re-stamp (`forge governance specs`) |
| FATS specs | 28 (one per route the hub app serves; the hub test holds both directions) |
| FVTS specs | 1 (ot-module reference, `pending_review`; re-stamped by FB-074 for `REJECTED_REVIEW`) |
| CI jobs | hub-python (installs from `uv.lock` with `uv sync --locked`, FB-096), hub-go, mes-module, secrets-scan; auto-PR workflow; Deploy Tutorial workflow (Node 22; runs the framework's tests, builds the deck and its two gates on every push that touches it, publishes `main` to GitHub Pages at https://reh3376.github.io/forge/; Pages enabled 2026-10-28) |
| Commits | 1,741 (includes the imported MES history) |

---

## 3. Component by component

Legend: ✅ exists and wired · 🟡 exists, partly wired or partly governed · ⬜ not started. Gaps name the backlog item.

### 3.1 Transport and ingest

| Capability | State | Notes |
|---|---|---|
| gRPC `AdapterService`, Python and Go bindings | ✅ | `src/forge/proto`, `src/forge/transport`, `go/gen/forge`; `RecordContext` carries the context field registry's slots (`shift_id`, `event_type`, `event_timestamp`, `work_order_id`) since FB-013 |
| TLS / mTLS hub → spoke and spoke → hub | ✅ | FB-063, FB-072 |
| Per-spoke callback token, scoped hub endpoints | ✅ | FB-063 |
| Push persisted and FACTS-checked at Register | ✅ | FB-053; `forge.ingest`, `forge.ingest.facts_check` |
| Pull: Collect, Backfill, Subscribe/Unsubscribe on the spoke | ✅ | FB-061, FB-071 |
| Hub → spoke write-back (session-bound callback) | ✅ | FB-054 |
| Durable adapter registry and ingest log | ✅ | FB-060, migration 007 |
| FTTS transport spec and runner | 🟡 | Schema + runner exist; spec at `specs/grpc-hardened-transport.ftts.json`; no `docs/FxTS/FTTS.md` |
| Transport parity tests for the Go module | ⬜ | FB-055 |
| Hub is the time authority for its spokes and child hubs; skew measured at every link and enforced | 🟡 | Measured and exposed since FB-089 (2026-10-20): offset per adapter and link (spoke, server, source) from every record and from the OPC-UA probe's `CurrentTime`, on `AdapterHealth.clock`, `GET /v1/ingest/stats`, the OT connection status and OpenTelemetry (`forge.clock.offset`, `forge.clock.out_of_tolerance`), one warning per entry into breach of the provisional `FORGE_CLOCK_TOLERANCE_SECONDS` (1 s). Since FB-094 step 2 (2026-11-13) every OPC-UA service response measures the server's clock too (the response-header tap), the probe cadence is a per-connection runtime setting, and each series is keyed by the clock measured (`clock_id`). Enforced on the OT links since FB-093's OT half (2026-11-15: a PLC connection unreadable or outside its class for three probes is refused); hub time in the contract since FB-092 (2026-11-15: the four-timestamp exchange on Register, Health and Ingest; a spoke that reports it is measured two-way and held to its declared class); enforced on the spoke link since FB-093's hub half (2026-11-17: every Register, Health and Ingest request is a probe of the spoke's clock; three probes outside the class, or three with no measurement, refuse the spoke's Register and Ingest until three good probes; a manifest without `time_governance` is refused; the refusal is on the spoke's `AdapterHealth`, the API, the CLI, the log and the metric); the hub's REST ingest carries no exchange and is to be retired (FB-123); no hub → hub link (FB-118); D-9 signed 2026-11-03 (per-link tolerance classes, six record fields, fields first then the exchange, never silent), implementation in the record's step order. Recorded 2026-11-15: nothing checks a Forge host's own clock (FB-119), the IT spokes do not read their source system's clock (FB-120), only OPC UA has a clock reader (FB-117), and the time chain between hubs waits for the hub of hubs (FB-118) |
| Hub stamps `ingestion_time` with its own clock on receipt (gRPC push, pull, REST); the spoke's own send time is `spoke_time`, none invented | ✅ | `IngestPipeline.ingest` → `stamp_receipt`, one hub-clock reading per batch (FB-087, 2026-10-20); `spoke_time` is on the wire since FB-092 (2026-11-15, proto field 10; it was the hub-local `sent_time`), stamped by the spoke as a record leaves, and a send time an older spoke puts in `ingestion_time` is moved there on receipt |
| No record builder invents a source time: a value without a source stamp is refused unless its connection declares `source_timestamp_origin: forge`; then Forge's read time stands in and the record says so (`source_clock`, `source_uncertainty_seconds`); the refusal is on health, status, API, CLI and the `forge.ingest.refused` metric | ✅ | FB-088 (2026-11-13, D-9 step 1): `forge.core.clock.resolve_source_stamp` behind the OPC-UA converter and tag registry, the nine adapters and the BOSC collectors, the Ignition bridge, `IngestPipeline.coerce` and the interim MES bridge mapper; the declaration is the FACTS `time_governance` section on the manifest since FB-090 (2026-11-13; a connection parameter that contradicts it is refused at configure, the OT module's per-connection spec refines it); at rest the hypertable still keeps only `source_time` (FB-108) |
| Every spoke declares how it is time-governed (time source, sync protocol, clock-read method, probe cadence, stamp origin, tolerance class, fail closed, per-connection entries); the check is blocking and the deployment requirement is written down | ✅ | FB-090 (2026-11-13, D-9 step 4): required FACTS `time_governance` section and `facts:time-governed`; `AdapterManifest.time_governance` on the wire (proto field 13; Python, Go, bridge) and in every adapter's `manifest.json`; all nine specs re-stamped and approved by the owner; `docs/deployment/clock-discipline.md`; enforcement is FB-093 (the OT links since 2026-11-15; the spoke link next, on FB-092's two-way measurement) |
| Every timestamp Forge stores is UTC and timezone-aware; a naive datetime or an offset-less string is rejected at the model | ✅ | `forge.core.clock` (`utc_now`, `require_utc`, `OneClockModel`) behind `RecordTimestamp`, every manufacturing entity, `DataProduct` and the decision models; no `utcnow` left; ruff `DTZ` blocking (FB-014, 2026-10-20). The OT module's `DataValue`/`TagValue` still coerce naive to UTC (OPC UA `DateTime` is UTC by definition) and the adapters read an offset-less source string as UTC (FB-090's `time_governance` section has no field for the offset a spoke assumes; that declaration goes with FB-091) |

### 3.2 Hub platform

| Capability | State | Notes |
|---|---|---|
| Hub REST API (adapters, records, writes, subscriptions, backfill, collect, ingest log, info/health) | ✅ | `src/forge/api/main.py` |
| Curation service mounted | ✅ | `/curation`; one curation engine builds each data product's pipeline from its `CurationSpec` and runs it on ingest for the published products the adapter feeds, curated records persisted with the raw ones (FB-009, 2026-10-22) |
| Context Engine (F21) and Schema Registry (F20) | ✅ | Served by the hub under `/v1/context` and `/v1/schemas` (FB-001); Postgres stores through the factory, migration 009 (FB-005); both 2026-10-22 |
| Gateway: auth, RBAC, rate limiting | 🟡 | Middleware exists; auth off by default; only state-changing routes carry a scope (`adapters:write`, `context:write`, `schemas:write`), reads are open (FB-007) |
| Access controller persistence | ✅ | `PersistentAccessController` over `forge_core.module_permissions` / `access_audit` (migration 008), handed out by the storage factory and run by `forge db access` (FB-003, 2026-10-22) |
| Registry/equipment tables in Postgres | ✅ | Migration 009 (FB-005, 2026-10-22) |
| Observer | 🟡 | Package exists; no SLO/FOTS wiring |
| CLI `forge` | ✅ | adapter list/status, governance run/validate-spec, migrate up/status/down, db access grant/revoke/list/issue |

### 3.3 Storage

| Capability | State | Notes |
|---|---|---|
| Engines: PostgreSQL, TimescaleDB, Neo4j, Redis | ✅ | `forge.storage.engines` |
| Storage router and factory | ✅ | |
| Schema references: one grammar (`forge://schemas/<spoke>[/<Entity>][/v<version>]`), three roles, held at every boundary | ✅ | `forge.core.schema_ref` (FB-008, 2026-10-22); the two registries themselves are not converged: FB-097's design record, `docs/decisions/one-schema-registry.md` (D-10), signed 2026-11-03; its eight steps follow |
| Versioned migrations (12) | ✅ | Online runs through asyncpg on SQLAlchemy's async engine (FB-003); 008 replaces the two 001 tables it had collided with; 011 gives `forge_ts.contextual_records` one column per `RecordContext` slot (FB-013); 002's downgrade drops what each spoke role holds before the role, so a full downgrade runs to base (FB-098, 2026-10-26); 002 creates the spoke roles `NOLOGIN` and 012 closes the placeholder login on a database that applied 002's earlier text, unless Forge issued the role (FB-099, 2026-10-26); 006's downgrade removes the `forge_ts` schema, so a downgrade to base leaves only Alembic's version table (FB-101, 2026-10-27; FB-100 recorded, waits on FB-057 step 2) |
| Forge-issued module database credentials (`forge db access`) | ✅ | FB-057 step 1, migration 008, on the persistent controller since FB-003; password printed once, never stored |
| `mod_mes` schema in the hub (MES data moves in) | ⬜ | FB-057 steps 2–5, after the FB-076 design |
| Backups, restore procedure | ⬜ | No backlog id yet |

### 3.4 Spokes (adapters)

| Spoke | Code | FACTS spec | Notes |
|---|---|---|---|
| whk-wms | ✅ 772 lines | approved (reh3376, 2026-11-13; FB-090 re-stamp) | reference spec |
| forge-mes | ✅ 1,078 lines + the NestJS spoke | approved (reh3376, 2026-11-13; FB-090 re-stamp) | 18 data sources incl. AuditLog backfill (FB-071) |
| whk-cmms | ✅ 810 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | cross-module flows and pre-FHTS history moved to `metadata` |
| whk-erpi | ✅ 769 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | same |
| whk-nms | ✅ 853 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | pre-FHTS history moved to `metadata` |
| bosc-ims | ✅ 1,909 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | gRPC source types now in the schema |
| next-trend (historian) | ✅ 801 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | dead-letter keys renamed to the schema's |
| scanner-gateway | ✅ 1,403 | approved (reh3376, 2026-11-13; FB-090 re-stamp) | own proto under `proto/scanner`; routing rules and scan rejection moved to `metadata` |
| ot-module | ✅ (the OT module itself) | approved (reh3376, 2026-11-13; FB-090 re-stamp) | `facts:schema-valid` (66 violations) + 8 vocabulary failures; three disagreeing identities (FB-079) |
| csv_file, mqtt_sparkplug, opcua, rest_generic | ⬜ | — | package stubs only (one-line `__init__`) |

The FACTS runner validates every spec against the JSON schema first (`facts:schema-valid`, FB-080) and reads its enums from the schema; 8 of 9 specs validate, the OT spec waits on FB-079 (D-8 decided 2026-11-03: extend the enums).

### 3.5 OT module (forge-ot)

| Capability | State | Notes |
|---|---|---|
| OPC-UA client (asyncua), tag engine, context resolvers | ✅ | `forge.modules.ot.opcua_client`, `tag_engine`, `context`; asyncua pinned `==2.1.0` (FB-085) |
| Tag `source_time` is device time corrected to master by the device's measured clock offset, original stamp and offset recorded | ✅ OPC UA | Since FB-094 step 3 (2026-11-13) the OT builder corrects the source and server stamps by the declared clock's filtered offset where they enter the spoke, and the record keeps the stamp as sent, the offset, the uncertainty and the time quality (all six P-3 fields); the clock is read on every OPC-UA response and on the runtime probe cadence (step 2), and no source time is invented (FB-088). Every value carries its sampling bound (step 6: `max_sampling_uncertainty_ms` per tag, a tighter requirement refused at load). The FACTS declaration is in since FB-090 (2026-11-13) and the refusal since FB-093's OT half (2026-11-15: `CLOCK_UNREADABLE` and `CLOCK_OUT_OF_TOLERANCE` after three consecutive probes against the link's tolerance class, the provider stopped, reads and writes refused, no restart loop, three good probes to resume, the cause on the status, the health, the API and an alarm). Remaining: Logix, S7 and Modbus readers follow their drivers. Design record `docs/decisions/one-clock-ot-source-time.md` drafted 2026-10-21, signed 2026-11-03 |
| ISA-18.2 alarming (state machine, detector, engine, integrations, API) | 🟡 | `forge.modules.ot.alarming`: the package exists and is tested, but the hub's OT host composes no `AlarmEngine`, so it does not run in the deployed hub (FB-115, found 2026-11-15) |
| Control writes: validation → review → interlocks → authorization → write with read-back → audit | ✅ | `forge.modules.ot.control`; audit in the hub store and an external MQTT publisher (FB-066, FB-067) |
| MES changeover: orchestrator, PLC CIP runner, recipe integration, REST | ✅ | FB-062, FB-065 |
| Hosted in the hub with PLC connections, supervision, liveness | ✅ | FB-069, FB-070; `forge.modules.ot.host` |
| i3X REST shape, MQTT ingress, Ignition bridge (read-only parallel run) | ✅ | `i3x`, `mqtt`, `bridge` |
| Scripting SDK replacing `system.*` | ✅ | `forge.sdk.scripting` |
| Server-side two-step review and reason codes for writes | ✅ | FB-074 (2026-10-17): `WriteReviewer`, stage/commit REST behind `adapters:write`, `REJECTED_REVIEW`; multi-party approval follows FB-075 (D-1 signed 2026-11-03) |
| OT control changeover/connection POST endpoints behind a hub scope | ✅ | FB-082 (2026-10-17): `adapters:write` on confirm-start, retry-recipe, resume and connection restart; the hub user is the actor on the MES write, audit record and events |
| Batch context resolver wired to MES | ⬜ | FB-020 |
| One adapter identity (code says `forge-ot-module`, manifest and spec say `ot-module`) | ⬜ | FB-079 (includes FB-018) |

### 3.6 forge-mes

| Capability | State | Notes |
|---|---|---|
| NestJS backend + Next.js frontend imported as the bridge | ✅ | `modules/Forge MES`; spoke speaks the contract (push, pull, Collect, token, TLS) |
| Go rewrite from the module SDK | ⬜ | FB-076; design record signed 2026-11-03 (D-3, `docs/decisions/forge-mes-go.md`): ten steps, the Go SDK scaffold (FB-017) first |
| Prisma data into the hub's `mod_mes` | ⬜ | FB-057 steps 2–5 |
| Frontend retired in favour of forge-display | ⬜ | after forge-display exists |

### 3.7 Module SDK and Go

| Capability | State | Notes |
|---|---|---|
| Python module builder (manifest builder, scaffolder, generators, `forge module init`) | 🟡 | Adapter-style, backend-only templates (FB-017); duplicate SDK copies drift (FB-019) |
| Go models mirroring the core models | ✅ | `go/internal/models` (2,078 lines, 1,665 of tests; the time exchange and `spoke_time` since FB-092); `Lot.item_id` (FB-010) and the `RecordContext` slots (FB-013) with the Python models; every manufacturing entity has a `New*` constructor with the Python defaults and a `Validate()`, held equal to the Python models by one fixture both suites read (FB-016) |
| Go scaffold | 🟡 | `go/internal/scaffold` (112 lines); not a module template yet |
| `forged` daemon, `forgectl` | ⬜ | 22- and 36-line placeholders |
| Template module copies (`modules/Forge CMMS`, `Forge ERPI`, `Forge DB Orchestration`) | 🟡 | adapter templates, not Go modules |

### 3.8 forge-display and FVTS

| Capability | State | Notes |
|---|---|---|
| FVTS v0.1.0 schema, 19-check runner, render-profile baseline, reference renderer, golden messages, CI gate | ✅ | FB-077 (PR 36); `src/forge/governance/fvts`, `tests/governance/fvts` |
| OT reference FVTS spec with real tags, owner-approved | ⬜ | FB-078 (invented fermenter points today; `pending_review`) |
| forge-display runtime (any profile) | ⬜ | no code; no backlog id until the design lands |
| FVTS open decisions (name, write authority per profile, mobile acknowledge, transport, layout format) | ✅ | D-4 decided 2026-11-03, recorded in `docs/FxTS/FVTS.md` ("Decisions") |

### 3.9 Governance (FxTS)

| Framework | State |
|---|---|
| FATS | schema + runner + 28 specs (one per hub-served route) |
| FACTS | schema + runner (`facts:schema-valid` + 35 rule checks, `facts:time-governed` among them since FB-090; enums read from the schema) + 9 specs, each with the required `time_governance` section; 8 validate (OT spec: FB-079); all 9 approved by reh3376 on 2026-11-13 after the FB-090 re-stamp |
| FHTS | hashing, verification, approval, revert, registry; owner-only approval in practice |
| FTTS | schema + runner + 1 spec; no doc page |
| FVTS | schema + runner + reference renderer + 1 spec |
| FQTS, FSTS | stubs |
| FDTS, FLTS, FNTS, FOTS, FPTS | planned (doc pages only) |
| Spec integrity CLI (`forge governance specs`, `stamp`, `approve`) and `forge governance run` for FATS, FACTS, FVTS, FTTS | ✅ FB-021, FB-083 (2026-10-18) |

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
| Docker Compose (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio, forge-init, forge-hub) | ✅ dev only | `deploy/docker` |
| Hub container image | ✅ | `deploy/docker/Dockerfile.forge`, built from `uv.lock` with `uv sync --locked` (dependency layer before the source, `ot` extra in, dev tooling out; `.dockerignore` keeps the context to what it copies) since FB-096 (2026-10-24) |
| Hub health probes (`/v1/health`, `/readyz`) | ✅ | All seven compose-stack components (postgres, timescaledb, neo4j, redis, kafka, rabbitmq, minio) since FB-006 (2026-10-22) |
| Clock discipline requirement (the NTP/PTP chain from the top hub, tolerance classes, what fails closed, the new-site checklist) | ✅ written | `docs/deployment/clock-discipline.md` (FB-090, 2026-11-13); enforced on PLC connections since FB-093's OT half (2026-11-15); the spoke link is measured two-way since FB-092 and enforced since FB-093's hub half (2026-11-17) |
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
| Decision record, owner-signed | ✅ | `docs/decisions/process-control-framework.md` (D-11, 2026-11-13, the owner's PR 93); agent context in `docs/personal/` |
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
| D-4 | FVTS open items — **decided 2026-11-03** (`docs/FxTS/FVTS.md`, "Decisions") | nothing; forge-display design can start |
| D-5 | Hub core language (Python vs Rust) — parked | nothing in the current sequence |
| D-7 | Scope of the Go standard (OT module and Python adapters) | long-term shape of `src/forge/modules` and `src/forge/adapters` |
| D-8 | FACTS vocabulary for OT adapters — **decided 2026-11-03**: extend the enums (option a) | nothing; FB-079 can start, then the OT FACTS spec's approval |
| D-9 | One clock: which established standards to adopt — **signed 2026-11-03** (`docs/decisions/one-clock-ot-source-time.md`, round 2: tolerance classes, six record fields, `origin: forge` allowed, 30 s default cadence adjustable at runtime, NTP with T0 acceptable, fields first then the exchange, never silent) | nothing; FB-088, FB-094 (steps 2, 3, 6) and FB-090 done 2026-11-13, FB-093's OT half (step 5) and FB-092 (step 7) 2026-11-15; FB-093's hub half and FB-091 follow |
| D-10 | One schema registry — **signed 2026-11-03** (`docs/decisions/one-schema-registry.md`, round 2) | nothing; FB-097's eight steps |
| D-11 | Three-layer process control framework (PC-L1/PC-L2/PC-L3) — **signed 2026-11-13** (`docs/decisions/process-control-framework.md`, rounds 1 to 3, Q-1 to Q-50; the owner's PR 93); the Forge review done 2026-11-13 (§4a), nine round-4 questions open, O-2, O-3 and O-4 among them | WS-12: the framework FSD and the layer FSDs (FB-110); nothing is implemented before its FSD |

---

## 5. Largest gaps against the vision

1. **No forge-display** (vision §P-8): the contract and runner exist; the renderer does not.
2. **No management module in Go** (vision §3.3): the migrated NestJS/Next.js application stands in for forge-mes until the Go module is built; the SDK template does not exist yet.
3. **No scoped roles in force** (vision §P-11): the gateway's auth is off by default; the role model is signed (D-1, 2026-11-03) and not yet enforced (FB-075).
4. **No federation** (vision §P-10): a single hub only; no hub-of-hubs code.
5. **Seven governance frameworks are stubs or planned**; FACTS now validates against its own schema and all nine of its specs carry owner-approved hashes (FB-090 re-stamp, approved 2026-11-13).
6. **No production deployment** (vision §P-12).
7. **Clock discipline enforced on the plant floor and on every spoke the hub registers; not on Forge's own hosts or between hubs** (principle "one clock", owner 2026-10-18): every spoke declares how it is time-governed since FB-090 (2026-11-13) and the deployment requirement is written down, and a PLC connection whose clock is unreadable or outside its class is refused since FB-093's OT half (2026-11-15), and since FB-092 (2026-11-15) the hub gives its time to every spoke in the contract and keeps each reporting spoke's clock two-way, and since FB-093's hub half (2026-11-17) it refuses a spoke whose clock is outside its class or that reports no measurement; but its own REST ingest carries no exchange until it is retired (FB-123), the baseline every module must meet is not written down (FB-124), it checks no clock of its own (FB-119) and has no hub above or below it (FB-118; a tag's source time is corrected by the measured server or device clock on OPC UA since FB-094 step 3; no source time is invented since FB-088 on 2026-11-13, a value without one is refused unless the connection declares origin forge; naive timestamps are rejected since FB-014, the hub stamps receipt since FB-087 and every link's offset is measured and alerted since FB-089, all 2026-10-20).

---

## 6. How to update this page

Before a push that changes any row above: change the row, the numbers in §2 if they moved, and the status date. If a decision in §4 is taken, move it to `ROADMAP.md` §1 and remove it here. New gaps get a backlog id first, then a row.
