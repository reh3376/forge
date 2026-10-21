# Forge — principles, invariants and origins

**Status date:** 2026-10-18 · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) (the destination) · [Where we are going](WHERE-WE-ARE-GOING.md) (direction) · [Where we are](WHERE-WE-ARE.md) (the snapshot) · [Roadmap](ROADMAP.md) (decisions in force) · [Backlog](../BACKLOG.md)

This page holds the reasoning that does not change with the state of the code: the design principles Forge was started from, the technical invariants every component obeys, the governance pattern, the decision-support frame, the technology choices and their status, where the first modules came from, how spokes were prioritised, and the engineering lessons that still bind. It replaces the top-level planning records retired on 2026-10-18 (§9). Decisions in force are in [`ROADMAP.md`](ROADMAP.md) §1 and override anything here that disagrees with them.

---

## 1. Design principles

Taken from the WHK Digital Strategy v4r0 (April 2026). They govern every design decision.

1. **Decision quality first.** Every meaningful component must improve the business's ability to make better decisions: preserve context, reduce ambiguity, shorten the time from signal to action, lower the cost of being wrong.
2. **Data ownership and openness.** The enterprise owns its data. Systems expose documented, standards-based APIs, support bulk export, and avoid lock-in that stops the business governing, reusing or migrating its own information.
3. **Integration first.** No net-new capability enters production without architecture, security and data-governance review. If a module cannot integrate cleanly into the platform, it does not fit the strategy.
4. **Build → Compose → Buy.** Custom where the capability is strategic; composed from open standards where practical; bought only when the product fits the guardrails, the data requirements and the operating model.
5. **Edge-driven, hub-governed.** Transform data as close to the source as practical, publish it to a governed hub for reuse. The edge reduces latency and noise; the hub preserves standards, lineage and reuse.
6. **Context before conclusion.** Data products keep the operating context needed to interpret them: lineage, time alignment, equipment state, material genealogy, operating mode, batch or lot, versioned definitions, normalisation factors. Reports that hide structure create avoidable decision error.
7. **Human judgment, structured challenge.** Systems support judgment rather than bypass it: assumptions visible, risk and opportunity reviewed, rationale captured, weak conclusions challengeable before action hardens.
8. **Security by design.** Zero-trust access, least privilege, strong identity, audit trails and a provable software supply chain are part of the foundation, not a bolt-on.
9. **Continuous improvement.** The platform is a living product, iterated through roadmaps, SLOs, measured outcomes and lessons learned. Progress is slowest at the foundation and accelerates as governed infrastructure matures.

---

## 2. Technical invariants

Architectural laws. Where the code does not yet satisfy one, [`WHERE-WE-ARE.md`](WHERE-WE-ARE.md) says so and the gap is a backlog item.

