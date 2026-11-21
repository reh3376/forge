# forge-display — design record

**Status:** approved by reh3376 on 2026-11-20 (the owner answered Q-1 to Q-17 one at a time on 2026-11-19 and 20 and declared the answers the signature, with the five proposals of §5 confirmed; the status line was set on that word). The three points that were provisional until the spike of Q-17 were made final by the owner on 2026-11-20 with its measurements (§6). · **Backlog:** FB-143 (with FB-176 to FB-185) · **Roadmap:** decisions A-3, A-14, A-19, D-16
**Participants:** reh3376 (owner, decides and signs), Claude (surveys, asks, records, proposes)

Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code, a signed record or a cited source says, with where) or **[PROPOSED]** (Claude's recommendation, not approved).

---

## 1. What is already decided

- **[OWNER]** A-3: all user interfaces come from forge-display; modules describe (FVTS), forge-display renders.
- **[OWNER]** A-14 (2026-11-17): "the first fully functioning forge module that we must build is the forge-display module. It will be used to build the frontend of the entire forge platform to include the hub UI, therefore it must exist before any other module can be completed."
- **[OWNER]** A-19 (2026-11-18): Forge is a dynamic framework; every installation is built out in the forge designer, with tools and widgets each governed by an FxTS spec.
- **[OWNER]** D-13 (2026-11-18): forge-display has a design mode beside its run mode; the integration designer is one design-mode editor; the designer "will look and function similar to the Ignition perspective designer with aspects similar to node red"; drag and drop and scripting; scripts are Python, sandboxed.
- **[OWNER]** D-4 (2026-11-03, `docs/FxTS/FVTS.md` "Decisions"): four render profiles (desktop_hmi 20 Hz with writes, desktop_app 10 Hz, web 4 Hz, mobile 1 Hz); only desktop_hmi writes tags; proto messages over the Connect protocol for browsers and Go alike, with no WebSocket or SSE side path; the configured-screen format is a follow-on spec.
- **[OWNER]** A-2: modules are Go, with Python scripting for customization.
- **[OWNER]** 2026-11-19, FB-143 Q-1: **forge-display is a Go module plus one web client.** The one client runs on all four profiles: in a browser, in a locked-down kiosk browser for the control room, and wrapped as an installable app for desktop and mobile. The designer is the same client in design mode.

## 2. What exists today (surveyed 2026-11-19)

- **[FACT]** The FVTS framework: schema 0.1.0 (approved), a runner (20 checks), the render-profile baseline (`src/forge/governance/fvts/profiles.py`), a reference renderer in Python that the golden messages are checked against (`renderer.py`), and one spec, `forge-ot.fvts.json` (four surfaces: an HMI screen, a trend, an alarm summary, settings), awaiting approval (FB-078).
- **[FACT]** No forge-display code. The hub has no FVTS spec of its own. The design tokens the specs reference (`forge://design/tokens/v1`) do not exist as a file.
- **[FACT]** The Go tree has models, generated bindings and a 112-line scaffold; `connect-go` is already a dependency (`go/buf.gen.yaml`).
- **[FACT]** The only user interface in the repository is the interim MES bridge's Next.js frontend (React 18), which is retired when forge-display exists.

## 3. The client technology: why this is an inflection point

**[OWNER]** 2026-11-19, on what the web client is written in: "Lets think this thru before we decide, this is an inflection point. Once we choice we will need to commit to it and if we choose poorly it will create excessive technical debt in the future, so spending the time to front load the decision is worth the effort."

### 3.1 What the client must do, from the signed records

| # | Requirement | From |
|---|---|---|
| C-1 | Render a screen from data (a configured-screen spec), not from compiled pages: an installation builds its own screens | A-19, D-4 item 7 |
| C-2 | Hold hundreds of live values on a control-room screen at up to 20 updates a second, with staleness and quality always shown | D-4, FVTS profiles |
| C-3 | A screen designer: a canvas, drag and drop, a property editor, binding to data | D-13 |
| C-4 | A flow editor: blocks wired into flows | D-13 |
| C-5 | A script editor for Python | D-13 |
| C-6 | Run with no internet: every file served by the site's own forge-display, nothing fetched from outside | plants run without a WAN (P-10) |
| C-7 | Last as long as a plant system does, ten to twenty years, on a dependency set that can be locked, scanned and rebuilt | the owner's debt rule; the repository's supply-chain rules |
| C-8 | Reach the hub's data over Connect only | D-4 item 6 |
| C-9 | Every widget governed by an FxTS spec | A-19 |
| C-10 | The same safety behaviour on every profile, because the core enforces it and the client only presents it | A-7, FVTS |

### 3.2 Facts checked on 2026-11-19

- **[FACT]** Ignition Perspective, the product the owner named as the model for the designer, builds its components in React with MobX (the vendor's forum on component development: a component registered with Perspective must be a MobX observer).
- **[FACT]** The team that maintains the most widely used node-and-wire editor library maintains it for two frameworks, React (React Flow) and Svelte (Svelte Flow), both MIT-licensed and both released in 2026.
- **[FACT]** Node-RED, the product the owner named as the model for flows, released version 5.0 in June 2026 with a redesigned editor and did not rewrite it: its roadmap calls the approach "evolution not revolution". Its editor is still built on the libraries it started with. An editor of this kind outlives several generations of frontend frameworks.
- **[FACT]** The Connect protocol in a browser supports unary calls and server streaming, and not client or two-way streaming (browsers do not offer it). Streaming needs HTTP/2 from end to end, which rules out some reverse proxies in front of forge-display. Connect server streaming does not work in React Native.
- **[FACT]** Wails, the Go toolkit for wrapping a web client as a desktop application, was moving from beta to a stable version 3 during 2026; sources disagree on whether the stable release is out.

### 3.2a A second model: Grafana (the owner, 2026-11-19)

**[OWNER]** "I know I originally mentioned Ignition as the base model, mostly because it has a gateway for full system configuration and administration as well as the designer. Forge will need both as well and a strong python scripting tool, but there may be a better example. Grafana is the closest structural precedent. It pairs a Go backend with a TypeScript/React frontend, ships as one binary that serves the web UI, and generates its dashboard TypeScript types from schemas."

So there are two models, for two different things: **Ignition for scope** (a gateway for configuration and administration, a designer, strong Python scripting) and **Grafana for structure** (a Go backend, a TypeScript and React client, types generated from schemas). Checked on 2026-11-19:

- **[FACT]** Grafana is schema-first: its dashboards are defined in schemas and both the Go and the TypeScript types are generated from them. Its generator accepts JSON Schema as well as its own schema language, and its documentation counts a schema as mature only when the generated types have replaced every handwritten one.
- **[FACT]** Its rule for change is the one D-14 already sets for Forge: a breaking change is a new version, and a stable version is never modified in place.
- **[FACT]** A dashboard is data with a schema version, migrated forward when it is loaded. Two things went less well. Versions older than a floor can no longer be migrated at all. And the move to the second dashboard schema is automatic and one-way: once converted a dashboard cannot be converted back, and users on its forum report regretting it.
- **[FACT]** Grafana's own move from its first frontend framework to React took about three years from deprecation to removal (2022 to 2025) and slipped by two major versions, because its panel plugins were written directly against the framework and each had to be rewritten.
- **[FACT]** Its live data (examples in its documentation run at 20 updates a second) travels over one WebSocket per page, with every subscription multiplexed in it. That differs from D-4, which chose Connect and no WebSocket.
- **[FACT]** Not confirmed: that the frontend is inside the binary. The packaging found (older versions) ships the built frontend as a directory beside the server binary, which serves it. For Forge the Go toolchain can embed the files in the binary itself.
- **[FACT]** Grafana has no Python scripting; that part of the model remains Ignition's.

What this changes:

- **[PROPOSED]** React and TypeScript for layer 3 now has two precedents in this exact shape (Perspective and Grafana), one of them with a Go backend and more than ten years in production. The comparison of two frameworks in the spike is no longer needed.
- **[PROPOSED]** Forge already has what Grafana's schema-first approach needs: versioned, hashed JSON schemas (FB-151). The Go and TypeScript types of the screen, flow and widget formats are generated from them, and no handwritten copy exists.
- **[PROPOSED]** Grafana's framework migration is the strongest evidence for §3.4: what an installation builds, and the widget contract, must not be written against the framework.
- **[PROPOSED]** From the dashboard history: a screen saved in an older version of the format is migrated by an explicit, recorded step (`forge governance migrate-spec` exists for specs), never silently on load, and never one-way without the earlier version being kept.
- **[PROPOSED]** Administration, the designer and the run-time screens are one client, as in both models: the hub's own screens (the "gateway") are FVTS surfaces like any module's.
- **[PROPOSED]** Structure and ideas are taken from Grafana, not code. Its licence terms are checked before any of its packages is used.

### 3.2b Each module carries its own schema (the owner, 2026-11-19)

**[OWNER]** "The Schema-first is confirmed. Dashboards are defined in schemas portion of Grafana fits well for us. The modules forge-mes, forge-ot, forge-wms, etc ... will carry the schema specific to that module that our forge-display module will use when creating UI specific to a given module."

- **[FACT]** This is the rule FVTS already states ("modules describe, forge-display renders"), and a module's FMTS spec already references its FVTS specs (`references.fvts`). Today one module has one (`forge-ot.fvts.json`).
- **[PROPOSED]** So forge-display holds nothing that is specific to a module. What it knows about forge-mes or forge-wms it reads from what that module carries, and a module added to a hub brings its own screens' raw material with it.

### 3.2c The owner's architecture recommendation, mapped onto the repository (2026-11-19)

The owner wrote a recommendation for forge-display's frontend on 2026-11-19 and gave it as context for this record. It was written without reading the repository, and its first open item is to map it onto the actual layout. That mapping is this section. The document itself is the owner's and is not part of the repository.

**[OWNER]** Its recommendation: "No Go frontend library is mature enough for a designer-class application, so forge-display should not be built on one. Keep Go for the display server and write the browser client in TypeScript and React. A versioned JSON view schema is the contract between the two."

**Where it agrees with what is signed or already answered here:**

| The recommendation | In the repository |
|---|---|
| Go display server, TypeScript and React client | Q-1 and Q-2 of this record |
| A versioned JSON view schema as the first FxTS artifact; Go and TypeScript types generated from it | D-4 item 7 (the configured-screen format is a follow-on spec); the schema version rules of D-14; §3.2a |
| One renderer, two modes: the designer is the runtime renderer plus overlays, a property editor and a palette | D-13, B-8 |
| Assets embedded in the Go binary, no CDN, works air-gapped | requirement C-6 |
| Every bound value carries a quality and a timestamp; stale data is shown as stale | FVTS (`mark_all_stale`, staleness per point); one clock |
| View documents are stored through the hub | A-6: the hub owns the databases |
| Plain DOM and SVG, not a custom canvas renderer | consistent with ISA-101 screens of some hundreds of components |
| Vite, not Next.js: no second server process to keep available | the interim bridge's Next.js frontend is retired anyway |
| Plain bindings and simple expressions resolve without a script call | the FVTS points and the 20 Hz profile |

**Where it differs from a signed decision, or raises something no record settles.** Each is a question in §5:

| # | The recommendation | What is signed today |
|---|---|---|
| X-1 | A WebSocket for the live session, because browsers cannot stream from the client | D-4 item 6: Connect only, "no WebSocket or SSE side path" |
| X-2 | Full PyPI for scripts, one locked environment per project, in CPython worker processes | D-13 B-4: scripts are sandboxed and reach only the Forge scripting API; B-3: no code from outside Forge is loaded |
| X-3 | Several stateless display nodes behind a load balancer | D-15 T-4: one session per module id; a second one is refused |
| X-4 | templ + HTMX "remains a reasonable choice" for settings and admin pages | A-3 and Q-1: one client; settings forms are generated from the module's schema |
| X-5 | The Python workers described as forge-display's sidecar | A-2: every Go module has Python scripting for customization, so the worker pool belongs to the module SDK, not to one module |
| X-6 | The display server "manages sessions, permissions and tag subscriptions" | A-7: the core decides what a user may do; forge-display presents it |
| X-7 | Components wrapped in error boundaries (a React feature) | Q-4 of this record, open: whether widgets are React components or Web Components |
| X-8 | Wails for desktop; its mobile support is experimental | the mobile render profile needs another wrapper |
| X-9 | "Latest Python" is 3.15 | the hub requires Python 3.12 or newer and is locked on what `uv.lock` holds |

Its own open items are also questions here: the client state library and the designer canvas approach; whether simple binding expressions get a small expression language; where view documents are stored and versioned.

### 3.3 What follows from the facts

- **[PROPOSED]** Live values fit Connect as it is: one server stream per screen for values and alarms, unary calls for writes and acknowledgements. D-4's "no WebSocket side path" holds. The proxy constraint goes into the deployment requirement.
- **[PROPOSED]** The mobile profile is the web client wrapped, not a React Native application: React Native cannot carry the stream.
- **[PROPOSED]** The desktop and kiosk shell is not chosen now. The client is a web client either way, and the shell is a thin wrapper that can be chosen when the first control-room screen exists.

### 3.4 Where the lock-in really is

*Sections 3.4 to 3.6 are Claude's analysis as first put to the owner, kept as the record of how the decision was reached. Where an answer in §4 differs, the answer stands: widgets are React components, not Web Components (Q-10), and the spike is the one of Q-17, not the two-framework comparison of §3.6.*

The framework is the visible choice, but it is not where most of the debt would come from. Three things are far harder to change later, and all three are Forge's own:

1. **The formats**: the configured-screen spec, the flow spec, the widget spec. Every installation's work is stored in them.
2. **The widget contract**: what a widget is given (its properties, its bound values with quality and staleness, its actions) and what it may do.
3. **The wire**: the Connect messages for subscription, history and actions.

**[PROPOSED]** So the design should make the framework the cheapest part to replace, in three layers:

| Layer | What it is | Depends on a framework? |
|---|---|---|
| 1. Contract | The three formats and the wire messages; TypeScript types generated from the proto files and the JSON schemas | no |
| 2. Render core | The Connect client, the store of live values, staleness and quality rules, the action and write flow, and the widgets themselves as **Web Components** (custom elements, a browser standard) | no |
| 3. Shell and designer | Navigation, panels, the canvas editor, the flow editor, the script editor | yes |

- A widget written as a custom element runs in any shell, today's or a later one. The fast path (a value arriving and being drawn) never passes through a framework.
- The conformance tests (the FVTS golden messages) run against layers 1 and 2, so the part that carries the safety-relevant presentation is tested without a framework.
- Only layer 3 is written in the framework, and layer 3 is where the framework's ready-made editors save the most work.

With this split the framework decision still matters, but replacing it later means rewriting the shell, not the widgets, the formats or anything an installation has built.

### 3.5 The candidates for layer 3

| | React | Svelte | Vue | Web Components only (Lit) |
|---|---|---|---|---|
| Canvas and drag-and-drop editors | many, mature | fewer | some | few |
| Node-and-wire editor | React Flow | Svelte Flow (same team) | a community port | none of weight |
| Code editor for scripts | framework-neutral (works with all) | same | same | same |
| Speed on the 20 Hz path | does not matter if layer 2 bypasses it | same | same | same |
| Size of the output | largest | smallest | middle | smallest |
| Likely to be maintained in 15 years | most likely | uncertain; three breaking generations so far | likely | a browser standard, but Lit itself is a library |
| Evidence in this field | Perspective is built on it | none known | none known | none known |
| Dependency tree to lock and scan | largest | small | middle | smallest |
| Already in the repository | yes (the interim bridge) | no | no | no |

### 3.6 What would settle it

**[PROPOSED]** A spike before the signature, small and thrown away afterwards, measured on the hardware a control room would use:

1. One HMI screen from the existing `forge-ot.fvts.json` golden messages, with 500 live values at 20 Hz, as custom elements with no framework. Measure frame time, memory over an hour, and behaviour on reconnect.
2. The same small designer in two shells (React, Svelte): place three widgets on a canvas, bind one, wire a three-block flow, edit a script. Measure how much was written by hand, the size of the output, and the number of dependencies.
3. The same client opened in a kiosk browser and wrapped for a phone.

The spike answers C-2, C-3 and C-4 with numbers instead of opinion, and it tests the three-layer split itself, which matters more than the framework.

## 4. Questions and answers

| # | Question | Answer |
|---|---|---|
| Q-1 | The overall shape of forge-display. | **Answered 2026-11-19: a Go module plus one web client.** Debt check: one renderer to build and test, not three; the module requirements apply to the Go part as to any module. |
| Q-2 | What the web client is written in. | **Answered 2026-11-19, after the analysis of §3: React and TypeScript, with the neutral core.** The client is TypeScript; the shell and the designer are React; the formats (screen, flow, widget), the generated types, the wire client, the live-value handling and the widget contract are independent of React and are tested without it. This is the one exception to A-2: the Go part is the module, the client is what it serves. Debt check: a later change of framework rewrites the shell and nothing an installation has built, which is the cost Grafana paid for three years. |
| Q-3 | What a module carries for forge-display. | **Answered 2026-11-19: both its view spec and its object schemas.** A module carries its FVTS spec as today, plus versioned JSON schemas of its own objects and settings. forge-display generates forms, tables and detail pages from them, and the designer offers each object's fields for binding. Debt check: a new field in a module's schema appears in its screens without forge-display changing; the object schemas come under the schema version rules of D-14 and the one schema registry of D-10, so no second registry appears. |
| Q-4 | The browser's live session: a WebSocket (the owner's recommendation, X-1) or Connect only (D-4). | **Answered 2026-11-19: Connect, with a spike before it is final.** One Connect stream down per screen for values and alarms; ordinary Connect calls up for subscribing, writing and acknowledging. The spike measures it on the 20 Hz screen: the latency of a subscription change, behaviour through a proxy, reconnect. If it falls short the WebSocket question returns to the owner with numbers. Debt check: D-4 item 6 stands unless measurement says otherwise; nothing is built on an unmeasured assumption. |
| Q-5 | What a Python script may use (X-2, X-5). | **Answered 2026-11-19: approved packages per hub.** Scripts run in supervised CPython worker processes (the owner's process model, adopted for every module, so it belongs to the module SDK): timeouts, cancellation, restart, workers stateless. Beyond the standard library and the Forge scripting API a script imports only packages on that hub's approved list: a governed list, hashed and approved by a hub admin, with a locked environment built from a local mirror so it works air-gapped. A worker has no network, no credentials and no files except what the Forge API hands it. The owner on the document this came from: "these are just ideas, I am not saying it needs to be the way I wrote it, I am open to discussion and I encourage you to question my choices." Debt check: this amends D-13 B-3 and B-4 ("no code from outside Forge", "the Forge API only") to "nothing a hub admin has not approved"; process isolation replaces the in-process import allow-list of today's sandbox, which is not a security boundary. |
| Q-6 | May more than one server process of a module run at once (X-3). | **Answered 2026-11-19: declared per module.** The owner first gave this context: "There will certainly be multiple instances of UIs running against a given hub. For example an area hub that is used to run all distillation processes for a distillery. There will be multiple instances of the forge-ot HMI/SCADA UI running. Lets say one instance for each of the control rooms, plus a lab tech, and a supervisor monitoring. If there are 3 control rooms that is 5 instances in the area running just the HMI/SCADA screens for the forge-ot module." Three things are kept apart: **UI clients** (any number; each a user's session with its own sign-in, roles and render profile; not module instances), **forge-display server instances** (what this question decides) and **forge-ot instances** (one, because it holds the controller connections). T-4 is amended: a session belongs to an instance, identified by the module id plus an instance id; a module's spec declares whether more than one instance may run (default no); forge-display says yes; a second instance of a module that says no is refused and recorded as a restart, as signed. Debt check: decided while nothing of the transport is built; the next module that needs several instances needs no new exception. |
| Q-7 | With several control-room clients that may write to the same process, whether the core tracks which one has control. | **Answered 2026-11-19: no; roles decide.** The owner's words: "No any running instance with the correct permissions can make changes to any portion of the process. For example an operator in the Granary control room can make changes to the Distillation columns set points or open and closed valves manually. That is why we need the activity chain to determine who did what if an operator is malicious and opens or changes things they shouldnt a record is create that will trace back to those actions. You will likely push back on this but it is how effective teams operate on the factory floor and it keeps operators mobile. They can carry a tablet or laptop around and still monitor and control processes if they need to leave the control room for any reason." Debt check: no station-in-control concept to build or maintain. **[FACT]** the record of who did what depends on a personal sign-in and on roles the core enforces; the hub's authentication is off by default and scoped roles are not enforced (FB-075), so the role model is a prerequisite of the first screen that can write. |
| Q-8 | How a carried tablet or laptop gets control, given that D-4 item 3 lets only the control-room profile write. | **Answered 2026-11-19: write authority follows the user's role, on any profile.** D-4 item 3 is amended: every profile may write; the user's role for that area and tag, enforced by the core, decides. Profiles keep what is about the device (update rate, layout, confirmation style). A site may switch writes off for a profile as a per-site setting. The same chain and audit apply everywhere, and the audit records the profile each write came from. Debt check: D-4 recorded that write authority is data in the profile baseline, so this is the profile change it foresaw; the FVTS schema's rule that only `desktop_hmi` actions write tags changes with it, as a new schema version. |
| Q-9 | How the configuration and administration screens (the "gateway") are built (X-4). | **Answered 2026-11-19: one client; the command line is the fallback.** Configuration and administration are ordinary screens of the one client, generated from the hub's and the modules' view specs and schemas. When forge-display is down the `forge` command line is the way in, and it must be able to do everything needed to bring the system back. No second UI technology. Debt check: one way to build, test and style screens; the command line gains a stated duty, to be checked when the hub's screens are specified. |
| Q-10 | How widgets are implemented (X-7). | **Answered 2026-11-19: React components behind a neutral contract.** Each widget is a React component that receives only what its FxTS-governed widget spec defines (properties, bound values with quality and time, actions) and is wrapped in an error boundary. The live-value store is outside React and updates one widget when one tag changes. Claude first proposed Web Components and withdrew it: Grafana's migration cost came from third-party plugins, while Forge alone writes its widgets (A-19, D-13 B-11 and B-12), and what an installation builds is view documents in Forge's own versioned schema. Debt check: if React is ever replaced Forge rewrites a bounded set of its own widgets; nothing an installation built changes. |
| Q-11 | The path from a browser to the data, and who decides what a user may do (X-6). | **Answered 2026-11-19: browser to forge-display to hub; the core decides.** One forge-display per hub, because each hub has its own roles. A browser reaches only forge-display. forge-display reaches data, history and writes only through its session with its hub, carrying the user's signed identity. Every permission is decided by the core and returned with its reason; forge-display hides or disables what the core refuses and always shows a refused action with its cause. Debt check: the hub is reachable only by modules (A-1), and no path to a controller exists that the core did not check (A-7). |
| Q-12 | The view document and where it lives. | **Answered 2026-11-19: its own framework; files for Forge, the hub database for sites.** A view document is a versioned JSON document: component tree, properties, bindings, event handlers, script references. Forge's standard screens are files in the repository, hashed and approved by the owner. An installation's screens are stored in its hub's database, each saved change a new version with a hash, approved by that hub's approver, promoted and rolled back like an integration flow (D-13 B-9), and exportable as files. Debt check: a saved screen is migrated to a later schema version by an explicit, recorded step that keeps the earlier version, never silently on load (§3.2a). |
| Q-13 | The new framework's name and scope. | **Answered 2026-11-20: one framework, FUTS (Forge UI Test Specification), for view documents and widget specs.** Two kinds of spec in one framework; a view document is checked against the widget specs of the widgets it uses. The flow spec stays with the integration builder's own framework. Debt check: FUTS meets the ten baseline requirements of D-14 from its first spec, and its Go and TypeScript types are generated from its schemas. |
| Q-14 | Expressions in bindings (an open item of the owner's recommendation). | **Answered 2026-11-20: an existing standard, CEL (the Common Expression Language), confirmed in the spike.** Plain bindings resolve directly; simple expressions (scale, compare, choose a label or a colour) are CEL, evaluated in the browser and identically by the Go server when it checks a view document; Python handles event handlers and explicit transforms and is never on the path of a live value. The spike confirms the TypeScript implementation before it is final. Debt check: no grammar, evaluator pair or language documentation of Forge's own to maintain. |
| Q-15 | The hub's own screens, the first thing forge-display renders. | **Answered 2026-11-20: all four.** Status and health; modules (each module and its instances: state, version, clock offset, refusals with their cause, data classes, waivers); governance (every spec, schema version and governed list with its state and hash, what awaits approval, a run of a framework's checks); users and roles. The hub gets its own view spec and object schemas like any module. Debt check: users and roles needs the role model in force (FB-075), which Q-7 already makes a prerequisite of anything that writes, so FB-075 comes before the first screens. |
| Q-16 | The order of building; this also redoes the roadmap's old sequence. | **Answered 2026-11-20: this order.** (1) The FUTS schemas for view documents and widgets, with the hub's own view spec and object schemas. (2) The spike. (3) The role model in force on the hub (FB-075). (4) The Go module SDK with the parts of the transport contract forge-display needs, and the view service messages. (5) The forge-display server and runtime renderer with a few widgets: the four hub screens first, then forge-ot's HMI screens on live data. (6) The Python worker pool, in the SDK. (7) The designer. (8) The management modules in Go, forge-mes first, then the integration builder. Debt check: it follows the owner's own order (schema, runtime renderer, Python, designer) and replaces the forge-mes-first sequence of the roadmap and of `forge-mes-go.md` §6. |
| Q-17 | The spike, and the owner's rule that nothing is installed without confirmation. | **Answered 2026-11-20: in a scratch folder outside the repository.** The owner approves installing the spike's packages there. Nothing from it is committed and no manifest or lock file of the repository changes. The measurements and the list of packages each option pulled in come back to the owner; the code is discarded. It settles three points that are provisional until then: Connect only for the live session (Q-4), CEL (Q-14), and the client state library and the designer canvas approach, which the owner's recommendation left open. |

## 5. Confirmed with the signature

Five points from the owner's recommendation, written as proposals and confirmed by the owner with the signature. All are **[OWNER]**.

| # | Point |
|---|---|
| P-1 | Scripts run only in the server-side Python workers. Pure screen state (which tab is open, what is selected) stays in the browser with no round trip. |
| P-2 | Workers run the CPython version Forge supports and pins for each release, not "latest" as such. |
| P-3 | The client is built with Vite and embedded in the Go binary. No CDN and no Next.js. |
| P-4 | The desktop and kiosk shell and the mobile wrapper are chosen when the first control-room screen exists. The mobile profile is the web client wrapped, not a separate native application. |
| P-5 | Structure and ideas are taken from Grafana and Ignition, not code. A licence check precedes the use of any package from either. |

## 6. The spike, and what it made final (2026-11-20)

Run on 2026-11-20 in a scratch folder outside the repository, with the owner's approval to install its packages there (Q-17). Nothing from it is in the repository; the code is discarded. All of §6.1 is **[FACT]**: measured, on the conditions stated.

### 6.1 What was measured

**Conditions.** The owner's Apple-silicon Mac, headless Chrome at 1920 by 1080, a Go server streaming over Connect. The worst case throughout: every widget's value changes on every update, 20 times a second. "Slower" is Chrome's processor throttling at six times. Not measured: real control-room hardware, a real reverse proxy, a phone wrapper. The longest run was ten minutes, not the hour first proposed.

| Case | Frames a second | Value-to-screen delay, 95th percentile |
|---|---|---|
| 500 widgets | 60 | 6 to 18 ms |
| 500 widgets, slower | 57 to 60 | 12 to 18 ms |
| 500 widgets, slower, expressions on (20,000 evaluations a second) | 56 to 60 | 15 to 16 ms |
| 2,000 widgets | 59 to 60 | 8 to 13 ms |
| 2,000 widgets, slower, every update applied | 7 to 9 | 240 to 620 ms, growing |
| 2,000 widgets, slower, the newest value once per frame | 7 | 60 to 65 ms, bounded |
| 500 widgets for ten minutes, expressions on, TLS and HTTP/2 | 60, no frame over 50 ms | 19 ms; memory between 8 and 24 MB, no growth |

- A subscription change (an ordinary call, until the first value of the new point arrives on the stream): about 50 ms, 95 ms when slower.
- A stream dropped by the server: values flowing again in 305 to 308 ms, four of four.
- A widget that throws: it alone shows an error; the other 499 keep 60 frames a second.
- **Plain HTTP/1.1: of nine screens in one browser, six receive values**, the browser's limit of six connections to one origin, each stream holding one. With six streams open, an ordinary call from one of those screens got no answer in five seconds. **TLS with HTTP/2: nine of nine and thirty of thirty receive values, and a call is answered in 26 to 49 ms.**
- **CEL**: fifteen expressions with the same inputs gave the same result in the browser (`@bufbuild/cel` 0.6.2) and in Go (`cel.dev/cel-go` 0.33.4), fifteen of fifteen. Go rejects an invalid expression when it is compiled; the browser library reports it only when it is evaluated. The browser library is before version 1.0.
- **Four ways of holding live values** (a store of about ten lines on React's own hook for external stores; zustand; jotai; MobX) were equal within noise at every load. They add nothing, about 0.5 kB, 3 kB and 18 kB compressed, and none has dependencies of its own.
- **A designer test** of 66 lines: a hand-written drawing area (select, drag, resize, a property editor, a binding with an expression) and a three-block flow on the xyflow library; one render function drew a widget in both modes; the result was a plain data document. It was a toy: it shows the approach works, not what a usable designer costs.
- **Size**: the run-time client with React, Connect, CEL and all four stores was 129 kB compressed; the designer added 86 kB, loaded only in design mode. Every licence was MIT or Apache-2.0.

### 6.2 What the owner made final

| # | Point | Answer |
|---|---|---|
| S-1 | The live session (Q-4). | **Final 2026-11-20: Connect only, with two conditions that are now requirements.** forge-display is always served over TLS with HTTP/2, in development too: without it a seventh screen gets no values and a write can hang. The client core keeps only the newest value of each point and applies them once per frame, so an overloaded client's delay stays bounded. The WebSocket question is closed. |
| S-2 | Expressions (Q-14). | **Final 2026-11-20: CEL, checked by Go, pinned and wrapped.** The Go server compiles and type-checks every expression when a view document is saved or loaded and refuses a document with a bad one, so the browser evaluates only what Go accepted. The browser library is pinned to an exact version, used through one function of the core, and a test holds the browser and Go to the same results. The owner's words: "I am not concerned about how it runs on a slow computer, forge will run on a server with all the resources it needs. Users computer resources will not be overly relevant as long as they can run a browser". **[FACT]** the screen is drawn, and expressions evaluated, in the browser on the user's device, not on the server; the measurements support the owner's conclusion for ordinary screens (500 widgets all changing held 57 to 60 frames a second at one sixth of the processor), and a very large screen on a weak tablet is the case to watch. |
| S-3 | Where live values are kept in the browser. | **Final 2026-11-20: Forge writes it.** About ten lines in the React-free core; no outside library on the path a live value takes. |
| S-4 | The designer's drawing area. | **Final 2026-11-20: Forge owns it; focused libraries case by case.** The owner asked for the cons before deciding. For: design and run cannot drift apart, the saved screen stays in Forge's format, no dependency on the part users touch most. Against: months of work, not days (several widgets selected at once, alignment guides, undo and redo, copy and paste, zoom, touch); edge cases mature libraries already solved; Forge's to maintain. Decided: the drawing area and the saved format are Forge's own; a small library may be used for one specific hard interaction, behind Forge's own code so that it never appears in a saved screen, each confirmed with the owner before it is installed. |
| S-5 | The flow editor. | **Final 2026-11-20: use the flow library** (xyflow, MIT). The saved flow is Forge's own governed format (D-13, B-2), so the library only draws it; it is loaded only in design mode and is installed, with the owner's confirmation, when the integration builder is built. |

### 6.3 Raised by the spike, not decided

- **How a screen adapts to its device.** The spike placed widgets at fixed positions, which suits a control room and not a phone. **[OWNER]** Answered 2026-11-20, with the FUTS schema (FB-176): **container kinds, mixed freely.** A screen is built from containers and each has a kind: fixed positions, reflowing, or one that switches between arrangements by device width. The kinds are a governed list, so more can be added without changing saved screens.
- **Alarm operations by profile.** The render-profile table also limited alarm operations by device: only the control-room profile could shelve, unshelve, disable, enable or reset; the others could only acknowledge. Q-8 was about tag writes. **[OWNER]** Answered 2026-11-21 (FB-178): **the role decides, on every profile.** A site may switch alarm operations off for a profile, as it can for writes.
- **Collections in the view contract.** **[FACT]** The view contract could describe only points (single live values); the hub's four screens and every management module's screens are collections. **[OWNER]** Answered 2026-11-21 (FB-177): **an objects section beside points.** A module declares each collection with the schema of one item, how the list is kept current (on request, or pushed), and the actions on it under the same role, confirmation and audit rules as any action; a surface lists the points and objects it shows.
- **The first widgets.** **[OWNER]** Answered 2026-11-20 (FB-176): **these twelve.** For any screen: text label, value display, status indicator, table, button, input field, link to another screen. For plant-floor screens: bar or level, two-state symbol, trend chart, alarm list, alarm banner. Each gets a widget spec; more are added later as new specs.
- **The measurements are from one machine.** Real control-room hardware and a real reverse proxy are measured with the first control-room screen (FB-181).

## 7. The design in one table

| # | Decision | From |
|---|---|---|
| DS-1 | forge-display is a Go module plus one web client. One client for run mode, design mode, and the hub's configuration and administration screens. | Q-1, Q-9 |
| DS-2 | The client is TypeScript; the shell and the designer are React. The formats, the generated types, the wire client, the live-value store and the widget contract do not depend on React. | Q-2 |
| DS-3 | Schema-first: every module carries its view spec (FVTS) and versioned JSON schemas of its objects and settings; forge-display generates forms, tables and detail pages from them and holds nothing specific to a module. Go and TypeScript types are generated from the schemas, never written by hand. | Q-3, §3.2a |
| DS-4 | FUTS, a new framework with two kinds of spec: the view document (component tree, properties, bindings, event handlers, script references) and the widget spec. | Q-12, Q-13 |
| DS-5 | Forge's standard screens are files in the repository; an installation's screens are in its hub's database, versioned, hashed, approved on that hub, exportable. Migration to a later schema version is explicit and keeps the earlier version. | Q-12 |
| DS-6 | Widgets are React components written by Forge, each given only what its widget spec defines and wrapped in an error boundary. | Q-10 |
| DS-7 | A browser reaches only forge-display; forge-display reaches everything through its hub session, carrying the user's identity; the core decides every permission. One forge-display per hub. | Q-11 |
| DS-8 | Any number of UI clients. Whether a module may run as more than one server instance is declared in its spec: forge-display yes, forge-ot no. | Q-6 |
| DS-9 | Any client whose user has the role may write, on any render profile; the activity chain records who did what, from which profile. No station-in-control. A site may switch writes off for a profile. | Q-7, Q-8 |
| DS-10 | Values and alarms come down one Connect stream per screen; subscribing, writing and acknowledging are ordinary Connect calls. Always over TLS with HTTP/2. The client core keeps the newest value of each point and applies them once per frame. | Q-4, S-1 |
| DS-11 | Bindings: direct, or a CEL expression that the Go server has compiled and type-checked and the browser evaluates; Python never on the path of a live value. | Q-14, S-2 |
| DS-15 | The live-value store and the designer's drawing area are Forge's own code; the flow editor uses a library; any other library for one hard interaction is confirmed with the owner first. | S-3, S-4, S-5 |
| DS-12 | Python scripting for every module: supervised CPython worker processes in the module SDK; the standard library, the Forge scripting API, and the packages a hub admin has approved for that hub; no network, no credentials. | Q-5 |
| DS-13 | The hub's first screens: status and health, modules, governance, users and roles. The hub gets its own view spec and object schemas. | Q-15 |
| DS-14 | When forge-display is down the `forge` command line is the way in. | Q-9 |

## 8. What this changes in records already signed

Each change is the owner's, made by the answer named, and is written into the record it changes as a dated statement.

| Record | Was | Now | By |
|---|---|---|---|
| D-4, item 3 (`docs/FxTS/FVTS.md`) | only the `desktop_hmi` profile writes tags | every profile may write; the user's role decides; a site may switch writes off for a profile | Q-8 |
| D-4, item 6 | Connect, no WebSocket side path | unchanged, confirmed by measurement, with TLS and HTTP/2 required | Q-4, S-1 |
| D-13, B-3 and B-4 (`integration-module-builder.md`) | no code from outside Forge is loaded; a script reaches only the Forge scripting API; an in-process sandbox | nothing a hub admin has not approved is loaded; the Forge API, the standard library and that hub's approved packages; isolation by worker processes | Q-5 |
| D-15, T-4 (`transport-contract.md`) | one session per module id | a session belongs to an instance (module id plus instance id); a module's spec declares whether more than one instance may run | Q-6 |
| A-2 (`ROADMAP.md`) | modules are Go | unchanged for the module; forge-display's client, which the module serves, is TypeScript and React: the one exception | Q-2 |
| The roadmap's sequence and `forge-mes-go.md` §6 | the Go SDK and forge-mes before forge-display | the order of Q-16 | Q-16 |

## 9. Implementation plan

One backlog item and one pull request per step, in the order of Q-16.

| Step | What | Item |
|---|---|---|
| 1 | FUTS: the schema for the view document and the widget spec, the runner, the first widget specs (done 2026-11-20, FB-176); types generated from it (FB-186); the hub's own view spec and object schemas; the FVTS schema's next version for Q-8 | FB-176, FB-177, FB-178, FB-186 |
| 2 | ~~The spike, outside the repository; its numbers to the owner~~ done 2026-11-20 (§6) | FB-179 |
| 3 | The role model in force on the hub | FB-075 |
| 4 | The Go module SDK with the parts of the transport contract forge-display needs (instances among them), and the view service messages | FB-017, FB-164, FB-180 |
| 5 | The forge-display server and the runtime renderer with a few widgets: the four hub screens, then forge-ot's HMI screens on live data | FB-181 |
| 6 | The Python worker pool in the SDK, and the approved-package list per hub | FB-182, FB-183 |
| 7 | The designer | FB-184 |
| 8 | The management modules in Go, forge-mes first; then the integration builder | FB-076, FB-154 |

Also: the `forge` command line is checked against "everything needed to bring the system back" when the hub's screens are specified (FB-185). The deployment requirement gains TLS with HTTP/2 from end to end in front of forge-display, in development too (S-1, with FB-181).
