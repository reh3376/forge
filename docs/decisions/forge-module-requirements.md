# Forge module requirements — design record

**Status:** approved by reh3376 on 2026-11-17 (the owner answered Q-1 to Q-9 one at a time on 2026-11-17 and declared the answers the signature; the status line was set on that word; §8 records the answers) · **Backlog:** FB-124 (with FB-117, FB-120, FB-123, FB-127) · **Roadmap:** D-12, decision A-11
**Participants:** reh3376 (owner, decides and signs), Claude (researches, proposes)

This record answers one question: what must every Forge module do before the hub admits it, and what checks that. Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code or a signed record says today, with the path), **[PROPOSED]** (Claude's recommendation, not approved) or **[OPEN]** (a question the owner must answer; collected in §8). The owner answers the questions one at a time; the answers are the signature.

---

## 1. What the owner decided (2026-11-17)

| # | Decision | Words |
|---|---|---|
| O-1 | Module requirements must exist, and time sync is a core one. **[OWNER]** | "Module requirements should exist that require a module to have some baseline functionality and the time sync functionality is a core requirement." |
| O-2 | A module that does not implement the time exchange is refused at runtime, and that case should never arise. **[OWNER]** | "Refuse it at runtime, but this should never occur." |
| O-3 | The requirements are controlled by a FxTS spec. **[OWNER]** | "The most relevant means of controlling minimum module requirements is to create a FxTS spec for module development / creation." |
| O-4 | That spec carries a time contract. **[OWNER]** | "A 'time_contract' between each module and all databases as well as plant floor equipment with its hub should be part of the defined FxTS spec related to module creation / development." |
| O-5 | All modules speak to the hub through gRPC; third-party software is reached through an integration module. **[OWNER]** | "While 3rd party software can easily be integrated into the forge framework, it isn't integrated directly with the hub. An integration module must exist that handles the REST API calls related to a specific integration with a 3rd party software that facilitates communication back to the hub. So, ultimately all modules speak to the hub through gRPC. RESTful API integration is handled by the module acting as the facilitator / middleware." |
| O-6 | The time requirement of a REST integration belongs to its integration module and is stated as such. **[OWNER]** | "The requirement now falls to the specific integration module. This requirement needs to be clearly stated as an integration module requirement." |
| O-7 | The requirements live in a document the owner signs. **[OWNER]** | "This should be part of a document related to forge module requirements." |

Decisions already in force that this record builds on (`docs/ROADMAP.md` §1): A-1 hub and spoke over `forge.v1.AdapterService`; A-2 modules in Go from the SDK; A-3 every UI from forge-display; A-4 third-party software behind integration modules; A-5 a module SDK; A-6 the hub owns the databases; A-7 safety stays in the core.

## 2. What exists today (2026-11-17)

- **[FACT]** The contract is 12 RPCs (`src/forge/proto/adapter_service.proto`): Register, Configure, Start, Stop, Health, Ingest, Collect, Subscribe, Unsubscribe, Write, Backfill, Discover.
- **[FACT]** A spoke declares itself in a FACTS spec with nine required sections (`src/forge/governance/facts/schema/facts.schema.json`): `spec_version`, `adapter_identity`, `capabilities`, `lifecycle`, `connection`, `data_contract`, `context_mapping`, `error_handling`, `time_governance`. The runner has 37 checks; nine specs exist and are approved.
- **[FACT]** `time_governance` (FB-090) declares the spoke's time source, sync protocol, how it reads its source's clock, the probe cadence, which clock stamps its values, the tolerance class and `fail_closed: true`, with optional per-connection entries. It covers one kind of counterpart: the source the spoke pulls from.
- **[FACT]** At runtime the hub refuses a manifest without `time_governance`, and refuses the Register and Ingest of a spoke whose clock is outside its class or that reports no measurement (FB-093). The OT module does the same to each PLC connection.
- **[FACT]** What is not checked anywhere: a module's clock against a database it reads or writes; an IT spoke's clock against the system it pulls from (FB-120); devices without OPC UA (FB-117); whether a module implements the time exchange before it is deployed.
- **[FACT]** `forge module init` (`src/forge/sdk/module_builder/`) generates a Python adapter in six files. The Go SDK and `forgectl module init --lang go` are designed (`docs/decisions/forge-mes-go.md` §6) and not built (FB-017).
- **[FACT]** Module kinds named in `docs/VISION.md` §3: management modules (forge-mes, forge-whs, forge-cmms, …), integration modules (forge-ignition and successors), the OT module, and forge-display. In the tree today: nine Python adapters under `src/forge/adapters/`, the hub-hosted OT module, and the interim MES bridge.
- **[FACT]** The hub still has a REST ingest endpoint; it is to be retired (FB-123).

## 3. The problem, precisely

A module's obligations are spread over five places: the proto, the FACTS schema, the one-clock record, the roles record and the forge-mes record. Nothing states the whole, nothing checks a module against the whole before it runs, and three of the time links a module has (to its databases, to a third-party API, to non-OPC-UA devices) are declared nowhere. A module can pass every existing check and still be refused the first time it calls the hub, which is the case O-2 says should never occur.

## 4. Options

- **Option A, extend FACTS.** Add the missing sections to the FACTS schema and more checks to its runner. One spec per module, as now. FACTS stays what it is named for, an adapter's conformance, and grows to carry everything.
- **Option B, a module spec above the others.** A new FxTS framework whose spec is the module's single declaration: its kind, the baseline it claims, its time contract, and references to its other specs (FACTS, FVTS, its data spec, its roles). Its runner checks the baseline and that the referenced specs exist and are approved.

## 5. Recommendation

The owner answered §8 on 2026-11-17. P-1 to P-5 stand as amended by those answers: P-1 by Q-2 and Q-3 (the framework is FMTS), P-2 by Q-4 (all eleven), P-3 by Q-5 and Q-6, P-5 by Q-7, and Q-8 adds waivers. They are **[OWNER]** 2026-11-17.

### P-1 A module spec, one per module

Option B. The spec is the module's entry in governance: without an approved one a module is not a Forge module. It does not repeat what FACTS, FVTS and the roles file declare; it names them and requires them.

### P-2 The baseline every module meets

| # | Requirement | Checked how |
|---|---|---|
| M-1 | Speaks `forge.v1.AdapterService` to the hub over gRPC and nothing else (O-5). | static: no hub REST client; live: Register succeeds |
| M-2 | Has an approved FACTS spec, and its manifest matches it. | spec reference resolves, hash approved |
| M-3 | Declares a time contract for every counterpart it exchanges data with (P-3). | schema and rule checks |
| M-4 | Implements the time exchange on Register, Health and Ingest and reports its measurement (O-2). | conformance test against a reference hub |
| M-5 | Fails closed on a clock it cannot trust and on a refusal from the hub, and never silently: the cause is on its health. | conformance test |
| M-6 | Stamps UTC, timezone-aware, and never invents a source time. | conformance test |
| M-7 | Reports health, with refusals by cause. | conformance test |
| M-8 | Holds only Forge-issued credentials and owns no database connection of its own (A-6). | static check of the declared connections |
| M-9 | Ships no user interface code; describes its screens in an FVTS spec (A-3). | spec reference; no UI source in the module |
| M-10 | Declares its roles and scopes (roles record). | spec reference |
| M-11 | Is built from the module SDK template for its language (A-2, A-5). | scaffold marker and layout check |

### P-3 The time contract

One entry per counterpart, in the module spec:

| Counterpart | What the entry declares |
|---|---|
| The hub | the tolerance class of the link; the exchange is mandatory |
| Each database | which clock stamps what the module writes and reads there, how that clock is read, the tolerance class, the probe cadence |
| Each plant-floor device or server | as FACTS `time_governance.connections[]` today: clock-read method, cadence, stamp origin, tolerance class |
| Each third-party system (integration modules) | how the module reads that system's clock, or the declaration that it cannot and that Forge's read time stands in |

Every entry fails closed. FACTS `time_governance` is the source for the device entries, so nothing is declared twice.

### P-4 Integration modules

An integration module is a module whose counterpart is third-party software. It is the only place that system's API is called, it carries that system's time contract entry (O-6), and it meets the whole baseline like any other module.

### P-5 Where it is enforced

In the scaffold (a generated module passes), in CI (blocking), and at Register (the hub refuses a module whose spec is missing or not approved).

## 6. Implementation plan (after signature)

One backlog item and one PR per step, in this order. Each step leaves the tree working.

| Step | What | Depends on |
|---|---|---|
| 1 | The FMTS framework: schema, runner, `docs/FxTS/FMTS.md`, `forge governance run fmts`, hash governance through FHTS. The schema carries the module's kind, the eleven baseline claims, the time contract (hub, databases, devices, third-party systems) and waivers (requirement, reason, backlog item). The runner's static checks: M-1, M-2, M-3, M-8, M-9, M-10, M-11, and every waiver names an open backlog item. | — |
| 2 | FMTS specs for the modules that exist: the nine Python adapters, the OT module, the interim MES bridge with its three waivers (M-8, M-9, M-11). The owner approves each hash. The check blocks in CI. | 1 |
| 3 | The conformance kit: a reference hub and the tests a module runs against it for M-4 to M-7 (the time exchange and its report, failing closed, UTC and no invented source time, health with refusals by cause). The Python `SpokeClient` and the interim bridge run it in CI. | 1 |
| 4 | Database clocks: the hub probes the clock of every database it owns and fails closed on it; a module's declaration that it never writes the database's `now()` is checked. | 1, FB-119 |
| 5 | Third-party systems: an integration module reads its system's clock, corrects that system's times to master time and reports the offset on the record; a system whose clock cannot be read is declared as such (Q-6). The eight IT adapters are the first to do it. | 3, FB-120 |
| 6 | Register: the manifest carries the approved FMTS spec hash and the hub refuses a module without one, with the cause shown. | 2 |
| 7 | The scaffold: `forge module init` generates a module with a passing FMTS spec; the Go generator does the same when it exists. | 1, FB-017 |
| 8 | What this makes dead is removed: the `source_timestamp_origin` fallbacks (FB-127) and the hub's REST ingest (FB-123). | 6 |

## 7. What this replaces or closes

FB-127 (the `source_timestamp_origin` fallbacks), FB-117 and FB-120 (the clock readers the time contract names), FB-123 (the hub's REST ingest) are steps of, or follow from, this record.

## 8. Questions for the owner

Answered one at a time. Each answer is recorded here with its date and a debt check.

| # | Question | Answer |
|---|---|---|
| Q-1 | Which things must meet these requirements? | **Answered 2026-11-17: everything that registers with a hub.** Management modules, integration modules, the OT module and the nine Python adapters, and modules defined but not yet created. The owner's words: "Everything that registers. We have more modules defined but not yet created: examples include the forge-builder (builds UIs for the forge framework), and more." Debt check: one set of requirements for every kind keeps a second, weaker class of spoke from existing; the points that differ by kind are listed, not exempted. Raised by the answer: Q-9. |
| Q-2 | A new FxTS framework above FACTS (Option B), or FACTS extended (Option A)? | **Answered 2026-11-17: a new framework above FACTS (Option B, P-1).** One module spec per module, referencing its FACTS, FVTS, data and roles specs. Debt check: the nine approved FACTS specs do not change and nothing is declared twice; the cost is one more framework to keep (schema, runner, hash governance), which FHTS already covers for every framework. |
| Q-3 | The name of the framework. | **Answered 2026-11-17: FMTS, Forge Module Test Specification.** Spec files are `<module>.fmts.json`. Debt check: the name was unused, and it names the subject as FACTS, FATS and FVTS do. |
| Q-4 | The baseline list M-1 to M-11: accept, remove or add. | **Answered 2026-11-17: all eleven accepted.** Each becomes a blocking FMTS check; a point that differs by module kind is stated in the record, not exempted. Debt check: M-9 and M-11 depend on things not built yet (forge-display, the Go SDK), so their checks are written against the contract (an FVTS spec, the scaffold layout) and Q-8 decides what applies to today's modules. |
| Q-5 | The time contract with a database, given that the hub owns the databases (A-6). | **Answered 2026-11-17: the owner of the database checks it.** The owner's words: "Owner of the database checks it. forge integration modules that access 3rd party software databases are responsible for the time_offset to reconcile the DBs time relative to forges master time and report the offset to the hub when data is stored in a hub owned DB." So: every database a module reads or writes has a time contract entry. A hub database's clock is probed by the hub, which fails closed on it; a module declares that the times it writes there come from its own governed clock or the hub's, never from the database's `now()`. A third-party database's clock is measured by the integration module, which corrects that database's times to master time and reports the offset with the data it stores in a hub database. Debt check: the offset travels on the record in fields that exist (`source_offset_seconds`, `source_time_as_sent`, `source_clock`; one-clock record P-3), so no second mechanism is needed; the hub probing its own databases is new work and belongs with FB-119. |
| Q-6 | A counterpart whose clock cannot be read (a third-party API with no time to read). | **Answered 2026-11-17: the same rule as devices.** The time contract entry must declare that the system's clock cannot be read; then the module's own governed read time is the stamp and the polling interval is recorded as the uncertainty on every record. Without the declaration the module is refused. Times the system itself supplies are kept as data, marked uncorrected. Debt check: one rule for every unreadable clock (one-clock record P-4, Q-3), carried by the fields that exist (`source_clock: forge`, `source_uncertainty_seconds`). |
| Q-7 | Where it is enforced: scaffold, CI, Register. | **Answered 2026-11-17: all three.** The scaffold produces a passing module, CI blocks a change that breaks a requirement, and the hub refuses at Register a module without an approved FMTS spec, with the cause shown. Debt check: the Register check needs the spec's approved hash to reach the hub with the manifest, which is a contract field to add once, deliberately; the hub keeps failing closed on its runtime checks whatever the spec says. |
| Q-8 | The modules that exist today: the nine Python adapters, the OT module, the interim MES bridge. | **Answered 2026-11-17: specs now, with named waivers.** Every existing module gets an FMTS spec. A requirement it cannot yet meet is a waiver in its spec naming the requirement, the reason and the backlog item that removes it; the owner approves it through the spec's hash, the runner reports every waiver on every run, and a requirement without a waiver is enforced in full. For the interim MES bridge: M-8 until FB-057, M-9 until forge-display, M-11 until FB-076. Debt check: a waiver is visible debt with an owner and an exit; the risk is waivers that never close, so each must name an open backlog item and the runner fails a waiver whose item is closed. |
| Q-9 | The module that builds user interfaces, named "forge-builder" in the answer to Q-1: no document names it. | **Answered 2026-11-17: there is no forge-builder.** The owner's words: "I misspoke, you are correct the UI builder module's name is forge-display, not forge-builder." forge-display is the one module that produces Forge's user interfaces (A-3). Debt check: no document changes; a module the owner has defined but that is not yet written down is added to `docs/VISION.md` §3 when the owner names it, and meets these requirements like any other (Q-1). |
| Q-10 | (Raised while building FMTS, 2026-11-17.) May M-3, the time contract, and M-4, the time exchange, be waived like the other requirements? | **Answered 2026-11-18: yes, with admin privileges.** The owner's words: "Allow for waiver with admin privilages." A waiver of M-3 or M-4 counts only once the spec's hash is approved; until then the runner fails it by name. Only the owner approves a hash today; the admin scope of the role model takes that place when it exists (FB-075). Debt check: a waiver covers the FMTS check only. The hub still refuses at runtime a module that does not exchange time or whose clock is out of class (O-2, FB-093); whether an approved waiver should ever relax that is not decided and nothing does it. First use: the interim MES bridge's M-3 (FB-145). |

## 9. Amendment of 2026-11-19: what the transport contract adds (FB-165)

**Status:** approved by reh3376 on 2026-11-19. The owner answered the questions below one at a time and declared the answers the signature of this amendment. M-1 to M-11 and everything above this section stand as signed.

The transport contract (`transport-contract.md`, D-15, signed 2026-11-18) requires behaviour of every module that M-1 to M-11 do not name. All of the following is **[OWNER]**.

| # | Requirement | Applies to | Waiver | Checked how |
|---|---|---|---|---|
| M-12 | Gives every record a stable record id (T-5). | every module | ordinary | conformance kit, when the transport contract is built (FB-164) |
| M-13 | Stores and forwards what it cannot deliver, with a declared capacity (T-6). | every module | ordinary | conformance kit (FB-164) |
| M-14 | Says goodbye on a proper shutdown and declares a last will (T-8). | every module | ordinary | conformance kit (FB-164) |
| M-15 | Refuses a command that arrives after its expiry (T-11). | only a module that declares process-control writes | only with admin privileges, like M-3 and M-4 | conformance kit (FB-164) |
| M-16 | Applies each business write-back once by its id and confirms it. | only a module that declares it accepts business write-backs | ordinary | conformance kit (FB-164) |

| # | Question | Answer |
|---|---|---|
| A-Q1 | How the four behaviours of T-5, T-6, T-8 and T-11 enter the requirements. | **Four new requirements**, M-12 to M-15. M-1 to M-11 keep their numbers and meaning, so nothing already approved is reinterpreted. |
| A-Q2 | Which of them need admin privileges to waive. | **M-15 only.** Refusing a late command protects a running process. M-12, M-13 and M-14 protect the completeness of data and take an ordinary waiver with a reason and an open backlog item. |
| A-Q3 | Whether M-15 applies to a module that takes no commands. | The owner's words: "The correct answer to this is highly dependent on how we define a 'command'. When we discussed this yesterday we were talking about a very specific type of command. We were referring to a command that writes to a tag in a process control controller that would directly effect a processes operation. If that is the only type of cmd we are referring to here then only modules which could potentially have write access to PLC or HMI tags would be relevant." **So a command is a write to a tag in a process controller (PLC or HMI) that directly affects a process, and M-15 binds only the modules that could make one.** |
| A-Q3b | How such a module is identified. | **Declared in the module spec.** Each spec states whether the module can issue or carry process-control writes. "Yes" makes M-15 required. "No" makes it not applicable, and the runner checks the "no" against the module's FACTS spec. |
| A-Q4 | A downward message that is not a command: a write-back to a business system. | The owner's words: "IT Rule: Ensure delivery once and only once, these should not time out in the sense that OT tag write commands should. A downward message to a business system needs to be confirmed delivered once and only once, but a minor delay is not system critical." |
| A-Q5 | Whether the receiving module's part in that is a requirement. | **Yes: M-16**, for modules that declare they accept business write-backs, with an ordinary waiver. |

Debt check: nothing of the transport contract is built (FB-164), so every existing module carries a waiver naming FB-164 for each new requirement that applies to it, and the waivers expire together when that item is closed. The module spec gains one section, `transport`, with the two declarations; its capacity, last will, data classes and keepalive follow with FB-153. Adding required fields is a major step of the FMTS schema under D-14's rules.

## 10. Amendment of 2026-11-19: the module's function, its application and what it declares for its link (FB-153)

**Status:** approved by reh3376 on 2026-11-19. The owner answered the questions below one at a time and declared the eight points of the summary the signature of this amendment. Everything above stands as signed.

All of the following is **[OWNER]**.

| # | Question | Answer |
|---|---|---|
| B-Q1 | How the list of module functions is kept. | **A governed list file**, hashed and approved by the owner like a spec. The schema says only that the field takes an entry of the list; the runner checks it. Adding an entry is one approved change to the list: no schema version, no spec touched. The same mechanism carries the application-side protocols, the data classes and the pruning strategies. |
| B-Q2 | The first list of module functions. | **These fourteen:** mes, wms, cmms, erp, nms, ims, historian, scanner, ot, display, creds, mpc, qms, lims. |
| B-Q3 | The first list of application-side protocols for an integration module. | **rest, graphql, mqtt, opc-ua, sql, amqp, file.** The owner named the first five on 2026-11-18; the module's hub side is gRPC only. |
| B-Q4 | The data classes. | See the transport contract, "Data classes: parents and sub-classes". |
| B-Q5 | What a module declares for its store-and-forward buffer. | **Size and age, a range for each**, plus a pruning strategy. The owner's words: "I agree with option 1, but will likely need user defined pruning strategy as well when / if max store is reached how is it handled." The first strategies: **drop-oldest** (the default) and **by-class-priority**. A module declares the strategies it supports; the hub admin chooses one; every loss is counted and shown; the audit class is never pruned. |
| B-Q6 | What a module declares as its last will. | **A message and an alarm priority** (none, low, medium, high, critical). The state the hub records is fixed by the contract: lost, with the time last heard. |
| B-Q7 | What a module declares about keepalive. | **An optional tighter limit.** The interval comes from the module's strictest data class; a module may declare a longest interval it accepts, which can only tighten it. |

The integration fields were settled in the integration builder record (D-13, B-10): product and vendor, supported versions, interfaces, direction, site owner, credential name; how the application's clock is read stays in the time contract.

In the module spec: `module_identity.function`; an `integration` section, required for kind `integration` and absent otherwise; in `transport`, the data classes, and the buffer, the last will and the keepalive limit. A module that waives M-13 or M-14 need not declare the buffer or the last will yet.

Debt check: four lists can now grow without a schema version, which is what kept the first two schema steps of this week from being four. A list is trusted only while its hash verifies and the owner has approved it; a module spec fails otherwise.