- **Specs are the source of truth.** Platform behaviour is defined by FxTS specifications; implementation conforms to the spec, not the other way round. A behavioural change is a spec change, and a spec change is reviewed. No specification field is silently ignored.
- **Context is a first-class citizen.** Every record carries its operational context (source, timestamp, equipment, batch/lot, operating mode, lineage) or a reference to it. Context is never silently dropped.
- **One clock, governed by the hub.** Forge exists so that people at every level of the organisation decide from the same picture, and records from different sources only reconcile if their timestamps come from the same master time. The highest hub in a system is the time authority for every hub and spoke attached to it; each hub governs the clock of every module and spoke directly connected to it; each spoke governs or measures the clocks of the source systems behind it (PLC, OPC-UA server, MES host). Every timestamp Forge stores is UTC and timezone-aware; the hub stamps receipt with its own clock; the offset of every connected clock is measured against its hub, recorded and surfaced; a hub, module or spoke outside tolerance is a conformance failure and its hub refuses its data (fail closed). Below the spoke, Forge reads the clock of every device and server it pulls from (PLC, OPC-UA server, third-party OT software), measures its offset from the master clock continuously, and corrects every incoming timestamp by that offset on entry, recording the original stamp and the offset applied; a device whose clock cannot be read is not a valid source. For a tag value, `source_time` is the time the value occurred at the device, corrected to master time, never the poll or relay time passed off as device time and never an invented time. The requirement and its checks are not optional: a spoke, module or hub that does not take time from its hub does not function in Forge, and warnings are not a substitute for correction. (Owner, 2026-10-18; FB-014, FB-087 and FB-089 done 2026-10-20; FB-088, FB-090 to FB-094; D-9.)
- **Governance is declarative.** Quality, lineage, normalisation and security rules are FxTS specifications, not code paths.
- **Schema–runner parity is mandatory.** Every field in an FxTS schema is enforced by its runner or reported as unimplemented with a hard fail (inherited from MDEMG's UxTS; asserted in the runner test suites).
- **Adapters are plugins.** Every integration is an adapter behind one interface, governed by a FACTS spec. The hub knows nothing about adapter internals.
- **Storage is polyglot.** Record types route to the engine that fits them; no single database serves every access pattern. The hub owns the databases (A-6).
- **Serving is API-first.** Consumers go through versioned APIs defined by FATS specs, never to a database directly.
- **Observability is built in.** Every service, adapter and pipeline emits structured telemetry (OpenTelemetry; FOTS specs when that framework lands).
- **Fail open where safe, fail closed where not.** Optional enrichment degrades gracefully; security, governance and spec-conformance checks fail closed.
- **Hub ↔ spoke is compiled protobuf over gRPC.** JSON over gRPC is forbidden (A-1).
- **Safety stays in the core.** Role checks, interlocks, confirmation, two-step review and audit for writes are enforced in forge-core, never only in a UI (A-7).

---

## 3. Spec-first governance (FxTS)

**The spec is the contract.** It defines what must exist and how it must behave; the implementation serves the spec; the runner enforces conformance; the CI gate blocks deviation. This is spec-first governance, not test-first verification: a FATS spec that says `GET /v1/data-products/{id}` returns 200 with a given shape is a prior commitment, not a test of an existing endpoint. Drift is caught by the runner; a spec change is a visible diff in review.

Every framework has the same four layers:

| Layer | What it is |
|---|---|
| 1 · Schema | JSON Schema 2020-12: structure, required fields, enums, constraints. Single source of truth for the spec format. |
| 2 · Specs | Declarative JSON, one file per contract, diffable in PRs. |
| 3 · Runner | Python harness that validates specs (and, where applicable, the live system) and emits a canonical report. |
| 4 · CI gate | Hard fail for contracts (merge-blocking); soft fail for quality (report only). |

Rules carried over from UxTS and confirmed in practice:

- A spec with zero assertions fails; it does not pass (the "0/0 problem").
- Parity: schema fields the runner does not enforce are reported, never ignored (§2).
- **Hashing (FHTS).** The content hash excludes the whole `integrity` block, because `change_history[].new_hash` refers to the hash itself; `hash_state`, `approved_by` and the history are metadata about the spec, not governed content. Canonical JSON uses sorted keys, compact separators and ASCII escaping so the digest is portable across platforms.
- **Only the owner approves** a spec hash (`forge governance approve <spec> --by reh3376`); agents re-stamp to `pending_review` and never approve on the owner's behalf.
- Framework inventory and status: [`VISION.md`](VISION.md) §3.5 and [`WHERE-WE-ARE.md`](WHERE-WE-ARE.md) §3.9; developer guide: [`governance/facts-developer-guide.md`](governance/facts-developer-guide.md); CLI: `forge governance specs | stamp | approve | run | validate-spec`.

---

## 4. Decision support: the minimum decision frame

The BBD papers (Part 1, information architecture; Part 2, human judgment) are the research basis for problem P-9 in [`VISION.md`](VISION.md). Decision quality degrades from incomplete information and from undisciplined judgment. The collection, governance, storage, curation and serving layers address the first; the decision-support layer addresses the second. Requirements the platform takes from them:

- Preserve and surface **base rates** alongside alerts (base-rate neglect).
- Support **normalisation and segmentation before comparison** (Simpson's paradox): comparisons declare their normalisation basis or say "unnormalised"; aggregate views link to the segmented views beneath; operating conditions are shown with performance metrics.
- Link multi-departmental context so hidden variables are findable (spurious correlation); surface several departmental views of the same data (framing).
- Require **disconfirming evidence** before action hardens; force assumptions into the open; distinguish confidence from evidence in every display; make structured challenge procedural, not optional.

For significant decisions (capital allocation, process changes, root-cause conclusions, vendor selection, quality dispositions) the decision-support module implements the 13-point minimum decision frame:

| Step | What the system records |
|---|---|
| I. Scope | What is being decided, why now, who is affected |
| II. Current hypothesis | Free text with required evidence links to data products |
| III. Supporting evidence | Links to records, queries, visualisations |
| IV. Challenging evidence | **Required**: the workflow does not advance without at least one entry |
| V. Alternative hypotheses | At least two for material decisions |
| VI. Key assumptions | Explicit list, each with a confidence level |
| VII. Missing information | Data gaps, pending tests, unavailable context |
| VIII. Risk if wrong | Likelihood × impact |
| IX. Opportunity if right | Quantified upside |
| X. Existing controls | Links to control records, not names |
| XI. Evidence of effectiveness | **Required**: "the control exists" is not evidence |
| XII. Reassessment trigger | A metric, threshold, date or event |
| XIII. Owner | A named person, not a department |

Every assumption recorded this way is a tracked entity (status active / validated / invalidated / superseded; confidence; owner; reassessment date; linked decisions). New data that contradicts an active assumption alerts its owner and the owners of every linked decision.

---

## 5. Adapter tiers

The FACTS schema is the source of truth for the vocabulary (`adapter_identity.tier`: `OT`, `MES_MOM`, `ERP_BUSINESS`, `HISTORIAN`, `DOCUMENT`; `adapter_identity.type`: `INGESTION`, `BIDIRECTIONAL`, `WRITE_ONLY`, `DISCOVERY_ONLY`). What the tiers mean:

| Tier | Systems | Typical protocols | Data |
|---|---|---|---|
| OT | PLC, SCADA, HMI, DCS, RTU | OPC UA, MQTT Sparkplug B, Modbus TCP, EtherNet/IP, PROFINET | High-frequency time series, real-time, deterministic |
| MES/MOM | MES, QMS, WMS, LIMS, CMMS, EBR | REST, GraphQL, database, OData, message topics | Transactions with batch/lot context, quality records |
| ERP/Business | ERP, SCM, CRM, PLM, BI, HRM | REST, OData, RFC/BAPI, database, GraphQL | Master data, financial transactions, planning, low frequency |
| Historian | PI, AVEVA, PHD, Canary, InfluxDB, NextTrend | Vendor APIs, REST, bulk export | Time-series archive, high-volume backfill |
| Document | SharePoint, file shares, DMS, email | WebDAV, Graph API, IMAP, filesystem | Unstructured; metadata extraction, classification |

The OT tier's vocabulary gap in FACTS v0.1.0 is decision D-8 (FB-079).

---

## 6. Technology decisions and their status

| Component | Decision | Status (2026-10-18) |
|---|---|---|
| Hub (forge-core) | Python ≥ 3.12, FastAPI, Typer CLI, Pydantic v2, uv, ruff | In force |
| Management and integration modules | Go, generated from the module SDK (A-2, A-5) | In force; replaces the April 2026 choice of NestJS + Next.js modules. the migrated NestJS/Next.js application runs as an interim bridge until the Go forge-mes module (FB-076) replaces it |
| User interfaces | forge-display renders every surface from FVTS specs (A-3) | In force; the FVTS runner and reference renderer exist, forge-display does not yet |
| Hub ↔ spoke transport | gRPC with compiled protobuf; mTLS both directions (FTTS) | In force |
| Module events | RabbitMQ topic exchange (the `wh.whk01.distillery01.*` proto-UNS); Kafka is in the compose stack as the enterprise bus when volume requires it | In force (RabbitMQ), planned (Kafka) |
| Relational / time series / graph | PostgreSQL 16 · TimescaleDB · Neo4j 5 | In force; hub-owned (A-6), module schemas `mod_<name>` |
| Object store · cache | MinIO · Redis | In the compose stack; health checks pending (FB-006) |
| Observability | OpenTelemetry + Grafana | Planned (FOTS) |
| Deployment | Docker Compose for development only; Kubernetes for production (P-12) | Compose in force; Kubernetes not started |
| Governance specs | JSON (UxTS convention), hashed and owner-approved (FHTS) | In force |
| Database ownership | Hybrid "observe → shadow → own": adapters read spoke databases, a shadow writer mirrors into the hub, ownership transfers per module | In force; design in [`DB_ORCHESTRATION_FRAMEWORK.md`](DB_ORCHESTRATION_FRAMEWORK.md), first step delivered (FB-057) |
| Identity | Installation-chosen identity method; roles assigned at the managing hub (R-1 … R-17) | Decision D-1 in progress, [`decisions/roles.md`](decisions/roles.md) |
| MDEMG/Jiminy tooling | Local models only (A-10) | In force |
| Licence | Commercial intent; model undecided | Open |

---

## 7. Origins: the WHK reference deployment

Forge is industry-general; the Whiskey House (WHK) deployment is its reference implementation, and each first-party module evolves from, or replaces, a system WHK runs today. The source repositories are templates, not the modules: each is refactored to the module SDK's structure as it is onboarded.

| Forge module | Origin | Replaces |
|---|---|---|
| forge-ot (OT module) | New build (Python, asyncua) | Ignition SCADA and the Ignition Global Jython middleware; direct PLC connectivity, tag acquisition, alarming, control writes. Target: Ignition decommissioned by 2027, with the Ignition bridge adapter carrying existing screens meanwhile |
| forge-mes | `whk-mes`, migrated into this repo as `modules/Forge MES` on 2026-10-15 | Production orders, recipes, scheduling, quality, ERP sync |
| forge-whs | `whk-wms` (barrel tracking, ownership, transfers, lots) | — |
| forge-cmms | `whk-cmms` | PM scheduling, work orders, assets, inventory |
| forge-qms | New build (Intellect QMS integration service and the ISO planning repo as scope references) | Intellect QMS: document control, CAPA, audits, GRC |
| ERP connector | `whk-erpi` (bidirectional NetSuite sync, 38 RabbitMQ topics, outbox pattern) | — |
| NMS | `net-topology` (SNMP/LLDP discovery, topology, FortiAnalyzer) | — |
| NextTrend (historian) | `nexttrend` (Rust, QuestDB; MQTT/Sparkplug/OPC-UA ingestion) | Canary / PI |
| IMS | `bosc_ims` (Go + gRPC, Python sidecar) | Aerospace supply-chain inventory; the compliance-enforcing spoke |
| Scanner gateway | `whk-wms-android` | OT-tier QR scanner spoke |
| OT UI builder | Future, after the OT module matures | Ignition Perspective (user-built HMI screens) |

Two cross-cutting capabilities were planned alongside the modules: cross-module ticket and workflow orchestration with one audit trail (an NMS alert raising a CMMS work order, a QMS deviation, an MES hold), and a unified identity layer. The identity layer is now decision D-1; the orchestration capability has no backlog item yet.

---

## 8. Spoke onboarding: priority and checklist

Spokes were ranked in April 2026 on five weighted factors: business value (×3), fit with the proven adapter pattern (×2), integration readiness (×2), how many other modules the spoke enables (×1), and inverse effort (×1).

| Rank | Spoke | Weighted score | State (see WHERE-WE-ARE §3.4) |
|---|---|---|---|
| done | whk-wms, forge-mes | — | Adapters and approved FACTS specs |
| 1 | ERP connector (whk-erpi) | 41 | Adapter done; spec re-stamped, awaiting approval |
| 2 | CMMS (whk-cmms) | 36 | Adapter done; spec re-stamped, awaiting approval |
| 3 | NMS (net-topology) | 35 | Adapter done; spec re-stamped, awaiting approval |
| 4 | Scanner gateway | 26 | Adapter done; spec re-stamped, awaiting approval |
| 5 | NextTrend | 27 | Adapter done; spec re-stamped, awaiting approval |
| 6 | IMS (bosc_ims) | 23 | Adapter done; spec approved (no approver recorded) |
| 7 | OT module (new build) | 30 | Built as forge-ot; spec waits on D-8 |
| 8 | QMS module (new build) | 28 | Not started |
| 9 | OT UI builder | 17 | Superseded by forge-display (A-3) |

Every spoke follows the same checklist: owner approval of the compliance plan (`docs/spoke-onboarding/`), discovery (`docs/spokes/`), FACTS spec before code, adapter from the module SDK (A-5) rather than a copy of the previous adapter, context builder and enrichment rules, FTTS conformance over gRPC, at least one data product, an FQTS quality spec, an end-to-end integration test, and the state row in `WHERE-WE-ARE.md`.

---

## 9. Lessons that still bind

From the executed sprints of April 2026 (FACTS, core models, WMS and MES adapters, gRPC transport, curation):

- **Pydantic v2 and `TYPE_CHECKING` do not mix.** Types used in model field annotations must be runtime imports when `from __future__ import annotations` is on. `[tool.ruff.lint.flake8-type-checking] runtime-evaluated-base-classes` lists `pydantic.BaseModel` so the TC rules leave those imports alone (FB-022); do not move them by hand.
- **`False or fallback` loses `False`.** Use explicit `is None` checks for any field where `False` is meaningful (it bit the MES mapper's `isClassDefinition`).
- **Provenance envelope and flat references.** Every domain model carries `forge_id`, `source_system`, `source_id`, `captured_at`, `metadata`; relationships are ids (`lot_id: str`), not embedded objects. Canonical enums are defined but adapters map source-specific values.
- **`RecordContext.extra`** keeps spoke-specific context next to the named fields, so both vocabularies survive in one record.
- **Abstract the infrastructure, test in memory.** `TransportChannel` / `InMemoryChannel`, `ProductStore` / `InMemoryProductStore`: the whole pipeline is tested without the real transport or database, and only the implementation changes when the infrastructure arrives.
- **Mappers are pure functions** (raw dict → model or `None`), transport-agnostic, with camelCase and snake_case keys both accepted; wrapping an adapter in the gRPC transport needs no change to the adapter.
- **Runner tests build a minimal valid spec and break one section at a time** instead of editing real specs; cross-spoke consistency (shared `lot_id`, `operator_id`, …) is tested in the dependent spec's suite.
- **Event-type resolution goes from the most specific to the least:** explicit field → MQTT event suffix → compound key → exchange name → unknown.
- **Case matters for canonical units** (°C, not °c): keep the original case in storage, look up case-insensitively.

---

## 10. Retired planning records

Retired on 2026-10-18 (FB-081). Each had carried a "historical planning record" banner since 2026-10-16; the content that was still true is above, the rest is in git history (`git log --all -- <file>`).

| File | What it was | Where its living content went |
|---|---|---|
| `ARCHITECTURE.md` | Strategic architecture, April 2026 | §1–§5 here; the finished system in `VISION.md` §3 |
| `PHASES.md` | F0x–FWx phase registry | Superseded by the roadmap's workstreams; phase ids survive only in old commit messages (FB-025) |
| `PLAN.md` | Master development plan, D1–D3 | §6–§7 here; status in `WHERE-WE-ARE.md` |
| `RESEARCH_NOTES.md` | MDEMG patterns, BBD arguments, technology table | §3, §4, §6 here |
| `ROADMAP-ADAPTER-INTEGRATION.md` | Paths 1–3 (FACTS specs, core models, WMS slice) | Executed; `ROADMAP.md` is the roadmap |
| `SPOKE_ONBOARDING.md` | Priority scoring and checklist | §8 here |
| `SPRINT-PLAN-FACTS.md`, `SPRINT-PLAN-PATH2..6-*.md` | Executed sprint plans with retrospectives | §9 here |
