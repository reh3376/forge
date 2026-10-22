# Where we are going

**Status date:** 2026-10-17 · **Owner:** reh3376
**Companions:** [What Forge will be](VISION.md) (the destination, in full) · [Where we are](WHERE-WE-ARE.md) (the snapshot) · [Roadmap](ROADMAP.md) (decisions, workstreams, sequence, decision queue) · [Principles](PRINCIPLES.md) (what does not change with the code) · [Backlog](../BACKLOG.md) (the unit of work)

This is the short statement of direction. It names the destination, the principles already decided, the milestones between here and there, what is next, and what gates it. Detail lives in the companions; this page should fit in one reading.

---

## 1. The destination

Forge becomes the industrial data operations platform for a manufacturing enterprise: every operational system a plant runs on is a spoke of a Forge hub, every record carries manufacturing context, curated data products carry lineage and quality objectives, every interface is rendered by forge-display from a declarative contract, writes to equipment pass a defense chain in the core, and every contract between components is a hashed, owner-approved specification enforced in CI. Forge's own management modules (forge-mes, forge-whs, forge-cmms, forge-ot, …) are optional: a site may run Forge over the software it already has, or replace that software one module at a time. Multi-site enterprises run a hub of hubs along ISA-95 that keeps working when the WAN does not. The full definition, the problems it solves and the acceptance criteria for "complete" are in [`VISION.md`](VISION.md).

---

## 2. Principles already decided

From [`ROADMAP.md`](ROADMAP.md) §1 and [`docs/decisions/roles.md`](decisions/roles.md); these are not reopened by routine work.

