# The hub-to-module transport contract (FTTS) — design record

**Status:** approved by reh3376 on 2026-11-18 (the owner answered Q-1 to Q-16 one at a time and declared the answers the signature, with the proposal in Q-15 accepted; the status line was set on that word) · **Backlog:** FB-163 (with FB-151, FB-155, FB-162) · **Roadmap:** decisions A-1, A-15
**Participants:** reh3376 (owner, decides and signs), Claude (surveys, asks, records, proposes)

Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code or the approved spec says today, with the path) or **[PROPOSED]** (Claude's recommendation, not approved).

---

## 1. Why this review

**[OWNER]** (2026-11-18, on approving `grpc-hardened-transport.ftts.json`) "I approve the FTTS spec, but I would like to spend more time thinking thru it. This spec could cause us significant technical debt in the future if it is not well thought out and dynamic. We need to consider all possible edge cases (or as many as we can come up with)."

FTTS governs the one transport between a hub and every module (A-1). What it fixes binds every module, in every language, at every installation, including modules built on site in the integration host (D-13).

## 2. What exists today (surveyed 2026-11-18)

- **[FACT]** One service, `forge.v1.AdapterService`, 12 RPCs: Register, Configure, Start, Stop, Health, Unsubscribe, Write, Discover (unary); Collect, Subscribe, Backfill (server streaming); Ingest (client streaming). `src/forge/proto/adapter_service.proto`.
- **[FACT]** The approved spec fixes: binary protobuf from compiled stubs, JSON forbidden; the proto files; a lossless bridge between the core models and the proto types; the 12 RPCs with their types; five status-code mappings.
- **[FACT]** The spec names Python: `server_module: forge.transport.grpc_server`, `channel_class: GrpcChannel`, `bridge_module: forge.transport.proto_bridge`, a stub location under `src/forge/proto_gen`, an in-memory channel. A Go module or the TypeScript bridge cannot be checked against those sections.
- **[FACT]** The transport code sets none of these, and the spec says nothing about them: a maximum message size, keepalive, compression, a deadline or time-out per RPC, a retry policy, stream resumption, a de-duplication key, flow control or back-pressure beyond what gRPC does by default. `src/forge/transport/grpc_server.py`, `grpc_channel.py`.
- **[FACT]** TLS is optional and mutual TLS is optional (`ServerTls.from_env`, FB-072). A bearer token and a callback token exist. Nothing renews a token on a long stream or rotates a certificate without ending the session.
- **[FACT]** The contract has one version, the proto package `forge.v1`. Nothing states how it may change, how a hub and a module of different ages agree, or how long an old module is served. The manifest carries the module's own version, not the contract version it speaks.
- **[FACT]** The time exchange and the clock gate ride on this transport (Register, Health, Ingest; D-9, FB-092, FB-093).
- **[FACT]** Hub-to-hub links are decided in principle (the hub hierarchy, R-16, R-18) and have no transport of their own yet.

## 3. The risk, precisely

A transport contract is the hardest thing in the platform to change after modules exist outside this repository: every change is a coordinated upgrade of every module at every installation. Each silence in §2 is a decision every implementer will otherwise make differently.

## 4. Questions for the owner

| # | Question | Answer |
|---|---|---|
| Q-1 | What FTTS governs: the wire contract, or one implementation of it. | **Answered 2026-11-18: split it.** One contract spec, language-neutral, is what every module is bound by: messages, RPCs, behaviour on the wire, limits, errors, versioning. An implementation spec per language or runtime (the Python hub, a Python module, a Go module, the integration host) declares how that implementation meets the contract and which conformance tests it runs. Debt check: a new language adds an implementation spec and changes nothing in the approved contract; the cost is two kinds of FTTS spec, which the schema must tell apart. |
| Q-2 | How the contract changes, and how a hub and a module of different ages work together. | **Answered 2026-11-18: additive within a major; two majors served.** Within `forge.v1` only additions: new optional fields, new RPCs, new enum values. Nothing is removed, renamed or given a new meaning, and a field number is never reused. Both sides ignore unknown fields. A breaking change is a new package, `forge.v2`, served beside v1. A hub serves the current major and the one before it; a module on an older major is refused at Register with that cause. CI fails a change to the proto files that breaks the rule. Debt check: the two-major window is what stops the hub carrying every old contract forever; the refusal is visible, never silent; an installation with modules built on site knows how long it has. |
| Q-3 | How a module and a hub agree on what each can do. | **Answered 2026-11-18: both declare at Register.** The module states the contract version it was built against and the optional features it supports; the hub answers with its own contract version, the features it supports, and the limits in force. Each side uses only what both named. The agreement is shown on the module's status. Debt check: an optional feature never needs a version step and is never assumed; the fields are additions to Register, allowed by Q-2. |
| Q-4 | The delivery guarantee for records. | **Answered 2026-11-18: at least once, de-duplicated by the hub.** A module resends anything it is not sure the hub took. Every record carries a stable record id from its module and the hub keeps each id once; its answer says how many were new and how many it already had. The hub acknowledges in batches, so a module knows how far it is safe to forget. Debt check: each record is stored once without a transaction across the link; the hub needs a de-duplication window with a declared length, and a record id must be stable across a module restart, which becomes a module requirement. |
| Q-5 | What a module does when it cannot reach its hub. | **Answered 2026-11-18: buffer and replay in order, as part of the contract.** The owner's words: "Buffer and replay in order via Store and forward built into the module - hub interaction specification." Store and forward is part of the module-to-hub interaction every module implements, not something a module adds: it keeps what it could not deliver, replays it oldest first when the hub returns, each record with its original source time, reconnects with a growing, capped delay, and shows on its health that it is buffering, how much and for how long. When the buffer is full the oldest records are dropped and the loss is counted and named, never silently. The module SDK provides it. Debt check: this settles FB-147: a local store-and-forward buffer is required by the contract, so it is not a database of the module's own under M-8; its size and age are declared in the module's spec. |
| Q-6 | Limits and back-pressure. | **Answered 2026-11-18: declared limits; the hub sets the pace.** The contract fixes ceilings for one record, one batch and records per second per module, and the hub tells each module the values in force at Register (Q-3). A module sends the next batch only after the last was acknowledged, so a slow hub slows its modules; a module that cannot send buffers (Q-5). A record over the size limit is refused with that cause and counted, never truncated. A replay after an outage runs at a separate, lower rate so it cannot starve live data. Debt check: the pace follows the acknowledgements Q-4 already needs, so there is one mechanism; the ceilings are numbers to choose with measurements (FPTS), not guesses written into the contract now. |
| Q-7 | Time-outs and keepalive. | **Answered 2026-11-18: the hub manages the connection; a goodbye on shutdown and a last will on loss.** The owner's words: "Hub to module comms keep alive needs to be specified in the FMTS (module spec) the hub manages connections and establishes keep alive interval, the module must send a last will & testament to the hub when being properly shutdown." Confirmed reading ("Yes: goodbye on shutdown, last will on loss"): the hub sets the keepalive interval for each link and tells the module at Register; the interval a module requires is declared in its FMTS spec. A module that shuts down properly tells the hub so, with the reason, and the hub marks it stopped, not failed. A module that vanishes without that message is detected when the keepalive lapses; the hub then acts on the module's last will, which the module declared in advance: what is to be recorded about it (offline, with the time last heard). Both are visible on the module's status. Every call carries a deadline, so neither side waits forever. Debt check: the two signals keep "stopped on purpose" and "lost" apart everywhere they are shown, which an alarm or a data-quality score needs; the keepalive entry is an addition to the FMTS schema (FB-153). |
| Q-8 | The security profile. | **Answered 2026-11-18: mutual TLS required in production.** Every production link is mutual TLS, with certificates issued by the installation's own authority (forge-creds). A plain or one-way link is refused unless the hub is explicitly in development mode, which is shown on its status. The module's identity is its certificate; a short-lived token carries its scopes and is renewed on the open stream before it expires. A certificate is rotated by reconnecting, which the buffer (Q-5) makes lossless. Revoking a module takes effect at once. Debt check: this makes forge-creds a prerequisite of any production installation (FB-142), and development mode must never be reachable by configuration drift: it is a visible, deliberate state. |
| Q-9 | What is fixed by the spec and what an installation may configure. | **Answered 2026-11-18: fixed behaviour; numbers per data class, within bounds.** The owner's words: "Keep alive intervals are best determined by the type of data transmitted, not the media it transmits on." The contract fixes behaviour (messages, RPCs, the delivery guarantee, the order of replay, what a refusal means, the security profile) and defines a small set of data classes, each with its keepalive, deadline, batch and buffer numbers as a default and a permitted range. A sketch of the classes, to be settled in the design: control and safety-related data (writes, interlocks, alarms), tight; process values and events, moderate; batch, quality and business records, relaxed; bulk history and backfill, slow. A module declares the classes it carries in its FMTS spec; the hub applies the strictest class a link carries and tells the module the values at Register; a hub admin may tune within the range. The medium does not appear in the contract. Debt check: every installation speaks the same contract, and a number never has to be guessed from the network; the classes are a governed list, so a new one is a contract change (Q-2), not a free-text value. |
| Q-10 | Hub-to-hub links. | **Answered 2026-11-18: the same contract; a hub is a module to its parent; lower priority.** The owner's words: "Option 1, but the hub to hub links are generally lower priority than the Hub to module links. The reason should be obvious. The spokes within a given hub control actual processes, but the hub to hub links would be considered more of a traditional IT link, it can withstand short loss of comms and not lose data as long as store and forward protocols are in place. Also, the hub to hub data exchange is more about reporting and historical data transfer not as time sensitive and hub to spoke comms generally." So a hub registers with the hub above it through the same service with the same guarantees, and what only hubs need is added as hub-only RPCs in the same contract. A hub-to-hub link carries the relaxed data classes (Q-9): reporting and history, tolerant of a short loss because store and forward holds the data. Debt check: one transport to secure, test and version; nothing between hubs may be needed for a spoke to keep controlling its process, which is a design rule for everything built on the hierarchy. It is built after the hub-to-module contract. |
| Q-11 | Slow, metered or intermittent links. | **Answered 2026-11-18: compression and scheduled transfer as negotiated features, and control of the buffer's capacity.** The owner's words: "Option 1 with the ability to also control max storage capacity for store and forward." Compression of the stream, and scheduled transfer (a module holds the relaxed data classes and sends them in declared windows, while the tight classes are always sent at once), are optional features used only when both sides named them at Register (Q-3). The maximum storage a module's store-and-forward buffer may use is controllable: declared in the module's spec, set within its bounds by the hub admin, told to the module at Register. Debt check: the capacity limit is what makes Q-5's "oldest dropped, loss counted" predictable on a device with a small disk; a full buffer is a visible state with its cause, never a crash. |
| Q-12 | Many modules in one process (the integration host). | **Answered 2026-11-18: one connection, a session per module.** The host opens one mutual-TLS connection and each module registers its own session on it, with its own id, limits, data classes, buffer and status. The hub treats a session exactly as a module with its own connection: each is admitted, paced and revoked on its own, and one misbehaving module does not affect the others. The host is identified, so an operator sees which modules share a process. Debt check: the session, not the connection, is the unit of everything in this contract; that has to be true from the first version or it cannot be added later without breaking modules. |
| Q-13 | Errors: what a module is told and what it must do. | **Answered 2026-11-18: a catalogue.** One list in the contract of every refusal and failure, each with a stable cause name, the status code it travels under, what it means, and the reaction required of the module: retry with back-off; fix and retry (one record refused, the rest of the batch stands); stop and wait for an operator (revoked, spec not approved, contract version too old); keep measuring and wait (clock out of class). Every cause appears under the same name on the module's health and the hub's status. A new cause is an addition. Debt check: the cause names already in use (`clock_out_of_tolerance`, `clock_unreadable`, `time_governance_missing`, `source_stamp_missing`) are the start of the list, and the conformance kit can test the required reaction for each. |
| Q-14 | Commands from the hub to a module that is offline or slow (write-back). | **Answered 2026-11-18: commands are never stored; they expire.** The owner's words: "Option 1. This is a discussion about the difference between IT and OT communication, especially at the HMI / SCADA level. Messaging related to OT functionality specifically command type messages require a very different set of constraints from a normal IT-type data transfer." Store and forward applies to records going up, never to commands going down. Every command carries a short expiry set by its data class; a command the module does not confirm within that time is dead, the hub reports it as not delivered with the cause, and whoever issued it decides again. A module that receives a command past its expiry refuses it. A module that reconnects never finds a queue of old commands. Debt check: this is the line between the IT half of the contract (records: at least once, buffered, order by source time) and the OT half (commands: at most once, immediate or not at all); the two are stated separately in the contract so that no later convenience applies the first rule to the second. |
| Q-15 | Two running instances that claim the same module id. | **Answered 2026-11-18: it must never reach production.** The owner's words: "This should never make it to prod. The spec runner and CI pipeline should see this and fail it." So a module id is unique among the specs, and the FMTS gate fails a repository or an installation's module set in which two specs claim one id. **[PROPOSED]**, for the case no spec check can see (one module started twice: a restart while the old process is alive, a copied configuration): the hub admits one session per module id and refuses the second at Register with a named cause, visible on status, fail closed, in keeping with the standing rule that a refusal is never silent. **Accepted by the owner at the signature** ("Sign it, with that proposal accepted"). **The owner, after the signature:** "If a module is started and active it cant restart, this should be immediately picked up by hubs module manager and registered as a restart event." Claude's reading: while a module's session is active, a second start of that module is not admitted; the hub's module manager detects the attempt at once and registers it as a restart event on the module's record (when, from which instance, and that it was refused), so an operator sees it immediately. A module comes back only after its session has ended, by its goodbye or by its last will. |
| Q-16 | The order of replayed and live records. | **Answered 2026-11-18: live first for the tight classes; every record keeps its source time.** The owner's words: "Option 1. This is why the time sync and time reporting is so important in forge." For the tight data classes fresh data goes first and the backlog follows beside it; the hub and everything that reads from it order by each record's source time, never by arrival, and a replayed record is marked as replayed. For the relaxed classes strict order is kept: nothing new is sent until the backlog is cleared. A consumer that needs a complete window waits until the module reports its backlog empty. Debt check: ordering by source time is only as good as the clocks, which is the reason for the one-clock rules (D-9) and the time contract (D-12); the backlog-empty signal is an addition to the module's health. |

## 5. Design

From the owner's answers in §4 (2026-11-18). All of it is **[OWNER]**.

| # | Decision |
|---|---|
| T-1 | **Two kinds of FTTS spec.** One language-neutral contract spec binds every module. An implementation spec per language or runtime says how that implementation meets it and which conformance tests it runs (Q-1). |
| T-2 | **Change.** Additions only within a major (`forge.v1`); a breaking change is a new major served beside the old; a hub serves two majors; an older module is refused at Register with that cause; CI fails a proto change that breaks the rule (Q-2). |
| T-3 | **Agreement at Register.** Each side states its contract version and optional features; the hub states the limits in force; only what both named is used; the agreement is on the module's status (Q-3). |
| T-4 | **The session is the unit.** Everything in the contract is per session, not per connection: identity, limits, data classes, buffer, status, admission and revocation. One connection may carry several sessions (Q-12). One session per module id: an active module cannot be started again, and the hub's module manager registers the attempt as a restart event (Q-15). |
| T-5 | **Records go up at least once.** A stable record id from the module; the hub keeps each id once; acknowledgement in batches (Q-4). |
| T-6 | **Store and forward is part of the contract.** Buffer what cannot be delivered, with a controllable maximum capacity; replay with original source times; reconnect with a growing, capped delay; a full buffer drops the oldest and counts the loss; buffering is visible on health. The SDK provides it (Q-5, Q-11). |
| T-7 | **The hub sets the pace.** Ceilings for a record, a batch and a rate; the next batch after the last acknowledgement; replay at a separate, lower rate; an oversized record refused with its cause (Q-6). |
| T-8 | **The hub manages the connection.** It sets the keepalive; every call has a deadline. A goodbye on proper shutdown; a last will, declared in advance, acted on when the keepalive lapses (Q-7). |
| T-9 | **Numbers follow the data, not the medium.** A governed list of data classes, each with its numbers as a default and a range; a module declares its classes in its FMTS spec; the strictest class on a link rules; a hub admin tunes within the range (Q-9). |
| T-10 | **Order.** Tight classes: live first, backlog beside it, everything ordered by source time, replayed records marked. Relaxed classes: strict order. A backlog-empty signal on health (Q-16). |
| T-11 | **Commands go down at most once.** Never stored; a short expiry by data class; expired means dead and reported; a late command is refused by the module (Q-14). |
| T-12 | **Security.** Mutual TLS in production, certificates from forge-creds; development mode is deliberate and visible; a short-lived token renewed on the open stream; rotation by reconnecting; revocation at once (Q-8). |
| T-13 | **Hubs.** A hub is a module to its parent, on the same contract with hub-only RPCs added; hub-to-hub carries the relaxed classes and is built after hub-to-module (Q-10). |
| T-14 | **Poor links.** Compression and scheduled transfer of the relaxed classes, as negotiated features (Q-11). |
| T-15 | **Errors.** One catalogue: cause name, status code, meaning, required reaction; the same names on health and status (Q-13). |
| T-16 | **Module ids are unique**, checked by the FMTS gate (Q-15). |

### Data classes are a dynamic list with rules (T-9, the owner on 2026-11-18, after the signature)

**[OWNER]** "Data classes will probably need to be further discussed, as long as the data class list / enum is dynamic and rules can be created for each we do not need to think of every possible data class before build starts. Although, it is a good idea to give it significant thought beforehand to minimize versioning changes later."

So the list of data classes is not closed, and a class is defined by its rules, not by its name:

- A data class is an entry in a governed list: a name and its rules (keepalive, deadlines, batch and buffer numbers with their ranges, the delivery rule, the order rule, whether commands of that class expire and how fast).
- Adding a class, or a rule to a class, is an addition, never a breaking change (T-2). **[PROPOSED]** The list is carried as data, not as a fixed enumeration compiled into every module: the hub tells a module the classes and rules in force at Register (T-3), so a module built before a class existed can still be told its numbers. A module that declares a class its hub does not know is refused at Register with that cause.
- The four classes sketched in Q-9 are a starting point, not the list. The first list is worked out with the owner before the contract spec is written (FB-164, step 7), with as much thought as can be given beforehand, to keep later version steps few.

### What a command is, and the rule for a business write-back (T-11, the owner on 2026-11-19, after the signature)

Asked while the contract's requirements were carried into the module requirements (FB-165).

**[OWNER]** "The correct answer to this is highly dependent on how we define a 'command'. When we discussed this yesterday we were talking about a very specific type of command. We were referring to a command that writes to a tag in a process control controller that would directly effect a processes operation. If that is the only type of cmd we are referring to here then only modules which could potentially have write access to PLC or HMI tags would be relevant."

**[OWNER]** On a downward message to a business system: "IT Rule: Ensure delivery once and only once, these should not time out in the sense that OT tag write commands should. A downward message to a business system needs to be confirmed delivered once and only once, but a minor delay is not system critical."

So two kinds of message go down, with opposite rules:

| | A command | A business write-back |
|---|---|---|
| What it is | a write to a tag in a process controller (PLC or HMI) that directly affects a process | a message to a business system, for example a transaction posted to an ERP or an order updated in the MES |
| Delivery | at most once | once and only once, confirmed |
| While the link is down | never stored; dropped and reported | kept, and delivered when the link returns |
| Time | expires quickly, by its data class; a late one is refused by the module | does not expire as a command does; a minor delay is acceptable |
| The module's part | M-15: refuses a command past its expiry | M-16: applies each id once and confirms it |

T-11 is read with this definition. Lifecycle calls from the hub (Configure, Start, Stop, a request to collect or backfill) are neither: they are requests, answered or failed within their deadline (T-8).

### Data classes: parents and sub-classes (T-9, the owner on 2026-11-19, after the signature)

Asked while the module spec gained its data classes (FB-153). The four classes sketched in Q-9 are replaced by this.

**[OWNER]** "It is very likely that we will have far more than 8 data classes. We should probably think this thru for a minute before we commit to these 8 simple classes. Here are some that I am considering, they may not all be needed and we could use a parent child relationship for data classes as well which would allow us to create the initial parent classes now and build out sub-classes as they come up later. Here are a few: raw, historical, curated, control, ... ."

**[OWNER]** On more parents: "The 8 named thus far for sure, can you think of other parent classes we may need with current backlog and direction? mod-hub, hub-hub, & hub-mod may be useful, but I have not thought them all the way thru yet." The owner then approved config, live, request and artifact, then security, and confirmed that mod-hub, hub-mod and hub-hub are an attribute of each class, not classes.

- **A class is named `parent` or `parent.child`.** A sub-class inherits every rule of its parent and may only tighten its numbers. It never changes the delivery rule and never loosens anything, so a hub that knows only the parents handles a new sub-class safely.
- **Each parent has exactly one rule**: its direction, the links it may travel (module to hub, hub to module, hub to hub), its delivery guarantee, whether it is stored, whether it expires.
- **A module declares the classes it carries**, as parents (anything in them) or as specific sub-classes.
- **The numbers of each class** (keepalive, deadlines, batch, buffer, expiry) are settled with the owner when the contract is built (FB-164).

| Parent | Direction | Rule |
|---|---|---|
| raw | up | values and events as collected from a source; at least once; stored and forwarded |
| curated | up | curated records and data products; at least once; relaxed |
| historical | up | bulk history and backfill; at least once; slow, may be scheduled |
| alarm | up | alarms, interlock and safety-related states; at least once; tighter than raw |
| audit | up | audit records; at least once; never pruned when a buffer fills |
| status | up | health, the goodbye, the last will; not buffered |
| live | up | live values for screens; the latest wins; never stored; a late one is dropped |
| control | down, hub to module only | commands; at most once; never stored; expires |
| write-back | down | messages to a business system; once and only once; kept while a link is down |
| config | down | configuration, promoted flows and specs, role assignments, limits; the newest wins; kept until delivered |
| security | down | credentials, token renewal, revocation; highest priority; never stored in clear; never replayed |
| request | both | a question answered within a deadline; never stored |
| artifact | both | large objects; sent in pieces, resumable, verified by hash |

The list is `src/forge/governance/lists/data-classes.list.json`, approved by the owner on 2026-11-19. Adding a class or a sub-class is one approved change to it and never a breaking change (T-2).

### A full buffer: the pruning strategy (T-6, the owner on 2026-11-19, after the signature)

T-6 said a full buffer drops the oldest and counts the loss. **[OWNER]** "I agree with option 1, but will likely need user defined pruning strategy as well when / if max store is reached how is it handled." So T-6 is amended:

- A module declares its buffer as a size range and an age range; the hub admin sets a value within each; whichever limit is reached first triggers pruning.
- How it prunes is a strategy from a governed list. The first two: **drop-oldest**, the default, and **by-class-priority** (the lowest-priority class first, oldest first within it). A module declares the strategies it supports; the hub admin chooses one.
- Whatever the strategy, every loss is counted and shown, and the audit class is never pruned.

### The last will and the keepalive (T-8, the owner on 2026-11-19, after the signature)

- **The last will** a module declares is a message for the operator and the priority of the alarm raised (none, low, medium, high, critical). The state the hub records is fixed: lost, with the time last heard.
- **The keepalive** comes from the strictest data class a module carries. A module may declare a longest interval it accepts; that can only tighten it.

## 6. What this changes in work already planned

- **The module requirements (D-12).** T-5, T-6, T-8 and T-11 are behaviour every module must show, so the baseline gains requirements and the conformance kit gains checks for them: a stable record id, store and forward with its capacity, the goodbye and the last will, refusing a late command. That is a change to a signed record and needs the owner's word.
- **FMTS (FB-153).** The module spec gains its data classes, its keepalive needs, its buffer capacity and its last will.
- **FB-147** is settled by T-6: a store-and-forward buffer is required, so it is not a database of the module's own.
- **forge-creds (FB-142)** is a prerequisite of a production link (T-12).
- **The approved FTTS spec** is replaced by a contract spec and a Python implementation spec, as a new schema version under FB-151's rules; until then it stays approved as it is.

## 7. Implementation plan (after signature)

Written as backlog items when the record is signed. The order: the contract spec and the schema that tells the two kinds apart (T-1); the proto additions for T-3, T-5, T-8, T-11 and T-15, each additive; the hub side; the Python SDK side with store and forward; the kit's checks; the Go SDK follows the contract, not the Python code.
