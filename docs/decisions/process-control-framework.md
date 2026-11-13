# Three-layer process control framework (PC-L1 / PC-L2 / PC-L3) — decision record

**Status:** approved by reh3376 on 2026-11-13 (rounds 1 to 3: the owner answered Q-1 to Q-50 on 2026-11-13 and, at Q-47, declared the answers the signature; the status line was set on that word; §5 records the answers) · **Backlog:** FB-110 (with FB-111, the prior-art search of S-3) · **Roadmap:** D-11
**Participants:** reh3376 (owner, decides and signs), Claude (asks, records, proposes)
**Companion:** [Context for the AI coding agent](../personal/Process-Control-Framework-Context-for-Agent.md) (orientation only; it decides nothing)

This record captures the owner's decisions on the three-layer process control framework that is to be added to Forge. It is the input to the framework's functional specifications (FSDs, S-1). It was taken **before** the full review of Forge's current state, SDK and module definitions: it cites the code only where a question needed a fact, and it does not yet place the framework in Forge's modules (O-3). Every statement is tagged **[OWNER]** (decided by the owner on 2026-11-13, with the question it answers in §5), **[FACT]** (what the repository or an existing record says, with its source in §6), **[PROPOSED]** (Claude's reading or recommendation; the signature does not cover these) or **[OPEN]** (a question outstanding, collected in §4). Nothing in this record was implemented before the signature; implementation follows the Forge review and the FSDs.

---

## 1. What the owner described (2026-11-13)

| # | Statement | Tag |
|---|---|---|
| F-1 | The framework has three layers. **PC-L1:** standard PLC-controlled PID control; PID is reactive in general but is fine for most control loops. **PC-L2:** MPC/APC, added for complex control loops with many potential disturbance variables. **PC-L3:** SME agents that act on a set of processes as a whole. | [OWNER] |
| F-2 | The framework is new, not a classic control strategy. To the owner's knowledge all three layers have never been instantiated anywhere in their entirety; portions of layers 1 and 2 have been used for many years in many industries, but this is a more dynamic and complete framework. This record therefore assumes nothing from the conventional control hierarchy unless a decision below says so. | [OWNER] |
| F-3 | PC-L2 primary goal 1: maintain highly consistent control of a complex control loop. Primary goal 2: predict process disturbances and act to mitigate them before they fully manifest in the process. | [OWNER] |
| F-4 | PC-L2 includes a recursive self-improvement loop that continuously evaluates and modifies the algorithm to increase its likelihood of achieving its primary goals. | [OWNER] |
| F-5 | PC-L3: from the data of a given set of processes, a series of SME agents is instantiated that learn all the processes of an area and act on the process as a whole to achieve user-defined optimization goals. Example: a distillery's seven batch processes (whole-grain load-in and raw material receiving, milling, cooking, fermentation, distillation, distillate processing, warehousing) are each controlled individually at the PLC and MPC layers; PC-L3 looks at all of them as a whole. Example goal: entry of 130,000 barrels per year into on-site warehouses. | [OWNER] |
| F-6 | The framework is not specific to a single facility or application. Forge will be used in many industries and for many types of manufacturing; the distillery is an example only. | [OWNER] (Q-8) |

## 2. Decisions

### 2.1 Vocabulary and naming

| # | Decision | Tag |
|---|---|---|
| V-1 | One standard set of variable names is used for both PID and MPC, because a mixed vocabulary would create excessive and unnecessary confusion for the controls engineers who build and use these systems. | [OWNER] (Q-1) |
| V-2 | The set is **PV, SP, MV, DV**. PV is the variable being controlled, SP its target, MV what the controller moves, DV a disturbance variable. | [OWNER] (Q-1b) |
| V-3 | **"CV" is retired** and appears nowhere in the framework, because it means the controller output in PID/Logix usage and the controlled variable in MPC literature. Logix `PIDE.CV` maps to MV at the PLC boundary. | [OWNER] (Q-1b) |
| V-4 | Names describe a signal's role relative to a controller. One tag can hold different roles at different layers: a PC-L2 MV can be a PC-L1 PID's SP. | [OWNER] (Q-1b) |
| V-5 | The layers are named **PC-L1, PC-L2, PC-L3**, so they cannot be confused with the reference architecture's L1–L5 or with ISA-95 levels. | [OWNER] (Q-18) |

### 2.2 Hard invariants

No user setting, rollout profile or earned autonomy relaxes these.

| # | Invariant | Tag |
|---|---|---|
| H-1 | **Strict adjacency.** Each layer can only affect the layer directly below it. If PC-L3 wants to affect a PC-L1 process, it must do so through PC-L2. | [OWNER] (Q-10b) |
| H-2 | **No PLC code generation or editing on a PLC.** The framework can interact with the PLC and read and write tags, if permission is granted (L2-13). PLC code recommendations are in scope. Direct editing and generation of PLC code is too dangerous to implement. | [OWNER] (Q-17) |
| H-3 | No layer ever writes to safety systems (SIS, safety PLC tags). | [OWNER] (Q-20) |
| H-4 | No layer forces, bypasses or overrides interlocks or permissives. PLC logic can always shed a loop out of MPC mode. | [OWNER] (Q-20) |
| H-5 | PLC-side clamps on every write: every value PC-L2 writes is range- and rate-checked by limits held in the PLC, independent of PC-L2's own limits. | [OWNER] (Q-20) |
| H-6 | The operator can always take over: a person can pull any loop out of MPC mode and block PC-L2 and PC-L3 action, immediately (UI-1). | [OWNER] (Q-20) |
| H-8 | If the heartbeat shows PC-L2 is offline, PC-L3 must know it, its ability to effect change is suspended, and it generates recommendation logs instead. Any other arrangement could lead to dangerous process states. | [OWNER] (Q-10c, Q-43) |

There is no H-7. The rule that every change carries a fast rollback was listed here as H-7 in the round 1 record; the owner ruled it a default that an administrator can adjust, not an invariant (Q-43, Q-48). It is AU-12.

### 2.3 Autonomy and change control (PC-L2 and PC-L3 alike)

| # | Decision | Tag |
|---|---|---|
| AU-1 | Every PC-L2 self-improvement category (L2-10) and every PC-L3 action type (L3-4) has three states: **Off** (no proposals), **Propose** (a person approves each change), **Autonomous** (earned). | [OWNER] (Q-22, Q-45) |
| AU-2 | States are set at site, area and controller level. A lower level may be equal to or more restrictive than the level above, never less, so a site can lock a category Off everywhere. | [OWNER] (Q-23) |
| AU-3 | Promotion is progressive per category. A human is in the loop initially and remains there until a stated level of confidence is reached and maintained for a user-defined period. | [OWNER] (Q-6) |
| AU-4 | Four signals feed confidence: prediction accuracy, the outcome of promoted changes, the human agreement rate, and shadow-run performance. | [OWNER] (Q-7) |
| AU-5 | Each signal has its own threshold and all four must be met at once. A strong signal never masks a weak one. | [OWNER] (Q-25) |
| AU-6 | The hold period is a duration **and** a minimum number of evaluated events in that window (proposals reviewed, changes promoted, batches run). Both must be met. | [OWNER] (Q-26) |
| AU-7 | The framework ships no threshold, duration or count values. A category cannot move from Propose to Autonomous until a user has entered them. | [OWNER] (Q-27) |
| AU-8 | When the criteria are met, by default a human with the proper credentials must approve the switch to Autonomous. An administrator can set the switch to automatic, based on a series of constraints being met. | [OWNER] (Q-27b) |
| AU-9 | Autonomy is revoked automatically, and the human is back in the loop, if confidence later falls below a threshold. | [OWNER] (round 2) |
| AU-10 | Changes are versioned. | [OWNER] (round 2) |
| AU-11 | Validation of a proposed change means a backtest on history plus a shadow run beside the live controller. | [OWNER] (round 2) |
| AU-12 | **Rollback rule (a default, not an invariant).** Every change is accompanied by a rollback strategy that can be executed quickly. An administrator may adjust or disable this requirement at any level, including globally. | [OWNER] (Q-6, Q-43, Q-48) |
| AU-13 | Where rollback is switched off for a category or action type, that category can be Propose at most: every change needs a person's approval. Switching rollback off is recorded and is visible wherever status is shown. | [OWNER] (Q-49) |
| AU-14 | **Rollback of a PC-L2 change.** The last validated version stays loaded beside the new one, and rollback is a switch back to it that takes effect on the next control cycle, with no rebuild, download or restart. In addition, the user may set a maximum rollback time per category, which is checked before a change is promoted. | [OWNER] (Q-28) |
| AU-15 | **Rollback triggers.** An automatic performance guard (the live result after a change is worse than a user-set guard). A shed event, which also reverts the most recent unproven change. PC-L3, as an action under its own autonomy rules. A person with the proper credentials; that permission is not granted to every user with operator privileges. | [OWNER] (Q-29) |
| AU-16 | **Rollback of a PC-L3 action.** For targets, limits, priorities and controller configuration, the prior state is kept and restored. A schedule change request states how long it stays reversible. One that can still be undone inside its window may be Autonomous once earned; one that cannot be undone, or whose window has closed, always needs a person's approval. | [OWNER] (Q-44, Q-50) |

### 2.4 PC-L1

| # | Decision | Tag |
|---|---|---|
| L1-1 | PC-L1 control is standard PID and stays in the PLC. | [OWNER] (F-1) |
| L1-2 | **Loop registry.** Every PID loop is registered with its PV/SP/MV/DV roles, baseline gains, limits and mode, as the source of truth the upper layers work from. | [OWNER] (Q-17) |
| L1-3 | **Loop performance monitoring.** Each PID loop is assessed continuously, and loops that would benefit from PC-L2 are flagged. | [OWNER] (Q-17) |
| L1-4 | **Baseline PID tuning.** The framework identifies a loop and proposes baseline PID gains even where no MPC is deployed. | [OWNER] (Q-17) |
| L1-5 | **PLC code recommendations** are included. No PLC code that can go directly to the PLC is generated (H-2). | [OWNER] (Q-17) |
| L1-6 | An engineer writes the PLC-side logic (heartbeat watchdog, MPC-mode handshake, stored baseline gains, shed logic, the take-over tag of UI-1), based on suggestions from Forge at setup. | [OWNER] (round 2) |
| L1-7 | The PLC type must be determined before sample code is generated. | [OWNER] (round 2) |
| L1-8 | The PLC interface is a **vendor-neutral contract**. v1 implements and tests Allen-Bradley Logix only. Other PLC OEMs will be added, so the build must not tie Forge down to excessive technical debt when they are. | [OWNER] (Q-16, Q-40) |
| L1-9 | Multiple PLCs can be used within a site or area, and they may be from multiple vendors. | [OWNER] (round 2) |

### 2.5 PC-L2

| # | Decision | Tag |
|---|---|---|
| L2-1 | PC-L2 is not only MPC. It comprises the MPC/APC controllers **and** the control mechanisms PC-L3 needs to interact with PC-L1. | [OWNER] (Q-10c) |
| L2-2 | PC-L2 is built from historical data defined by the user, from which the PV, MV and SP ranges and the DVs are identified. (The owner's description said "CV"; V-3 maps it to MV.) | [OWNER] (F-1, V-3) |
| L2-3 | **Authority over PC-L1.** While a loop is in MPC control mode and the PLC–MPC heartbeat is active and good, PC-L2 can by default: write the PID SP, write the PID output directly, retune the PID gains, and switch the PID mode. Users must be able to change the default with additional user-defined constraints. | [OWNER] (Q-2) |
| L2-4 | **Constraint kinds.** A user constraint can disable an action, bound it (magnitude and rate), make it conditional on process state (batch phase, startup, transition), or require a person's confirmation each time. Constraints are set at site, area and controller level under the capped rule of AU-2. | [OWNER] (Q-30, Q-45) |
| L2-5 | **Shed default.** When the heartbeat goes bad while a loop is in MPC control mode, the PID resumes in auto at the last SP PC-L2 wrote (bumpless), with the validated baseline gains restored from the PLC. | [OWNER] (Q-3) |
| L2-6 | The shed default can be overridden per loop. | [OWNER] (round 2) |
| L2-7 | **Entry into MPC mode.** An operator. PC-L2 itself, under a standing permission granted by a person, whenever permissives and heartbeat are good, including re-arming after a shed. PC-L3 agents eventually, once confidence is appropriately high: off by default, and the user can turn it on. | [OWNER] (Q-4) |
| L2-8 | **Process scope.** Continuous regulation, within-batch trajectory control, batch-to-batch correction, and startups and transitions are all in scope. | [OWNER] (Q-8) |
| L2-9 | **Models.** The model class sits behind a pluggable interface. v1 ships linear identified models (state-space with an observer, including multi-model and time-varying forms for batch). Nonlinear and hybrid classes follow behind the same interface. | [OWNER] (Q-9) |
| L2-10 | **Self-improvement scope.** The loop of F-4 may change model parameters, controller tuning, model structure and operating limits. Each is a user-activated category under §2.3. A newly created PC-L2 controller starts with all four Off. | [OWNER] (Q-5, Q-22) |
| L2-11 | **Execution and write path.** The live control cycle (read PVs and DVs, compute, write, heartbeat) runs in an MPC deployment near the PLC. Each deployment attaches to the nearest hub on the plant network (the area or site hub), and every PLC write goes through that hub's OT write engine. The deployment keeps running when upstream hubs are unreachable. If the local hub itself is down, its loops shed to PID (L2-5). One write path, one audit trail; A-7 is unchanged. | [OWNER] (Q-15, Q-38) |
| L2-12 | **Data at the deployment.** The hub is the single source of truth for models, versions, configuration and history. Each deployment keeps a working copy of only what it needs to run and to roll back (AU-14), refreshed from the hub, never edited locally, with its age visible. A-6 is unchanged. | [OWNER] (Q-39) |
| L2-13 | **Write permission.** Forge's existing authorization model is used; there is no second permission system. Each PC-L2 controller has its own service identity, granted `ot:tag:write` limited to the specific tags it controls, by a person with the right role. No PC-L2 or PC-L3 identity can ever be granted `ot:interlock:bypass`. | [OWNER] (Q-31) |

### 2.6 The MPC Supervisor module

| # | Decision | Tag |
|---|---|---|
| M-1 | The MPC Supervisor is its own Forge module. | [OWNER] (round 2) |
| M-2 | It is responsible for building, deploying, maintaining, improving and monitoring the MPCs for a given site or area. It is one module with multiple MPC deployments. | [OWNER] (round 2, Q-33) |
| M-3 | The module is all of PC-L2: the MPC deployments and the supervisory mechanisms PC-L3 acts through (L2-1). Each deployment near a PLC serves both. | [OWNER] (Q-34) |
| M-4 | It serves the multiple PLCs, possibly from multiple vendors, of its site or area (L1-9). | [OWNER] (round 2) |
| M-5 | Whether one instance of the module's management part covers a whole site or each area has its own is chosen per rollout; the module supports both. | [OWNER] (Q-36) |
| M-6 | The module is a new build, written to the Forge SDK and this record. The owner's earlier `mpc-supervisor` package, which is outside this repository, informs the design (state machine, heartbeat, PLC handshake); its code is not carried over. | [OWNER] (Q-35) |
| M-7 | The module's language is decided after the Forge review (O-2). | [OWNER] (Q-37) |

[FACT] The repository holds no MPC or process-control-layer code at `cc2c1da`: a case-insensitive search for "MPC", "mpc-supervisor" and "model predictive" finds only this record.

### 2.7 PC-L3

| # | Decision | Tag |
|---|---|---|
| L3-1 | PC-L3 stands alone, with the ability to allow for MDEMG integration. MDEMG is not a dependency. | [OWNER] (Q-11) |
| L3-2 | An SME agent is a language-model agent trained on the area's process knowledge. It reasons about goals and trade-offs, and every number comes from deterministic tools it calls (optimizers, process models, mass and energy balances, simulations), so the numbers are reproducible and auditable. | [OWNER] (Q-12) |
| L3-3 | **Where the language model runs.** Local models by default. An installation's administrator may permit an external model, as an explicit, recorded choice. | [OWNER] (Q-42) |
| L3-4 | **Action types.** Setting PC-L2 targets, changing PC-L2 limits and priorities, creating or reconfiguring PC-L2 controllers, and production schedule modifications are all possible. Each has the states of AU-1. The state of each is set per rollout in a versioned **rollout profile** per site or area; the framework's baseline is all four Off. | [OWNER] (Q-10, Q-24, Q-45) |
| L3-5 | **Autonomy** is earned by the same rule as PC-L2 (§2.3). | [OWNER] (Q-10a) |
| L3-6 | **Write path.** PC-L2 only (H-1). | [OWNER] (Q-10b) |
| L3-7 | When the PC-L2 heartbeat is good but a particular loop's MPC controller is not active (the loop runs on PID), PC-L3 may still act on that loop through PC-L2's non-MPC mechanisms, within permissions. | [OWNER] (Q-10d) |
| L3-8 | When PC-L2 is offline, PC-L3 generates recommendation logs only (H-8). | [OWNER] (Q-10c) |
| L3-9 | **Production schedule.** The MES (forge-mes or the site's MES) owns the schedule. PC-L3 requests changes to it through forge_core. This is a business-action path of its own, not part of the PC-L3 → PC-L2 control path. Reversibility: AU-16. | [OWNER] (Q-19) |
| L3-10 | **Goals.** The source of truth is a structured goal spec: metric, target, time horizon, constraints, priority against other goals. A user may state a goal in plain language; it is compiled into the spec, and the user confirms it before it takes effect. | [OWNER] (Q-14) |
| L3-11 | **Agent topology is not decided.** Per-process SMEs with a coordinator, per-process SMEs negotiating as peers, and whole-area SMEs by specialty are all possibilities. This needs significantly more discussion before it is ready for the FSD (O-1). | [OWNER] (Q-13, round 2) |

### 2.8 Operator actions

| # | Decision | Tag |
|---|---|---|
| UI-1 | Taking a loop out of MPC mode is a PLC tag that the plant's own HMI can operate, so it works with Forge down (H-6). The tag is part of the PLC contract (L1-6, L1-8). | [OWNER] (Q-41) |
| UI-2 | Every other action (arming, approvals, granting autonomy, constraints, rollback) is described through FVTS and rendered by forge-display, per A-3. | [OWNER] (Q-41) |

### 2.9 FSD structure and follow-up work

| # | Decision | Tag |
|---|---|---|
| S-1 | A framework-level FSD holds what is stable and shared: the vocabulary, the hard invariants, the autonomy model (§2.3) and the contracts between layers. Separate FSDs follow for PC-L1, PC-L2 and PC-L3. | [OWNER] (Q-21) |
| S-2 | The PC-L3 FSD notes that the agent topology is not yet decided (L3-11). | [OWNER] (round 2) |
| S-3 | A prior-art search on F-2 is wanted later: recorded as a backlog item, to be run before any IP filing or public positioning. | [OWNER] (Q-32) |
| S-4 | The backlog and roadmap entries for this record and for S-3 are added in the same PR as the record, after it is synced to main: FB-110, FB-111 and D-11. | [OWNER] (Q-46) |

## 3. Earlier decisions this framework meets

Each row is a decision already in force and how round 3 settled its meeting with this framework.

| Earlier decision | How it is met |
|---|---|
| **A-2** [FACT]: formal `forge-<management service>` modules share one language and structure, Go, generated from the module SDK template. **D-7** [FACT]: whether the hub-hosted Python OT module and the Python adapters follow is still to decide. | Open by the owner's decision: the MPC Supervisor module's language is decided after the Forge review (M-7, O-2). |
| **A-6** [FACT]: the hub owns the databases; modules do not own database connections (MDEMG is the one exception). | Unchanged. An MPC deployment holds a derived working copy only (L2-12), the pattern of R-18. |
| **A-7** [FACT]: safety stays in the core; role checks, interlocks, confirmation and audit for writes are enforced in forge-core/OT, never only in a UI. [FACT] The OT module runs inside the hub process and its control package is the PLC write interface: type and range validation, write review, interlocks, role-based authorization, read-back confirmation, audit. | Unchanged. Every PC-L2 write goes through the local hub's OT write engine (L2-11). Whether that path meets PC-L2's cycle time and heartbeat interval is to be verified (O-4). |
| **R-9** [FACT]: the enterprise hub is a hub of hubs; one site hub per site is recommended and area hubs are possible; a local operation never waits on another hub. | "The local hub" in L2-11 is the area or site hub the deployment attaches to. Loss of an upstream hub does not stop the control cycle. |
| `roles.md` §5 and §12 [FACT]: the OT write engine's role becomes scopes (`ot:tag:write`, `ot:interlock:bypass`, `ot:recipe:download`), with per-tag and per-area permissions kept as constraints. | Used as is (L2-13). The permissions named in AU-8 and AU-15 (granting autonomy, rolling back) need scopes of their own under the same model; naming them is left to the FSDs (§4). |
| **A-3** [FACT]: all user interfaces come from forge-display; modules describe (FVTS) and ship no UI of their own. | Kept (UI-2), with one PLC-level exception that is not a Forge UI: the take-over tag (UI-1). |
| **A-10** [FACT]: local models only for MDEMG/Jiminy tooling; no OpenAI cloud models. | A-10 is unchanged. PC-L3 has its own rule: local by default, an administrator may permit others (L3-3). |
| Standing rules of 2026-11-03 [FACT]: no silent failure; no decision that pins the platform in. | Both apply. §5 carries a debt check per answer. H-8, AU-13 and L2-12 (a visible age on the working copy) are in the spirit of the first. |

## 4. Open questions

| # | Question | Tag |
|---|---|---|
| O-1 | PC-L3 agent topology (L3-11). The owner: it needs significantly more discussion before it is ready for the FSD; the FSD notes it as undecided. | [OPEN] |
| O-2 | The MPC Supervisor module's language (M-7), given A-2 and D-7. Decided after the Forge review (done 2026-11-13, §4a; the owner's answer pending). | [OPEN] |
| O-3 | The mapping onto Forge: which modules and SDK pieces carry PC-L1's functions (L1-2 to L1-5), the MPC Supervisor and PC-L3; which FxTS specs govern them; where the MDEMG integration seam of L3-1 sits. Forge review done 2026-11-13 (§4a); the owner's answer pending. | [OPEN] |
| O-4 | Whether the local hub's OT write engine meets PC-L2's cycle time and the PLC heartbeat interval (L2-11), and by what path it reaches Logix tags. [FACT] The OT module reaches PLCs through OPC UA today. Reviewed 2026-11-13 (§4a); the owner's answer pending. | [OPEN] |

Left to the FSDs to specify, as detail under the decisions above and not as new owner decisions unless a choice surfaces: the constraints an administrator may use to make the switch to Autonomous automatic (AU-8); the definition of the performance guard (AU-15); the scope names for granting autonomy and for rollback (§3); the contents of a rollout profile (L3-4); the definition of process state that conditional constraints refer to (L2-4); the items of the PLC contract (L1-6, L1-8).

### 4a. The Forge review (2026-11-13)

The read-only review the record asked for, done by Claude on `main` at `a3a01710` after PR 93 merged. Every statement is **[FACT]** (read in the tree, with its path) or **[PROPOSED]** (Claude's reading, for the owner); nothing here is decided, and the signature does not cover it. The owner's answers to the questions at the end become round 4 in §5.

**What the tree says**

- [FACT] The write path PC-L2 would use (`src/forge/modules/ot/control/write_engine.py`, `models.py`, `review.py`, `runtime.py`): one tag per `WriteRequest`; validation, review, interlock reads, authorization, a pre-read, the write and a live read-back (`RegistryTagIO.read_tag` reads a Standard tag from the PLC); every attempt is journaled and dispatched to the audit sinks (a `ContextualRecord` into the hub's ingest pipeline, MQTT, log). `WriteOrigin` is OPERATOR (policed by the tag's two-step and reason-code policy) or SYSTEM (confirmed upstream by the changeover sequence or an MES command). `OpcUaClient.write` is single-node by design (`opcua_client/client.py`); there is no batch write, no rate control and no write timing on the status. A control cycle writing N MVs plus a heartbeat costs about 3(N+1) PLC round trips and N+1 audit records: viable for a 10 to 60 s cycle with a few MVs, not for a 1 s cycle over many loops. Recorded as FB-112.
- [FACT] The `AdapterService.Write` RPC runs hub → spoke: the hub calls it through `POST /v1/adapters/{id}/write` and the spoke's callback URL (`src/forge/api/main.py`, FB-054). A deployment is a spoke and cannot push a PLC write over it; the hub-side write entry a deployment can call today is the OT module's `POST /api/v1/ot/control/writes`. The same hub → spoke path, with the D-3 write targets (`mes.schedule.<area>.advance`), is the route PC-L3's schedule requests (L3-9) take to the MES.
- [FACT] The scopes L2-13 names (`ot:tag:write`, `ot:interlock:bypass`) are the signed roles record (`docs/decisions/roles.md` §5, §12), not running code: the write engine authorizes by `WriteRole` and `WritePermission` area and tag patterns, and the gateway has no non-human identity yet. The roles record foresees module service identities with their own scopes (§10, §7); building them is FB-075. The scopes for granting autonomy (AU-8) and rolling back (AU-15) are not named anywhere.
- [FACT] Nothing models a PID loop: tags carry node ids, scan class, scale, clamp, alarm, history and the sampling bound (`tag_engine/models.py`); `TagWriteConfig` carries write limits; the equipment store (`forge.context.equipment`) models equipment. The one schema registry (D-10, FB-097) is not started, so the loop registry, rollout profile and goal spec schemas have no home yet.
- [FACT] `forge.core.models.decision` exists (`DecisionFrame`, `Assumption`, `EvidenceLink`, `ReassessmentTrigger`, `ConfidenceLevel`, `DecisionStatus`): a candidate for proposals, approvals and shadow-run outcomes. Process state has a home in the context field registry (`RecordContext.operating_mode`, `batch_id`, `recipe_id`, `event_type`; FB-013) and the context engine; "batch phase" is not a registered slot (the MES bridge carries `equipment_phase` in `extra`).
- [FACT] FVTS has three action kinds, `tag_write`, `alarm_operation` and `module_command`, each with `allowed_profiles` and `confirmation`; only `desktop_hmi` writes tags in v0.1.0 (D-4). Arming MPC mode is a PLC tag write (the handshake tag, L1-6), so arming from any other profile is a `module_command` to the MPC Supervisor, which writes. forge-display does not exist.
- [FACT] An MPC deployment is a spoke under the one-clock record: FB-090's `time_governance` declaration applies to it, and FB-093's refusal of a connection whose clock is unreadable or out of tolerance stops that connection's provider and refuses its writes, so a deployment writing through it sheds its loops (L2-5). The heartbeat interval of the PLC contract must be sized against the probe cadence.
- [FACT] Still decided and unbuilt: the Go module SDK (FB-017), scoped roles (FB-075), the schema registry (FB-097), the hub of hubs (R-9), forge-display (M4) and the time exchange (FB-092). The Python module builder is for adapters (the 6-file pattern, `docs/MODULE_BUILDER.md`).

**Proposed answers** (all [PROPOSED])

- O-2: the numerical core (identification, state-space observer, a QP per cycle, backtests) has its mature stack in Python and a thin one in Go, and the OPC UA path and the write engine are Python. Recommended: the management part in Go per A-2 and the deployment runtime in Python behind the L2-9 model and solver interface, the runtime a separately versioned spoke on the same contract. Debt check: the interface is the pin, not the language; the cost is two toolchains in one module. Alternatives: Go throughout (A-2, thin numerics, SDK unproven) or Python throughout (fastest; decides D-7 by default).
- O-3: one module, all of PC-L2 (M-3), as a FACTS spoke, its deployments registered as spokes on the local hub; PC-L1's functions in the same module (the loop registry as a `mod_mpc` schema with equipment as its parent, loop monitoring as a curation pipeline over tag history, baseline tuning as the module's identification tooling, PLC recommendations as documents never downloaded); writes through the OT control route under a controller service identity; one FVTS spec for points and module commands; one autonomy library shared with PC-L3, its records on the decision models; PC-L3 a later module with the MDEMG seam a documented optional interface, never an import; the PLC contract a section of the module's FACTS spec until a second vendor needs its own framework.
- O-4: a `CONTROLLER` write origin with its own review policy (interlocks and PLC clamps still apply); a cycle-write primitive (N tags in one OPC UA call, one read-back batch, one audit record per cycle); a heartbeat tag class journaled on state change only; p50 and p99 write timing per connection on the control status before any number is fixed. Logix is reached over OPC UA today; a native CIP path for PLCs without an embedded OPC UA server is a separate item; which Logix firmware embeds OPC UA is [UNVERIFIED].

**Answered by the owner on 2026-11-13:** work continues on `reh3376_dev01` (`forge-dev03` deleted after its merge); the pick-up is Claude's call (FB-090 first, the FSDs once the questions below are answered).

**Open for the owner**, one at a time, recorded as round 4: the FSDs' home and format; whether the O-2, O-3 and O-4 answers are recorded as round 4 of the record; O-2 itself (Go throughout, Python throughout, or a Go management part with a Python deployment runtime); whether a `CONTROLLER` write origin with its own review policy may become an FSD item (it changes the FB-074 model); whether the PLC contract is a section of the module's FACTS spec or its own framework; whether "batch phase" becomes a registered context field for L2-4's process state; whether a one-clock refusal of a connection counts as a shed event for AU-15; whether the signed record on public `main` is acceptable before the S-3 prior-art search, and how much FSD detail may go public; whether the agent context's provenance line (`claude-fable-5-2`) is corrected.

## 5. The owner's answers (2026-11-13)

The last column of each table is the debt check the owner's standing rule asks for (does the answer pin the platform in later?). It is Claude's assessment, for the owner to correct. **[PROPOSED]**

**Round 1.** Asked and answered one at a time.

| # | Question | Owner's answer (2026-11-13) | Pins us in? |
|---|---|---|---|
| Q-1 | Which variable convention: PID terms as written (PV, CV, SP, DV), MPC terms, or PID terms with MPC aliases? | **None of the three as offered.** Be very careful here; create one standard set of names for the variables of both PID and MPC (V-1). | See Q-1b. |
| Q-1b | Which standard set: PV/SP/MV/DV with CV retired, PV/SP/CV/DV (Logix), or PV/SP/OUT/DV? | **PV/SP/MV/DV, CV retired** (V-2 to V-4). | Guarded: a vocabulary is referenced from every schema, screen and PLC mapping, so it is expensive to change later. Vendor terms such as `PIDE.CV` are mapped once, at the PLC boundary, and never enter the model. |
| Q-2 | While PC-L2 is active on a loop, which actions may it take on the PID: write SP, write output directly, retune gains, switch mode? | **All four by default**, while the loop is in MPC control mode and the heartbeat is active and good; users must be able to change the default with user-defined constraints (L2-3). | No: authority is a default that constraints narrow (L2-4). |
| Q-3 | Default PLC behavior when the heartbeat goes bad in MPC mode? | **Auto at the last SP, baseline gains restored** (L2-5). | No: a default, overridable per loop (L2-6). It requires baseline gains stored in the PLC, which the PLC contract carries (L1-8). |
| Q-4 | Who may place a loop into MPC mode: operator, PC-L2 self-arming, PC-L3 agents? | **All three.** PC-L3 eventually, once confidence is appropriately high: off by default, user can turn it on (L2-7). | No: each entry path is a switch. |
| Q-5 | Which parts of a PC-L2 controller may the self-improvement loop change: model parameters, tuning, model structure, operating limits? | **All four**, as user-activated actions, with default states determined as the framework is worked through (L2-10; the default is Q-22). | No: each category is activated separately. |
| Q-6 | How does a proposed change get onto a live loop: per-category policy, always human approval, or always automatic after validation? | **Progressive per category.** A human is in the loop until a stated confidence is reached and maintained for a user-defined period; a fast rollback always accompanies a change (AU-3, AU-12). | No. |
| Q-7 | Which signals feed the confidence score? | **All four offered** (AU-4). | No: how they combine is Q-25. |
| Q-8 | Which control problems must PC-L2 handle: continuous regulation, within-batch trajectory, batch-to-batch correction, startups and transitions? | **All four.** The framework is not specific to one facility or application (L2-8, F-6). | Guarded: this widens v1. The model interface (Q-9) has to carry batch and transition cases from the start, or it is reworked later. |
| Q-9 | Model class: pluggable with linear first, pluggable with automatic selection, nonlinear ML primary, or hybrid physics and data? | **Pluggable, linear first** (L2-9). | Guarded: linear first is an order of implementation, not a limit, provided the interface does not assume a linear state-space form. |
| Q-10 | Which actions may PC-L3 ultimately take? (Asked as one question with an assumption attached.) | **Break it up and ask the parts separately.** All four action types are possible; the default state of each varies with the rollout (L3-4). | No: defaults are per rollout (Q-24). |
| Q-10a | Does PC-L3 earn autonomy by the same rule as PC-L2? | **Yes, the same rule** (L3-5). | No: one autonomy mechanism for both layers, built and audited once. |
| Q-10b | What may PC-L3 write to: PC-L2 only, PC-L2 plus PC-L1 setpoints, or any PC-L1 or PC-L2 parameter? | **Each layer can only affect the layer directly below it** (H-1, L3-6). | Deliberate: PC-L2 becomes a required presence on every loop PC-L3 is to influence. That is the safety property the owner wants, not debt. |
| Q-10c | What form may PC-L2 take on a loop that is PID-only today? | PC-L2 is not only MPC; it also comprises the mechanisms PC-L3 needs to reach PC-L1. If PC-L2 is offline, PC-L3 must know it and generate recommendation logs (L2-1, H-8). | No: PC-L3 degrades to recommendations; nothing to unwind. |
| Q-10d | PC-L2 heartbeat good, but the loop's MPC controller is not active: may PC-L3 still change that loop through PC-L2's non-MPC mechanisms? | **Yes, within permissions** (L3-7). | No. |
| Q-11 | Are PC-L3's agents built on the MDEMG mission layer? | **PC-L3 stands alone, with the ability to allow for MDEMG integration** (L3-1). | No, the opposite of a pin, provided the integration seam is defined so that MDEMG is optional in fact (O-3). |
| Q-12 | What is an SME agent: a language model with deterministic tools, a language model reasoning directly, a learned non-LLM agent, or agent-type agnostic? | **A language model with deterministic tools** (L3-2). | No: the numbers come from tools, so the language model can be replaced without changing where a number came from. |
| Q-13 | How are the agents of one area organized? | **All the scenarios are possibilities**; to be worked through as governance and instantiation are better understood (L3-11). | Nothing decided, so nothing pinned. The FSD must not hard-code a topology meanwhile. |
| Q-14 | How does a user define a PC-L3 goal? | **A structured spec, with natural language optional** and confirmed by the user (L3-10). | No: the spec is the contract; natural language is a front end to it. |
| Q-15 | Where does the PC-L2 control cycle run? | **On an edge runtime near the PLC** that keeps running if the link to the hub drops (L2-11; which hub is Q-38). | No, as settled by Q-38 and Q-39. |
| Q-16 | PLC platform scope of the first FSD? | **A vendor-neutral contract, Logix first** (L1-8). | Guarded: see Q-40. |
| Q-17 | What should the framework do for PC-L1: loop registry, performance monitoring, baseline tuning, PLC code generation? | **The first three, and PLC code recommendations.** No direct PLC code generation; tags may be read and written if permission is granted (L1-2 to L1-5, H-2). | No: H-2 removes a capability on purpose. |
| Q-18 | Layer naming? | **PC-L1 / PC-L2 / PC-L3** (V-5). | No. |
| Q-19 | Where does the production schedule live, and how does PC-L3 change it? | **The MES owns it; PC-L3 requests changes** (L3-9). | No: the MES stays the system of record. |
| Q-20 | Which rules are hard prohibitions: never write to safety systems, never bypass interlocks, PLC-side clamps on every write, operator can always take over? | **All four** (H-3 to H-6). | Deliberate: safety limits, not configurable. |
| Q-21 | FSD shape: a framework FSD plus one per layer, one FSD for all three, or PC-L1 and PC-L2 first? | **A framework FSD plus one per layer** (S-1). | No. |

**Round 2.** After reading the round 1 record, the owner answered its four assumptions and three of its open items.

| Item | Owner's answer (2026-11-13) | Recorded as |
|---|---|---|
| The four assumptions: changes are versioned; validation means a backtest plus a shadow run; autonomy is revoked automatically when confidence falls; the shed default can be overridden per loop. | **All four approved.** | AU-10, AU-11, AU-9, L2-6 |
| How the PLC-side interface logic gets into the PLC, given H-2. | **An engineer writes the PLC code, based on suggestions from Forge at setup.** The PLC type must be determined before sample code is generated. | L1-6, L1-7 |
| Whether the earlier `mpc-supervisor` work is the starting point for PC-L2. | **The MPC Supervisor should be its own Forge module**, responsible for building, maintaining, improving and monitoring the MPCs for a given site or area. Multiple PLCs can be used within a site or area, and they may be from multiple vendors. | M-1, M-2, M-4, L1-9. The starting code was asked again as Q-35. |
| PC-L3 agent topology. | **It needs significantly more discussion before it is ready for the FSD.** This can be noted in the FSD. | L3-11, S-2, O-1 |

**Round 3.** The owner asked for every remaining open question to be put one at a time until all were answered. Q-27 and Q-27b were put together; the rest singly.

| # | Question | Owner's answer (2026-11-13) | Pins us in? |
|---|---|---|---|
| Q-22 | With three states per category (Off, Propose, Autonomous), what does a newly created PC-L2 controller start in? | **All four categories Off** (AU-1, L2-10). | No: a default; activation is per category. |
| Q-23 | At what level are states set, and how do the levels relate? | **Site → area → controller, capped**: a lower level may be equal or more restrictive, never less (AU-2). | No: one inheritance rule, reused for constraints (L2-4). |
| Q-24 | What baseline does the framework ship for PC-L3 action types before a rollout profile sets its own? | **All Off** (L3-4). | No: the profile is versioned data. |
| Q-25 | How do the four confidence signals combine? | **Every signal passes its own threshold** (AU-5). | No: thresholds are data. |
| Q-26 | How is the hold period measured? | **A duration and a minimum count** of evaluated events (AU-6). | No. |
| Q-27 | Where do the threshold values, the duration and the count come from? | **They must be entered; the framework ships no values** (AU-7). | No: nobody inherits a number they did not choose. It costs setup effort per category. |
| Q-27b | When the criteria are met, how does a category switch to Autonomous? | **By default a human with proper credentials must approve.** An administrator can set the switch to automatic based on a series of constraints being met (AU-8). | No: automatic granting is an administrator's setting, not the default. |
| Q-28 | What does a "quick" rollback of a PC-L2 change require: the previous version on the next cycle, a user-defined time bound per category, or both? | **Both** (AU-14). | Guarded: a next-cycle switch-back means every deployment holds two versions at once, which sizes the deployment and applies to model-structure changes as well. |
| Q-29 | Who or what may trigger a rollback? | **The automatic performance guard, a shed event, PC-L3, and a person with the proper credentials**; that permission is not granted to all users with operator privileges (AU-15). | No. It needs a scope of its own under the authorization model. |
| Q-30 | Which kinds of user constraint on PC-L2's authority must be supported? | **All four**: disable, bound, conditional on process state, require confirmation (L2-4). | Guarded: "conditional on process state" needs one shared definition of process state, supplied by the hub's models and not by a module-local one. |
| Q-31 | How is PC-L2's permission to write PLC tags granted? | **Use the existing authorization model**: a service identity per controller, `ot:tag:write` limited to its tags, never `ot:interlock:bypass` (L2-13). | No: it avoids a second permission system. |
| Q-32 | Is a prior-art search wanted? | **Yes, later**: a backlog item, before any IP filing or public positioning (S-3). | No. |
| Q-33 | Is the edge runtime part of the MPC Supervisor module? | **The module builds, deploys and monitors them, so it is one module with multiple MPC deployments** (M-2). | No. |
| Q-34 | Do PC-L2's non-MPC mechanisms live in the MPC Supervisor module? | **Yes, the module is all of PC-L2** (M-3). | Guarded: the supervisory path PC-L3 depends on shares a module and a release cycle with MPC. The two should stay separable inside the module. |
| Q-35 | What is the role of the earlier `mpc-supervisor` package? | **Reference only; the module is a new build** (M-6). | No: nothing is imported that has to be maintained. |
| Q-36 | How many instances of the module's management part run? | **Chosen per rollout** (M-5). | No. |
| Q-37 | What language is the MPC Supervisor module? | **Decide after the Forge review** (M-7, O-2). | Open. |
| Q-38 | "Keeps running if the link to the hub drops": write through the local hub, or hold an own PLC connection with the checks at the edge? | **Write through the local hub** (L2-11). | Bounded: one write path and one audit trail, and A-7 stands. The control cycle's timing and availability now depend on the local hub (O-4). |
| Q-39 | How does an MPC deployment hold its models, given A-6? | **A derived working copy** (L2-12). | No. |
| Q-40 | Does v1 still implement Logix only? | **Logix only in v1**, but other PLC OEMs will be added, so build in a manner that does not tie us down to excessive technical debt when they are (L1-8). | Guarded, in the owner's own words: everything specific to a PLC type stays behind the contract. |
| Q-41 | Where do the operator's actions live? | **A PLC-level take-over tag plus forge-display** for everything else (UI-1, UI-2). | No. |
| Q-42 | Does "local models only" govern PC-L3's language model? | **Local by default; an administrator may allow others** (L3-3). | Bounded: permitting an external model is an explicit, recorded choice, and no number depends on which model is used (Q-12). |
| Q-43 | Are H-7 (every change carries a fast rollback) and H-8 (PC-L2 offline suspends PC-L3) hard invariants? | **H-8 is hard; H-7 is configurable** (§2.2, AU-12). | No. |
| Q-44 | How is rollback defined for PC-L3 actions? | **Restore the prior state; a schedule change request states how long it stays reversible** (AU-16). | No. |
| Q-45 | Three things assumed in round 3: the three states; a versioned rollout profile per site or area; constraints set at site, area and controller under the capped rule. | **All three approved** (AU-1, L3-4, L2-4). | No. |
| Q-46 | Who files the backlog and roadmap entries? | **Claude adds them in this PR**, after syncing to main (S-4). | No. |
| Q-47 | What is the record's status when it is pushed? | **Approved; the answers are the signature.** | — |
| Q-48 | What may an administrator adjust in the rollback requirement? | **Anything, including switching it off globally** (AU-12). | Guarded: with rollback off there is no prepared way back. Q-49 limits the consequence. |
| Q-49 | With rollback off for a category, may that category still run Autonomous? | **No; a person approves each change** (AU-13). | No. |
| Q-50 | Which PC-L3 schedule change requests always need human approval? | **Only the non-reversible ones** (AU-16). | No. |

## 6. Sources

- The session of 2026-11-13 between the owner and Claude: the owner's description (§1) and the questions and answers (§5).
- `docs/ROADMAP.md` §1 (A-2, A-3, A-5, A-6, A-7, A-10) and §5 (D-1, D-7).
- `docs/decisions/roles.md` §1, §5, §7, §8, §12: the OT write engine's roles and scopes; tag writes pass through the hub; the hub-of-hubs topology (R-9) and the derived copy (R-18).
- `docs/decisions/forge-mes-go.md` §1: the standing rules of 2026-11-03 (no silent failure; no decision that pins the platform in).
- `src/forge/modules/ot/host.py` (the OT module runs inside the hub process), `src/forge/modules/ot/control/__init__.py` (the layers of the PLC write interface), `src/forge/modules/ot/opcua_client` and `src/forge/modules/ot/tag_engine/providers/opcua_provider.py` (PLC access through OPC UA).
- The repository at `cc2c1da` (search for existing MPC code, §2.6).
