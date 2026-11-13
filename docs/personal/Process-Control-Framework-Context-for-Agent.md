---
title: Three-layer process control framework — Context for AI Coding Agent
created: 2026-11-13
audience: AI coding agent working in reh3376/forge
companion: docs/decisions/process-control-framework.md
status: written by Claude at the owner's request; to be reviewed and amended by the owner (reh3376) before use
---

# Three-layer process control framework — context for the AI coding agent

## 0. How to use this document

You are about to start incorporating the **three-layer process control framework (PC-L1 / PC-L2 / PC-L3)** into Forge. The decisions are in the companion file, `docs/decisions/process-control-framework.md` ("the record"), which the owner signed on 2026-11-13. This document gives you what the record does not: how it came about, how to read it, which parts of the repository it touches, and a sequence for beginning the work.

This document decides nothing. Precedence is: the owner's word, then the record, then this document. If this document and the record disagree, the record is right and this document has a defect; fix it in the same change.

It was written by Claude (Anthropic, model `claude-fable-5-2`) in a chat session on 2026-11-13, working in a cloud workspace on a shallow clone of `main`. The facts were read at `62f37fe` and checked again at `cc2c1da`, after PRs 88 to 91 had merged the same day; every one still held.

### Tags

The tags are the record's, plus one.

| Tag | Meaning | How to treat it |
|---|---|---|
| **[OWNER]** | Decided by the owner (reh3376) on 2026-11-13 | Authoritative. Do not change without asking the owner. |
| **[FACT]** | Read directly in `reh3376/forge` and checked at `cc2c1da`, with the path | True at that commit. Re-verify; the repository moves. |
| **[PROPOSED]** | Claude's reading or suggestion | Not approved. Challenge it if the code or the owner's intent says otherwise. |
| **[OPEN]** | A question outstanding | Ask the owner. Do not assume. |
| **[UNVERIFIED]** | Claude believed it but did not confirm it | Verify before relying on it. |

### Ground rules for the agent

1. **The record is signed.** Do not edit an [OWNER] statement. A change is a new question to the owner, asked one at a time, recorded as a new round in the record's §5 with a debt check. Never set or change the status line yourself; it is set on the owner's word only.
2. **Nothing is implemented, and nothing should be before its FSD exists.** The order is: the Forge review, the framework FSD, then the PC-L1, PC-L2 and PC-L3 FSDs (S-1). See §6.
3. **The hard invariants bind every design, spec and line of code** (H-1 to H-6 and H-8; §3.2 below). If a task seems to require breaking one, stop and ask.
4. **Vocabulary is PV / SP / MV / DV.** "CV" must not appear in any identifier, schema field, spec, UI label or document of this framework (V-3). A vendor's own term, such as Logix `PIDE.CV`, is mapped to MV in one place, at the PLC boundary.
5. **Never generate, edit or download PLC code to a PLC** (H-2). Recommendations and sample code for an engineer are in scope, and only after the PLC type is known (L1-6, L1-7).
6. **Do not import conventional APC practice as a default.** The owner's first correction in the session was that this framework is new, not the classic control hierarchy (F-2). Several decisions differ from what convention would suggest; §1 lists them.
7. **Open questions are not decided.** O-1 to O-4 in the record, the "left to the FSDs" list under them, and §7 below: propose, tag it [PROPOSED], and ask.
8. **The repository's own rules still apply** [FACT, `docs/PRINCIPLES.md` §2, `docs/ROADMAP.md` §1, `docs/FxTS/README.md`]: FxTS is spec-first and you do not edit a spec to make code pass; only the owner approves an integrity hash; schema–runner parity is mandatory; safety stays in the core (A-7); the hub owns the databases (A-6); all user interfaces come from forge-display (A-3); no silent failure; no decision that pins the platform in; documentation is current before every push; every finding is fixed or recorded in `BACKLOG.md`.
9. **Workflow** [FACT, A-8]: one backlog item per PR, on a branch that is not `main`; the auto-PR workflow opens the PR on push; the owner merges on green CI; never push the next item onto a branch with an open PR. The record was committed on `forge-dev03` at the owner's instruction, while A-8 names `reh3376_dev01`. Ask which branch follow-up work uses.
10. **Jiminy.** [FACT] `.claude/hooks` carries the MDEMG/Jiminy PreToolUse hooks. The record and this document were written in a session that could not reach an MDEMG instance, and the owner said to skip the check. Run your normal Jiminy handshake before you change anything.

