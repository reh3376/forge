# Forge, complete — what it will be and the problems it solves

**Status date:** 2026-10-16 · **Owner:** reh3376 · **Companions:** [Where we are going](WHERE-WE-ARE-GOING.md) · [Where we are](WHERE-WE-ARE.md) · [Roadmap](ROADMAP.md) · [Principles](PRINCIPLES.md) · [Backlog](../BACKLOG.md)

This document defines the finished product. It is written in the present tense about a system that does not fully exist yet; the gap between this page and [Where we are](WHERE-WE-ARE.md) is the work. Nothing here is a status claim. When a decision in [`ROADMAP.md`](ROADMAP.md) §1 changes, this page changes with it.

---

## 1. Definition

**Forge is the industrial data operations platform for a manufacturing enterprise.** It connects every operational system a plant runs on (SCADA/PLC, MES, WMS, CMMS, ERP, QMS, historians, network management, lab and scanner devices), turns their output into one governed record type with manufacturing context attached, curates that into decision-quality data products, and renders every operator and management interface from declarative specifications. Its own management modules (forge-mes, forge-whs, forge-cmms, forge-ot, …) are optional: a site can run Forge purely as the integration and governance layer over the software it already has, or replace that software module by module.

The design thesis: **bad manufacturing decisions come from missing quality, context and correlation, not from missing data.** Forge is built so that every datum is validated (quality), carries where/when/what/who it belongs to (context), can be joined with every other datum by that context (correlation), and so that the decision taken on it is itself recorded and measured.

Forge is also a **governed engineering platform**: contracts between components are machine-checked specifications with hash integrity and owner approval, so that neither people nor AI coding agents can change an interface silently.

---

## 2. The problems Forge solves

Each problem is stated as it is experienced in a plant, followed by what Forge does about it, which component carries it, and what "solved" looks like.

### P-1 · Every system is an island with its own data shape

A distillery runs on a dozen systems bought at different times from different vendors. Each has its own identifiers, units, timestamps, time zones, quality flags and assumptions. Correlating a batch's fermentation temperature with its lot record, the operator on shift and the work order that moved it means a person with four screens open.

**Forge:** hub and spoke. Every system is a *spoke* that speaks one contract, `forge.v1.AdapterService` (Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover), to the *hub* (forge-core). Every record that crosses that boundary is a `ContextualRecord`: value, quality code, timestamps, source identity and a `RecordContext` (site, area, equipment, lot, shift, operator, work order, operating mode, …). The hub validates, routes and persists it.

**Component:** transport (`forge.transport`), ingest (`forge.ingest`), core models (`forge.core.models`), the adapter base classes (`forge.adapters.base`).

**Solved when:** every production system at a site has a spoke, and any two records from any two systems can be joined on context without a human mapping step.

### P-2 · Values arrive without context

A tag value `TIT_2010 = 61.2` is useless without knowing it is Cooker 01's temperature, in the Granary area, during lot L-2026-0412, on the night shift, in `Cooking` mode. Historians store values; context lives in people's heads or in spreadsheet lookups.

**Forge:** context is a first-class, declared part of every integration. A spoke's FACTS specification maps source fields to Forge context fields and declares enrichment rules; the hub's enrichment pipeline fills what the source cannot (shift from timestamp, area from location, lot from the active batch). The manufacturing entity catalog (`docs/core/manufacturing-entity-catalog.md`) and the ISA-95 / ISA-88 typed hierarchy define what context *means*, so "area" is the same thing in every spoke.

**Component:** FACTS context mapping, `forge.context` (Context Engine), `forge.core.models.manufacturing`, the OT module's context resolvers.

**Solved when:** no record is persisted without its required context fields, and the required set is declared per spoke and checked by the FACTS gate.

### P-3 · Nothing can be trusted enough to decide on

Numbers from different systems disagree. Nobody can say which transformation produced a dashboard figure, whether the unit conversion was right, or whether a source was stale when the figure was computed. Decisions are made on confidence rather than evidence.

**Forge:** curation with lineage. Raw records flow through a normalization engine (units, time bucketing, value alignment) into versioned *data products* with published quality objectives, and the lineage from raw record to transformation to product is recorded and queryable. The quality framework (FQTS) states what "good" means per product; the normalization framework (FNTS) checks that units and definitions agree across spokes; the lineage framework (FLTS) checks the chain is unbroken.

**Component:** `forge.curation` (normalization, data product registry, pipeline, lineage, quality), Neo4j for lineage, TimescaleDB for time series; FQTS/FNTS/FLTS.

**Solved when:** every figure on a surface can be traced to its sources and transformations, and its quality objective is visible beside it.