| | Principle |
|---|---|
| A-1 | **Hub and spoke.** One contract, `forge.v1.AdapterService` over gRPC, governed by FACTS and FTTS. |
| A-2 | **Management modules are Go**, generated from the module SDK. forge-mes (NestJS/Next.js) is a bridge to be rewritten. |
| A-3 | **All UI comes from forge-display.** Modules describe (FVTS); the renderer renders on four profiles. |
| A-4 | **HMI/SCADA is optional and pluggable.** Vendor software stays behind an integration module where a site wants it. |
| A-5 | **A module SDK is required**; management and integration modules are built the same way. |
| A-6 | **The hub owns the databases.** Modules hold only Forge-issued credentials. |
| A-7 | **Safety stays in the core.** Roles, interlocks, confirmation, read-back and audit for writes are enforced in forge-core/OT, never only in a UI. |
| A-8 | **Workflow.** One backlog item per PR on `reh3376_dev01`; auto-opened PR; owner merges on green; docs current before every push. |
| A-9 | **Security posture.** Public (owner's decision, 2026-10-17) with secret scanning, push protection and CodeQL on; the purged history stays with GitHub Support until GC; nothing imported without a history scan. |
| A-10 | **Local models only** for the project's own tooling. |
| R-1 … R-17 | **Identity and roles.** Enterprise-class, installation-chosen identity method and role shape; Forge decides assignment; roles scoped, per module, assigned at the managing hub and inherited downward; reads constrained like actions; separation of duties in the hub; offline tokens; hub of hubs; audit flows upward. |

---

## 3. The route: milestones

| Milestone | Outcome | State |
|---|---|---|
| **M1 · Contract and governance floor** | Hub ↔ spoke contract end to end (push, pull, write-back, TLS/mTLS, tokens, FACTS check at Register); OT module hosted in the hub with alarms, the control-write chain and the MES changeover; FATS, FACTS, FTTS and FVTS with runners and gates; FHTS hashing on every spec. | **Done** (PRs through 36) |
| **M2 · Decisions and designs** | Role model settled (D-1, Q21/Q22); forge-mes Go design signed off (D-3); FVTS open items answered (D-4); OT FACTS vocabulary (D-8); time representation and skew tolerances (D-9); OT reference FVTS spec approved (FB-078). | **Now** |
| **M3 · Go SDK and the first Go module** | Module SDK template in Go; forge-mes phase 1 speaks to the hub with FB-055 as the acceptance test; `mod_mes` in the hub (FB-057); changeover + MQTT in Go; parity; cut-over; NestJS backend retired. | Not started (FB-076, FB-017, FB-057) |
| **M4 · forge-display** | Renderer scaffold and spike against the FVTS golden messages; MES surfaces first, then OT HMI surfaces; Next.js frontend retired. | Not started (needs D-4) |
| **M5 · Hub platform hardening** | Context Engine and Schema Registry mounted (FB-001); scoped roles enforced in the gateway (FB-075); persistent access control and registries (FB-003, FB-005); server-side write review (FB-074, done 2026-10-17); FACTS schema validation (FB-080, done 2026-10-17); FDTS, FQTS, FSTS from stub to gate. | Started (FB-074, FB-080 done) |
| **M6 · Enterprise** | Hub of hubs (the time-authority chain follows it), identity methods, offline tokens, Kubernetes deployment, backups and SLOs; forge-cmms and forge-whs in Go; forge-ignition. | Not started |

Milestones overlap where the roadmap's sequence allows (forge-display work can start once D-4 is answered, in parallel with M3).

---

## 4. What is next

The proposed sequence in [`ROADMAP.md`](ROADMAP.md) §4, abridged:

1. Decision session on D-1, D-3, D-4, D-8 and D-9 (owner).
2. FB-076 design document, then owner sign-off.
3. Module SDK Go scaffold; its first consumer is the Go forge-mes.
4. FB-076 phase 1: the Go module registers, ingests and takes write-backs against the hub.
5. FB-057 `mod_mes`, with FB-004/005/059 as needed by the Go module.
6. FB-076 phases 2–3: changeover and MQTT, parity, cut-over.
7. forge-display scaffold and renderer spike; MES surfaces first.
8. Hub platform items (FB-001, FB-003, FB-007, FB-075) as the Go module and forge-display start needing them.

No small decision-free item is left: FB-022, FB-026, FB-084, FB-085, FB-086, FB-014 (tz-aware timestamps, naive rejected at the model, ruff `DTZ` blocking), FB-087 (the hub stamps receipt) and FB-089 (every link's clock offset measured, exposed and alerted on a provisional 1 s tolerance) are done, the last three on 2026-10-20. The one-clock pass now waits on D-9: FB-088's marker, FB-090's FACTS section, FB-091's quality dimension, FB-092's exchange and FB-093's enforcement all take their fields and tolerances from it; FB-092 (hub time in the contract) and FB-093 (fail-closed enforcement) start once D-9 fixes the exchange shape and the tolerances; FB-094 (every OT connection reads the clock of the device it pulls from and corrects incoming stamps by the measured offset; a device whose clock cannot be read is not pulled) has its design record, `docs/decisions/one-clock-ot-source-time.md` (round 1, 2026-10-21: ten proposals among established standards, six questions), waiting for the owner's signature; implementation follows it in eight steps. The jest and tsc gates (FB-048) check the interim NestJS/Next.js code under `modules/Forge MES`, which FB-076 retires, so they follow FB-076.

---

## 5. What gates the route

| Decision | Gates | Where it is argued |
|---|---|---|
| D-1 role model (Q21 derived copy of assignments at the site hub; Q22 ladder preset) | FB-075, FB-078, the multi-party approval step above FB-074, the gateway work in M5 | `docs/decisions/roles.md` §13 |
| D-3 forge-mes Go design | all of M3 | `ROADMAP.md` §5 |
| D-4 FVTS open items | M4 | `docs/FxTS/FVTS.md`, `ROADMAP.md` §5 |
| D-8 FACTS vocabulary for OT adapters | approval of the OT FACTS spec; the OT module's identity | `ROADMAP.md` §5 |
| D-9 one clock: which established standards to adopt (NTP/chrony strata, PTP/IEEE 1588, NTP four-timestamp measurement in-band, IEC 61850-5 tolerances, IEC 61850 `TimeQuality` + OPC UA `DataValue` fields); FB-094 recommends, the owner approves | FB-092, FB-093, FB-094's fields, the representation half of FB-088, the final name of `sent_time` (FB-087's provisional field), the per-link tolerances that replace FB-089's provisional `FORGE_CLOCK_TOLERANCE_SECONDS`, FB-089/FB-091 tolerances | `ROADMAP.md` §5; the record `decisions/one-clock-ot-source-time.md` |
| D-7 scope of the Go standard | long-term shape of the OT module and the Python adapters | `ROADMAP.md` §5 |

---

## 6. How to read the three documents

- **[`VISION.md`](VISION.md)** says what Forge *is* when complete and which problems it solves. It changes only when a decision in `ROADMAP.md` §1 changes.
- **This page** says how far along the route we are and what comes next. It changes when a milestone or the sequence changes.
- **[`WHERE-WE-ARE.md`](WHERE-WE-ARE.md)** says what exists today, component by component. It changes before any push that changes that state.
- **[`ROADMAP.md`](ROADMAP.md)** holds the decisions in force, the workstreams, the sequence and the owner's decision queue; **[`BACKLOG.md`](../BACKLOG.md)** holds every open and closed item.