---

## 1. Background: how the record came about

**[OWNER]** The owner set a three-step plan: explain the framework, then review the current state of Forge, its SDK and how modules are built, then start building. Only the first step is done. The record is its output.

The method was the one the other decision records use: one question at a time, with options and a recommendation where Claude had a reason for one; the owner picked an option or wrote his own answer. There were three rounds and 50 questions. At Q-47 the owner declared the answers the signature.

The answers where the owner rejected or reshaped what was offered show where a reasonable default would have been wrong:

| Question | What was offered or assumed | What the owner decided |
|---|---|---|
| Framing | "A classic control hierarchy" | It is new; assume nothing from the conventional hierarchy (F-2). |
| Q-1 | PID terms, MPC terms, or one set with aliases | None of them: one standard set for both, because mixed terms would confuse the controls engineers (V-1 to V-3). |
| Q-2 | PC-L2 writes setpoints only (the conventional cascade) | PC-L2 may also write the PID output directly, retune gains and switch mode, by default (L2-3). |
| Q-10 | One compound question on PC-L3's authority | Split it. All four action types are possible; defaults vary by rollout (L3-4). |
| Q-10b, Q-10c | PC-L3 might write PID setpoints on simple loops | Never. Each layer affects only the layer below, and PC-L2 is more than MPC: it holds the mechanisms PC-L3 acts through (H-1, L2-1). |
| Q-11 | PC-L3 built on MDEMG | PC-L3 stands alone; MDEMG integration must be possible, not required (L3-1). |
| Q-13 | Three agent topologies | None chosen; needs much more discussion (L3-11, O-1). |
| Q-17 | PLC code generation as a feature | Recommendations only. Generating or editing PLC code is too dangerous (H-2). |
| Q-29 | Any operator may roll a change back | Only a person with that specific permission (AU-15). |
| Q-43, Q-48 | Rollback as a hard invariant | A default. An administrator may switch it off, even globally; a category without rollback cannot be Autonomous (AU-12, AU-13). |
| Q-40 | Logix only in v1 | Yes, but built so that adding other PLC OEMs does not create excessive technical debt (L1-8). |

---

## 2. How the record is structured

| Section | Holds | IDs |
|---|---|---|
| Header | Status line (signed), backlog and roadmap numbers, participants, the meaning of the tags | |
| §1 | The owner's description of the framework | F-1 to F-6 |
| §2.1 | Vocabulary and layer names | V-1 to V-5 |
| §2.2 | Hard invariants | H-1 to H-6, H-8 |
| §2.3 | Autonomy and change control, shared by PC-L2 and PC-L3 | AU-1 to AU-16 |
| §2.4 | PC-L1 | L1-1 to L1-9 |
| §2.5 | PC-L2 | L2-1 to L2-13 |
| §2.6 | The MPC Supervisor module | M-1 to M-7 |
| §2.7 | PC-L3 | L3-1 to L3-11 |
| §2.8 | Operator actions | UI-1, UI-2 |
| §2.9 | FSD structure and follow-up work | S-1 to S-4 |
| §3 | How the framework meets decisions already in force | |
| §4 | Open questions, and the details left to the FSDs | O-1 to O-4 |
| §5 | Every question as asked, the owner's answer, and a debt check | Q-1 to Q-50 |
| §6 | Sources | |

Things to know when reading it:

- **Cite by ID.** Each decision row names the question it answers; §5 has the question as it was put and the answer.
- **There is no H-7.** The rollback rule was listed as H-7 in an early draft; the owner ruled it a default (Q-43), and it is AU-12.
- **IDs from other documents** appear in §3: A-n are the roadmap's decisions in force, D-n its decision queue, R-n the roles record, FB-n the backlog. They are not this record's.
- **The debt-check column in §5 is Claude's assessment** and is tagged [PROPOSED]. The signature does not cover it.
- **A reading order that works:** the header, §2.2, §2.1, §2.3, §2.5 with §2.6, §2.4, §2.7 with §2.8, §3, §4. Use §5 as reference.

---

## 3. The framework in one page

### 3.1 Layers and paths