### P-4 · SCADA and HMI lock the plant to one vendor

The OT layer (tags, alarms, historian, scripting, HMI screens) is a vendor product licensed per client, per tag or per server, scripted in a vendor dialect (Jython 2.7 on Ignition), with UIs that cannot leave the vendor's runtime. Replacing it is a rip-and-replace project; keeping it is a permanent cost and a hard ceiling on what the plant can build.

**Forge:** an OT module (forge-ot) that is a thin, open wrapper over OPC-UA (asyncua owns the wire protocol): a nine-type tag engine, ISA-18.2 alarming, a Python 3.12+ scripting SDK covering the `system.*` surface plants already use, an i3X-shaped REST interface, and history. Where a site keeps its vendor SCADA, an *integration module* (forge-ignition) bridges it; the dual-write validator proves parity before a cut-over. HMI/SCADA itself is an optional module (forge-hmi-scada) activated per site (decision A-4).

**Component:** `forge.modules.ot` (opcua_client, tag_engine, alarming, bridge, i3x, scripting SDK under `forge.sdk.scripting`), forge-ignition, forge-hmi-scada.

**Solved when:** a site can run its OT layer on Forge alone, or on its vendor product behind forge-ignition, with the same surfaces either way.

### P-5 · Integrations are one-off projects that rot

Each connection is custom code written once, documented in an email, and broken by the next upgrade on either side. Nobody knows what a spoke is allowed to do, what it must deliver, or whether it still does.

**Forge:** a module SDK and machine-checked contracts. A spoke or module is scaffolded from a template with a manifest, a FACTS spec (what it reads, writes, subscribes to, backfills; its context mapping; its error handling), tests, and a place in CI. The governance suite (FxTS: FATS for APIs, FACTS for adapters, FTTS for transport, FVTS for views, FDTS for data schemas, FHTS for hash integrity, FQTS, FSTS, FOTS, FPTS, FLTS, FNTS) turns each contract into a gate. A spoke that drifts fails its gate before it fails production.

**Component:** `forge.sdk.module_builder` and the Go scaffold under `go/`, `forge.governance.*`, CI jobs.

**Solved when:** onboarding a new system is a day's work from the SDK, and a conformance failure anywhere blocks the merge, not the plant.

### P-6 · Writing to the plant floor is unsafe

UIs write setpoints to PLCs with no role check, no interlock, no confirmation, no read-back and no audit trail. The safest plants compensate with procedure; the rest compensate with luck.