```
user goals: a structured goal spec (L3-10)
     │
PC-L3   SME agents: a language model plus deterministic tools (L3-2)
     │   acts only on PC-L2 (H-1)
     │   schedule change requests go to the MES through forge_core (L3-9)
     ▼
PC-L2   the MPC Supervisor module, which is all of PC-L2 (M-3)
     │   management part: builds, deploys, maintains, improves, monitors (M-2)
     │   MPC deployments near the PLC: the control cycle, and the
     │   supervisory mechanisms PC-L3 acts through (L2-1)
     │   every PLC write goes through the local hub's OT write engine (L2-11)
     ▼
PC-L1   PID in the PLC (L1-1), plus PLC-side logic an engineer writes (L1-6):
        heartbeat watchdog, MPC-mode handshake, stored baseline gains,
        shed logic, clamps on every write (H-5), take-over tag (UI-1)
```

### 3.2 Hard invariants

No setting, rollout profile or earned autonomy relaxes these.

| # | In short |
|---|---|
| H-1 | Each layer affects only the layer directly below it. |
| H-2 | No PLC code is generated or edited on a PLC. Tags may be read and written where permission is granted. |
| H-3 | No layer writes to safety systems. |
| H-4 | No layer forces, bypasses or overrides interlocks or permissives. PLC logic can always shed a loop out of MPC mode. |
| H-5 | Every PC-L2 write is clamped by limits held in the PLC. |
| H-6 | The operator can always take over, immediately. |
| H-8 | If PC-L2 is offline, PC-L3 knows it, cannot effect change, and writes recommendation logs only. |

### 3.3 What degrades to what

| Event | Result | Source |
|---|---|---|
| Heartbeat bad while a loop is in MPC mode | PID resumes in auto at the last SP, with baseline gains restored from the PLC | L2-5 |
| An upstream hub (site, enterprise) is unreachable | The MPC deployment keeps running | L2-11 |
| The deployment's local hub is down | Its loops shed to PID | L2-11 |
| PC-L2 is offline | PC-L3 writes recommendation logs only | H-8 |
| PC-L2 healthy, but a loop's MPC is not active | PC-L3 may still act on that loop through PC-L2's supervisory mechanisms | L3-7 |
| Forge is down entirely | The take-over tag still works from the plant's own HMI | UI-1 |
| Confidence falls below a threshold | Autonomy is revoked automatically | AU-9 |

### 3.4 The autonomy model in brief

- Every PC-L2 self-improvement category and every PC-L3 action type is **Off**, **Propose** or **Autonomous** (AU-1).
- States are set at site, area and controller level; a lower level is never less restrictive than the one above (AU-2).
- To become Autonomous, all four confidence signals must be over their own thresholds (AU-4, AU-5) for a duration and a minimum count of evaluated events (AU-6). The framework ships no values; a user enters them (AU-7).
- A person with the proper credentials grants autonomy by default; an administrator can make the switch automatic (AU-8). Revocation is automatic (AU-9).
- Changes are versioned (AU-10) and validated by a backtest plus a shadow run (AU-11).
- Rollback is a default, not an invariant (AU-12). Without it a category is Propose at most (AU-13). For PC-L2 the previous version stays loaded and takes over on the next cycle (AU-14).

### 3.5 Shipped defaults

Everything starts Off: the four self-improvement categories of a new PC-L2 controller (L2-10), the four PC-L3 action types (L3-4), and PC-L3's ability to arm MPC mode (L2-7). PC-L3's language model is local unless an administrator permits another (L3-3).

---

## 4. Repository facts that shape the work

All [FACT] at `cc2c1da`. Re-verify each before you build on it.

| Fact | Where | Why it matters here |
|---|---|---|
| The repository holds no MPC or process-control-layer code. | Search for "MPC", "mpc-supervisor", "model predictive" | The MPC Supervisor module is a new build (M-6). |
| The OT module runs inside the hub process. It has OPC UA connections, a tag engine, alarming and a control package that is the PLC write interface: type and range validation, write review, interlocks, role-based authorization, read-back confirmation, audit. | `src/forge/modules/ot/host.py`, `src/forge/modules/ot/control/` (`write_engine.py`, `validation.py`, `review.py`, `interlock.py`, `authorization.py`, `audit.py`, `connections.py`), `src/forge/modules/ot/opcua_client/`, `src/forge/modules/ot/tag_engine/` | Every PC-L2 write goes through this (L2-11). Whether it meets PC-L2's cycle time and heartbeat interval is O-4. |
| The OT control routes are mounted under `/api/v1/ot`; `AdapterService` has a `Write` RPC that the hub calls on a spoke (write-back, FB-054). | `src/forge/modules/ot/host.py`, `src/forge/api/main.py` (`/v1/adapters/{id}/write`), `docs/WHERE-WE-ARE.md` §2 | The REST route is the only hub-side write entry a deployment can call; the `Write` RPC runs hub → spoke and is the path PC-L3's schedule requests take to the MES (corrected 2026-11-13 by the Forge review, record §4a). O-3. |
| The topology is a hub of hubs along ISA-95: an enterprise hub, a site hub per site, optional area hubs. A local operation never waits on another hub. | `docs/decisions/roles.md` §8 (R-9) | "The local hub" in L2-11 is the area or site hub. |
| The hub-of-hubs federation is not built yet. Neither are scoped roles in the gateway, the Go module SDK, or any management module in Go. forge-display does not exist; its contract (FVTS) does. | `docs/WHERE-WE-ARE.md` §1 | L2-11, L2-13 and UI-2 rest on things that are decided but not built. Sequencing is a question for the owner (§7). |
| Authorization is the signed role model. The OT write engine's role becomes scopes (`ot:tag:write`, `ot:interlock:bypass`, `ot:recipe:download`) with per-tag and per-area constraints. | `docs/decisions/roles.md` §5, §12 | L2-13 uses it as is. Granting autonomy (AU-8) and rolling back (AU-15) need scopes of their own. |
| Formal `forge-<management service>` modules are Go, generated from the module SDK template (A-2, A-5). Whether the Python OT module and adapters follow is undecided (D-7). | `docs/ROADMAP.md` §1, §5; `go/cmd/forgectl`, `go/cmd/forged`, `go/internal/scaffold`, `go/internal/models` | The MPC Supervisor module's language is O-2. |
| The Python module builder builds adapter modules to a six-file pattern. | `docs/MODULE_BUILDER.md`, `src/forge/sdk/module_builder/` | It is for adapters. Whether any of it serves this module is part of O-3. |
| Every system is a spoke speaking `forge.v1.AdapterService` over gRPC, governed by a FACTS spec per adapter and FTTS for transport. JSON over gRPC is forbidden. | `docs/ROADMAP.md` §1 (A-1), `docs/PRINCIPLES.md` §2 | Whether the MPC Supervisor and its deployments are spokes, and under which specs, is O-3. |
| FxTS governance is real for FATS, FACTS, FTTS and FVTS, plus FHTS hashing. The other frameworks are stubs or planned. | `docs/WHERE-WE-ARE.md` §1, `docs/FxTS/` | Contracts for this framework are written as specs first. |
| HMI/SCADA is optional and pluggable; a site may keep third-party software such as Ignition through an integration module (A-4). | `docs/ROADMAP.md` §1 | "The plant's own HMI" in UI-1 may be third-party. |
| forge-mes is an interim NestJS/Next.js bridge; the Go rewrite is decided and not built. | `docs/WHERE-WE-ARE.md` §1, `docs/decisions/forge-mes-go.md` | PC-L3's schedule change requests (L3-9) need a schedule owner to send them to. |
| The decision is a record: decisions are stored with the products and lineage they relied on and the observed outcome. | `docs/VISION.md` (P-9; components `forge.core.models.decision`, `forge.observer`) | [UNVERIFIED] Proposals, approvals and outcomes at PC-L2 and PC-L3 probably belong in these models. Check before designing a new one. |
| One clock, governed by the hub. | `docs/PRINCIPLES.md` §2, `docs/decisions/one-clock-ot-source-time.md` | [PROPOSED] Control-cycle timestamps, shadow-run comparisons and confidence windows use hub time. |
| The roadmap's workstreams are WS-1 to WS-11. None covers process control. | `docs/ROADMAP.md` §3 | Where this work sits in the roadmap is set by the entry added with the record (S-4). |
| The repository is public. | `docs/ROADMAP.md` §1 (A-9) | See §7, "Publication". |

---

## 5. Where each part might land

These are hypotheses for the Forge review to test. None is decided; the mapping is O-3.