**Forge:** safety stays in the core (decision A-7). Every write passes a defense chain in forge-ot: validation (type, range, writability), write review (a tag may require two-step review, where the core stages the write, returns the current value and issues a single-use token the commit must present, and a reason code from the site's vocabulary), interlocks (fnmatch patterns, seven condition types, bypass only by an admin with a reason), authorization (role per area and tag pattern), the write with read-back confirmation, and an audit record written to the hub store and published externally. A UI can *ask* for a write; it cannot make one. The view contract (FVTS) binds every UI action to a required role, a confirmation mode and the statuses it must handle, and the render profile decides whether a surface may write at all (desktop HMI: yes; web and mobile: no).

**Component:** `forge.modules.ot.control` (validation, interlock, authorization, write_engine, audit), FVTS actions and render profiles, the hub's write endpoint and audit log.

**Solved when:** no path exists from any interface to a PLC that does not pass the chain, and every write is reconstructible from the audit log.

### P-7 · Contracts change silently, now also by AI agents

Specifications are documents; anyone, or any coding agent, can relax a timeout, drop a required field or weaken an interlock pattern in a commit nobody reads closely. The more AI assistance a team uses, the larger this risk.

**Forge:** hash governance (FHTS). Every governed specification carries a hash of its content, a state (`approved`, `modified`, `pending_review`, `reverted`, `unknown`), a change history naming who or what changed it, and an approver. Agents re-stamp as `pending_review`; only the owner approves. Runners verify the hash before trusting the spec; the hub's Register check verifies a spoke's FACTS hash before accepting the spoke. The engineering workflow itself is governed: one backlog item per PR, every finding fixed or recorded, documentation current before every push, and a local, graph-backed project memory (MDEMG/Jiminy) that records constraints and outcomes for the agents that work on the codebase.

**Component:** `forge.governance.shared.runner` (hashing, verification, approval), `forge.governance.fhts`, `forge.ingest.facts_check`, the backlog/roadmap workflow, MDEMG.

**Solved when:** an unapproved change to any governed spec fails CI and is visible in the spec's own history.

### P-8 · Every module ships its own UI

Each application brings its own frontend stack, its own screens, its own idea of an alarm banner and its own mobile story. Operators learn five UIs; the company maintains five.

**Forge:** modules describe, forge-display renders (decision A-3). A module publishes an FVTS specification: the points it exposes (with units, precision, ranges, staleness), its alarms, its actions, its surfaces, and the render profiles it supports. forge-display, the one UI runtime, renders those surfaces on four profiles with a normative baseline — desktop HMI (20 Hz, writes, all alarm operations, kiosk), desktop app (10 Hz, no writes, acknowledge only), web (4 Hz) and mobile (1 Hz) — and a module can only tighten the baseline, never loosen it. ISA-101 styling, alarm presentation and staleness marking are the renderer's job, not each module's.

**Component:** `forge.governance.fvts` (schema, runner, render-profile baseline, reference renderer, golden messages), forge-display.

**Solved when:** no module in the repository contains UI code, and the same FVTS spec renders on all four profiles.

### P-9 · Decisions are not recorded, so their cost is never learned

A confidently wrong decision costs more than the data problem that caused it, the cost is spread across many units and shifts, and the root cause is rarely captured. Analytics projects produce dashboards, not better decisions.

**Forge:** the decision is a record. Data products feed decision support (human-in-the-loop, semi-autonomous where a site allows it), the decision taken is stored with the products and lineage it was based on (`forge.core.models.decision`), and outcomes are observed against it. The same curated products are the training and evaluation sets for site-specific models, so expertise is captured where it is exercised.

**Component:** `forge.curation`, `forge.core.models.decision`, `forge.observer`, data products for ML/AI use.

**Solved when:** a decision can be replayed: what was known, what was decided, what happened.

### P-10 · Multi-site enterprises break on the WAN

Sites must keep running when the link to headquarters is down; headquarters must still get the audit trail and must not become a bottleneck or a single point of failure for the plants. Who owns which data is undefined.

**Forge:** a hub of hubs along ISA-95 (decision R-9). Every instance has a site hub; a multi-site enterprise adds an enterprise hub; areas may have hubs below the site. Each hub owns what is attached to it directly (spokes, child hubs, subjects) and collects, governs, stores, curates and serves that data (R-13, R-14). Nothing communicates *through* a hub; a transfer *occurs at* it. Audit records always flow upward; other data is requested on demand unless a site opts into replication (R-17). Roles are assigned at the managing hub and inherited downward (R-16), and tokens verify offline against the issuing hub's public key (R-8), so a site keeps working when the WAN does not.

**Component:** hub topology and federation in forge-core; the roles decision record (`docs/decisions/roles.md`).

**Solved when:** a site hub runs for the full token lifetime with the enterprise unreachable, and the enterprise's audit view is complete when the link returns.

### P-11 · Credentials sprawl and nobody has a role model

Every application holds its own database password, often in a config file; access is "admin or not"; there is no way to say "operators in the distillery may acknowledge alarms there and see nothing from the ERP".

**Forge:** the hub owns the databases (A-6) and issues credentials: a module never carries a database password it created itself (`forge db access`). Identity is established by the installation's chosen method (OIDC and local accounts and service identities first, then LDAP/AD, then SAML — R-10), but **Forge** decides what an identity may do (R-2). Roles are scoped (R-7), shipped per module as data (R-12), chosen in shape by the installing administrator (R-3, R-4), and constrain reads as well as actions (R-11). Separation-of-duties rules (two-step review, interlock bypass with reason, approvals) are evaluated by the hub (R-6). Hub ↔ spoke traffic is TLS or mTLS in both directions with a per-spoke callback token.

**Component:** `forge.gateway` (auth, RBAC, rate limiting), `forge.storage.access`, transport TLS, the role model from `docs/decisions/roles.md`.

**Solved when:** the gateway enforces scoped roles on every route and RPC, modules hold only Forge-issued credentials, and a visibility rule such as "ERP hidden from distillery operators" is a configuration, not code.

### P-12 · There is no production deployment story

Docker Compose on a laptop is not a plant. Backups, health, upgrades and multi-node operation are afterthoughts.

**Forge:** each hub is a Kubernetes deployment (compose stays development-only), with the observer providing health, liveness and pipeline SLOs (FOTS), performance baselines (FPTS) and scheduled backups of every store. Modules are hosted by the hub (in-process today for forge-ot; as Go services for the management modules).

**Component:** `deploy/`, `forge.observer`, FOTS/FPTS.

**Solved when:** a site hub can be stood up, upgraded and restored from backup by procedure, and its SLOs are visible.

---

## 3. The finished system

```
                         ┌──────────────── enterprise hub ────────────────┐
                         │  roles · audit · enterprise spokes (ERP, …)    │
                         └───────────────┬───────────────┬────────────────┘
                     audit ↑ / on demand ↓               ↓
          ┌──────────────── site hub (forge-core) ────────────────┐
          │ transport · ingest · storage · context · registry     │
          │ curation · gateway · observer · governance · CLI      │
          └──┬────────────┬────────────┬────────────┬────────────┘
             │ gRPC       │ gRPC       │ in-process │ FVTS
     ┌───────┴──┐  ┌──────┴─────┐  ┌───┴──────┐  ┌──┴──────────┐
     │ spokes   │  │ management │  │ forge-ot │  │forge-display│
     │ (WMS,    │  │ modules    │  │ OPC-UA,  │  │ 4 profiles  │
     │ CMMS,    │  │ (Go): mes, │  │ alarms,  │  │ HMI / app / │
     │ ERP, NMS,│  │ whs, cmms… │  │ writes,  │  │ web / mobile│
     │ scanners)│  │            │  │ scripting│  │             │
     └──────────┘  └────────────┘  └──────────┘  └─────────────┘
                 integration modules (forge-ignition) · optional forge-hmi-scada
```

### 3.1 The hub (forge-core)

| Layer | What it is when complete |
|---|---|
| **Transport** | `forge.v1.AdapterService` over gRPC with TLS/mTLS both ways; push (`Ingest`), pull (`Collect`, `Backfill`, `Subscribe`), write-back (`Write`) and discovery; Go and Python bindings generated from one proto set. |
| **Ingest** | Validates the manifest against the spoke's FACTS spec (hash verified), validates each record, routes by type to the right store, writes an ingest log, feeds curation. |
| **Storage** | The hub owns PostgreSQL (relational, one schema per module with Forge-issued credentials), TimescaleDB (time series, contextual records), Neo4j (lineage, topology), Redis (cache, sessions). Migrations are versioned; modules never connect on their own credentials. |
| **Context Engine** | Resolves and enriches context (shift, area, lot, equipment) and serves the context field registry. |
| **Schema Registry** | Versioned schemas for records and data products; compatibility rules (FDTS). |
| **Curation** | Normalization, data product registry, pipeline, lineage, quality monitoring. |
| **Gateway** | Authentication by the installation's chosen method, scoped RBAC on every route and RPC, rate limiting, separation-of-duties evaluation. |
| **Hub API** | REST for operators and modules (adapters, records, writes, subscriptions, backfill, collect, ingest log, info/health) plus the mounted service APIs (curation, context, schemas). |
| **Observer** | Health, liveness, SLOs, performance baselines, backup status. |
| **CLI (`forge`)** | Adapter listing/status, governance run/validate, migrations, database access issuance, module scaffolding. |
| **Governance** | The FxTS suite as CI gates, with FHTS hashing on every spec. |
| **Federation** | Hub of hubs: registration of child hubs, upward audit, on-demand data requests, offline token verification. |

### 3.2 Spokes

An adapter per external system, each with a manifest and an approved FACTS spec: whk-wms, whk-cmms, whk-erpi, whk-nms, bosc-ims, next-trend (historian), scanner-gateway, and generic adapters (REST, CSV/file, MQTT Sparkplug, OPC-UA) for systems without a dedicated one. Spokes are Python inside the hub or external processes in any language that speaks the proto.

### 3.3 Modules

- **Management modules** (`forge-<management service>`): forge-mes, forge-whs, forge-cmms, and later forge-qms, forge-erpi, … — all Go, generated from the module SDK template (A-2, A-5), each with a manifest, FACTS spec, FVTS spec, its `mod_<name>` schema in the hub's PostgreSQL, and no UI of its own.
- **forge-ot**: the OT module (§P-4), hosted by the hub, with PLC connections, supervision and liveness.
- **Integration modules**: forge-ignition (and successors) for sites that keep vendor software.
- **forge-hmi-scada**: optional, activated per site.

### 3.4 forge-display

The single UI runtime. Reads FVTS specs, subscribes through the hub, renders surfaces on the four profiles with the normative baseline, enforces nothing safety-critical itself (the core does), and ships the reference renderer's behaviour: staleness marking, bad-quality handling, ISA-101 presentation, alarm annunciation, action feedback with audit confirmation.

### 3.5 Governance suite (FxTS)

| Framework | Governs |
|---|---|
| FATS | API contracts (routes, shapes, status codes) |
| FACTS | Adapter conformance: identity, capabilities, lifecycle, connection, data contract, context mapping, error handling |
| FTTS | Transport: TLS, tokens, streaming behaviour |
| FVTS | Module ↔ display contract: points, alarms, actions, surfaces, profiles |
| FDTS | Schema evolution and compatibility |
| FHTS | Hash integrity and approval of every spec above |
| FQTS · FNTS · FLTS | Data quality, normalization, lineage |
| FSTS · FOTS · FPTS | Security controls, observability SLOs, performance |

Every framework has a schema, a runner with asserted schema–runner parity, specs, tests and a CI gate; every spec is hashed and owner-approved.

### 3.6 Security and identity

The role model in `docs/decisions/roles.md` (R-1 … R-17): installation-chosen identity method and role shape, Forge-decided assignment, scoped roles assigned at the managing hub and inherited downward, reads constrained like actions, separation of duties in the hub, offline-verifiable tokens with a one-hour default lifetime, service identities for spokes and modules.

### 3.7 The engineering platform

The repository is itself part of the product: one backlog item per PR, auto-opened PRs merged by the owner on green CI, findings fixed or recorded, documentation current before every push, specs approved only by the owner, local models only for tooling, and MDEMG/Jiminy as the governed memory for the agents that work on it.

---

## 4. Definition of complete

Forge is complete for a site when all of the following are true. Each line is an acceptance criterion, not a feature name.

1. **Every production system has a spoke** with an approved FACTS spec, and the hub rejects a spoke whose manifest or hash does not match it.
2. **No record is stored without context**: the required context fields are declared per spoke and enforced at ingest; ISA-95 hierarchy and manufacturing entities are typed, not strings.
3. **Any two records join on context** without bespoke mapping, and the join is a query, not a project.
4. **Every figure has lineage and a quality objective** visible from the surface that shows it.
5. **No interface can write to equipment** except through the core's defense chain, and every write is in the audit log with role, interlock result, confirmation and read-back.
6. **All UI is forge-display**, from FVTS specs, on four profiles, with the baseline enforced by the runner; no module ships UI code.
7. **Management modules are Go from the SDK**, hold only Forge-issued credentials, and own no database connection.
8. **The OT layer runs on forge-ot or behind forge-ignition**, interchangeably from the surfaces' point of view.
9. **Scoped roles are enforced** on every route and RPC; a visibility rule is configuration; separation of duties is evaluated in the hub.
10. **A site hub survives the WAN**: full operation for the token lifetime without the enterprise hub; audit complete on reconnection.
11. **Every governed spec is hashed and owner-approved**, and an unapproved change fails CI.
12. **Production deployment is Kubernetes**, with health, SLOs, backups and an upgrade procedure.
13. **Decisions are records** with the products and lineage they relied on and the observed outcome.
14. **Onboarding a new system is a day's work** from the SDK: scaffold, spec, conformance green, registered, data with context in the hub.
15. **One clock, from the top hub down**: the highest hub is the time authority, every hub governs the clocks of the modules and spokes attached to it, every stored timestamp is UTC and timezone-aware, the hub stamps receipt itself, skew is measured at every link, a tag's source time is when the value occurred at the device, corrected to master time by the device's measured clock offset, and a hub, module or spoke outside tolerance is refused.

---

## 5. What Forge is not

- Not a PLC programming environment. It reads and writes PLCs through OPC-UA; ladder and function blocks stay in the vendor tools.
- Not an ERP, accounting or HR system. It integrates them as spokes and may host a management module beside them; it does not replace the ledger.
- Not a cloud service. It is enterprise software installed per site and per enterprise, with local models for its own tooling.
- Not a UI framework for third parties. forge-display renders Forge modules; it is not a general dashboarding product.

---

## 6. Vocabulary

| Term | Meaning |
|---|---|
| **Hub** | A forge-core instance (site, area or enterprise) that owns its attached spokes, child hubs and subjects. |
| **Spoke** | An external system connected through an adapter that speaks `AdapterService`. |
| **Module** | Forge-native functionality hosted by or beside the hub: management modules, forge-ot, integration modules. |
| **ContextualRecord** | The one record type crossing the hub boundary: value, quality, timestamps, source, context. |
| **Data product** | A versioned, curated, quality-governed dataset derived from records with recorded lineage. |
| **Surface** | A screen or view described in an FVTS spec and rendered by forge-display. |
| **Render profile** | One of desktop_hmi, desktop_app, web, mobile; a normative ceiling on rate, writes and alarm operations. |
| **FxTS** | The family of Forge test specifications; each is a contract with a schema, a runner and a gate. |
| **FHTS state** | `approved`, `modified`, `pending_review`, `reverted`, `unknown`: where a spec stands in review. |
| **Managing hub** | The hub that assigns roles for an instance: the site hub of a single-site instance, the enterprise hub of a multi-site one. |