| Element | Candidate home | Verify first |
|---|---|---|
| Loop registry (L1-2) | Beside the OT module's tag registry and the hub's equipment registry, with its schema in the one schema registry (D-10) [PROPOSED] | What the tag registry and equipment registry already hold about a loop. |
| Loop performance monitoring (L1-3) | A curated data product over tag history [UNVERIFIED] | Whether `forge.curation` can express it. |
| Baseline PID tuning (L1-4) | The identification tooling of the MPC Supervisor module [PROPOSED] | Nothing to verify yet; it depends on O-2. |
| PLC contract (L1-8) | A specification of its own, with per-vendor sample logic produced as recommendations [PROPOSED] | Whether an existing FxTS framework fits or a new one is needed. Ask the owner. |
| MPC Supervisor module (M-1 to M-7) | A new module, with an FVTS spec for its points and actions (UI-2) [PROPOSED] | The state of the module SDK; whether the module is a spoke under FACTS. |
| A deployment's writes (L2-11) | The OT write engine, through its control route `POST /api/v1/ot/control/writes` [FACT, review 2026-11-13] | Reviewed 2026-11-13 (record §4a): one tag per write, pre-read + write + live read-back, one audit record per attempt, no controller origin, no batch write, no timing on the status (FB-112). Still open: how a non-human identity is authorized (FB-075). This is O-4. |
| A deployment's working copy (L2-12) | Served by the hub; held in the deployment as a cache with a visible age [PROPOSED] | The pattern used for the derived copy of R-18. |
| Autonomy model (§2.3) | One shared implementation used by PC-L2 and PC-L3, with its records in the decision models [PROPOSED] | `forge.core.models.decision`. |
| Rollout profile (L3-4), goal spec (L3-10) | Schemas in the one schema registry [PROPOSED] | The registry's state after D-10. |
| PC-L3 (L3-1 to L3-11) | A module of its own, with a defined seam for MDEMG [PROPOSED] | Not before O-1 is discussed. |

---

## 6. A sequence for beginning the work

**Step 1. The Forge review (read-only).** This is the owner's second step and it answers O-2, O-3 and O-4. Read the OT write path end to end, the module SDK in both languages, the FVTS contract, the role model's state of implementation, the decision models, the schema registry and the transport contract. Write the findings as [FACT] statements with paths. Put each resulting choice to the owner one at a time, and record the answers as a new round in the record.

**Step 2. Backlog and roadmap.** The entries are added with the record (S-4): FB-110 for the framework, FB-111 for the prior-art search (S-3), and D-11 in the roadmap's decision queue. Work from them: one backlog item per PR.

**Step 3. The framework FSD.** Per S-1 it holds what is stable and shared: the vocabulary (§2.1), the hard invariants (§2.2), the autonomy model (§2.3), and the contracts between layers: PC-L3 to PC-L2, PC-L2 to the PLC (the PLC contract), and PC-L2 to the hub. Where FSDs live in the repository and what format they take is not decided (§7).

**Step 4. Specs before code.** Each contract the FSDs define becomes an FxTS spec before any implementation, with its integrity hash left for the owner to approve.

**Step 5. The layer FSDs**, in the order PC-L1, PC-L2, PC-L3. The PC-L3 FSD states that the agent topology is undecided (S-2).

The prior-art search (S-3) is not a prerequisite for the FSDs. It comes before any IP filing or public positioning.

---

## 7. Open decisions: ask the owner, do not assume

From the record:

1. **O-1** PC-L3 agent topology.
2. **O-2** The MPC Supervisor module's language.
3. **O-3** The mapping onto Forge's modules, SDK and FxTS specs, and the MDEMG seam.
4. **O-4** Whether the OT write engine meets PC-L2's cycle time and heartbeat interval, and how it reaches Logix tags.
5. The details the record leaves to the FSDs: the constraints for automatic granting of autonomy (AU-8), the performance guard (AU-15), the scope names for granting autonomy and for rollback, the contents of a rollout profile, the definition of process state for conditional constraints (L2-4), the items of the PLC contract.

Found while writing this document, and not yet put to the owner:

6. **Sequencing.** L2-11 assumes an area or site hub, L2-13 assumes scoped roles, UI-2 assumes forge-display. None is built yet. What the first usable increment of the framework depends on, and what it can do without, is undecided.
7. **FSDs.** Where they live and in what format. The only FSD in the repository, `scripts/tutorial-forge/FSD.md`, describes a different kind of thing.
8. ~~**Branch.**~~ Answered 2026-11-13: `reh3376_dev01`; `forge-dev03` was deleted after its merge.
9. **Roadmap placement.** D-11 is not placed in a workstream or in the roadmap's sequence. Whether process control becomes a workstream of its own is undecided.
10. **Publication.** The repository is public, the record states that the framework is new (F-2), and the owner wants a prior-art search before any IP filing or public positioning (S-3). How much further design detail goes into public branches, and when, is the owner's call. Ask before adding detailed designs.

---

## 8. What was verified, and what was not

Verified:

- Every [FACT] above was read in the file named at `62f37fe`, and the cited text and paths were checked again at `cc2c1da`.
- The record's tables have consistent column counts, no ID is defined twice, and every ID it references is defined (H-7 is referenced deliberately, as withdrawn).

Not verified:

- No code was run and no tests were run.
- The OT write engine's timing, rate limits and behaviour under a periodic heartbeat write.
- The contents of the Go tree beyond its directory names.
- Anything about the owner's earlier `mpc-supervisor` package. It is not in this repository; its description came from the owner.
- The state of `main` after `cc2c1da`.

---

## 9. Housekeeping state at the end of the session

- Branch `forge-dev03`, cut from `main` at `62f37fe` and rebased onto `cc2c1da` before the push, held the record, this document, and the backlog and roadmap entries (FB-110, FB-111, D-11). It became PR 93, merged 2026-11-13, and was deleted afterwards. `docs/WHERE-WE-ARE.md`, `docs/WHERE-WE-ARE-GOING.md` and the roadmap's WS-12, sequence and backlog table were brought up to date the same day, with the Forge review's findings (record §4a).
- The owner's claude.ai project "forge" holds a copy of the record as `claude/process-control-framework-decisions.md`. The file in the repository is the authority.
- The Jiminy check was skipped for these documents on the owner's instruction (ground rule 10).
- Nothing else in the repository was changed.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| PC-L1, PC-L2, PC-L3 | The framework's three layers: PID in the PLC; MPC/APC plus the supervisory mechanisms; SME agents. Not the reference architecture's L1–L5 and not ISA-95 levels. |
| PV, SP, MV, DV | The variable being controlled, its target, what the controller moves, a disturbance variable. Roles relative to a controller: a PC-L2 MV can be a PC-L1 PID's SP. |
| MPC control mode | The state of a loop in which PC-L2 has authority over it (L2-3). |
| Heartbeat | The PLC–MPC liveness signal. PC-L2's authority holds only while it is active and good. |
| Shed | A loop leaving MPC mode and returning to PID, by bad heartbeat, PLC logic or operator take-over. |
| Baseline gains | Validated PID gains stored in the PLC, restored on a shed (L2-5). |
| MPC Supervisor module | The Forge module that is all of PC-L2 (M-3). |
| MPC deployment | An instance near a PLC that runs the control cycle and the supervisory mechanisms, attached to a local hub (L2-11). |
| Local hub | The area or site hub a deployment attaches to. |
| Self-improvement category | Model parameters, controller tuning, model structure, operating limits (L2-10). |
| Action type | What PC-L3 may do: set PC-L2 targets, change limits and priorities, create or reconfigure controllers, request schedule changes (L3-4). |
| Off, Propose, Autonomous | The three states of a category or action type (AU-1). |
| Confidence signals | Prediction accuracy, outcome of promoted changes, human agreement rate, shadow-run performance (AU-4). |
| Hold period | The duration and minimum count for which the thresholds must be met (AU-6). |
| Performance guard | A user-set limit; a live result worse than it triggers a rollback (AU-15). |
| Rollout profile | The versioned, per-site or per-area settings of PC-L3's action types (L3-4). |
| Goal spec | The structured definition of a PC-L3 optimization goal (L3-10). |
| SME agent | A PC-L3 agent: a language model trained on an area's process knowledge that takes every number from deterministic tools (L3-2). |
| Take-over tag | The PLC tag by which a person pulls a loop out of MPC mode, operable from the plant's own HMI (UI-1). |
| PLC contract | The vendor-neutral interface between PC-L2 and a PLC (L1-8). |
