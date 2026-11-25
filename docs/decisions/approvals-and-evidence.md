# Approvals and evidence: what a passing, approved spec proves — design record

**Status: approved by reh3376 on 2026-11-24 as D-19** (the owner, asked whether the second draft is signed: "yes"). Nothing in it is built yet; §8 is the order. Second draft, 2026-11-24, at gate 1 for step 4 of the FxTS soundness work (BACKLOG FB-264, FB-267, FB-258), on the owner's `+design`. **[OWNER] 2026-11-24:** the direction of the first draft is approved ("docs/decisions/approvals-and-evidence.md - approved"), with the signature to follow once the adversaries' findings are folded in ("Direction now, sign after"). Two adversaries proved 21 findings against the first draft; §4 lists what they changed. Its questions (§10) are put to the owner one at a time, each when its step comes.

Marks: **[OWNER]** the owner's words or decision · **[FACT]** verified, with the path · **[PROPOSED]** Claude's proposal, approved with the record on 2026-11-24 · **[OPEN]** a question for the owner.

## 1. The problem

**[OWNER]** confirmed 2026-11-24 ("looks correct"): today a spec that is approved and passing proves neither that the real thing matches it nor that the owner approved it.

1. **Evidence.** Most of what a spec declares is checked only against the spec itself or another written file; where the real thing was measured it disagreed (`forge-core/docs/fxts/AUDIT-2026-11-23.md`). No verdict says what kind of evidence it rests on (FB-264).
2. **Approval.** An approval is two fields in the spec's own file, outside its hash; they can be rewritten unseen; re-stamping keeps an approval; a failing spec can be approved; no run is recorded (FB-258, FB-267).

**The goal.** When the gate lets a spec through as approved: every part of it that claims something about the real thing has a named check of the real thing, or the gap is visible with the backlog item that closes it; and the approval is a record, for exactly this content, this schema, the module it binds and a run the gate let through, that nobody without the owner's key can make, change, replay or move.

**What a signature cannot do, and what does it instead (the attack's main lesson).** A signature proves that the holder of a key signed. It cannot tell the owner from a coding agent that runs as the owner, on the owner's machine, with the owner's GitHub login: a hardware key's touch shows nothing of what is signed, the touch requirement cannot be verified by anyone who checks the signature, and an agent with the owner's login can merge past protection while `enforce_admins` is off (FB-288). **So the owner's approval is protected by two things together: a key no agent can reach, and an agent that cannot act as the owner on GitHub.** The second is FB-288. **[OWNER] 2026-11-24 (Q-1):** not a concern now; the approvals are built without it, tamper-evident and traceable, and FB-288 waits until it becomes necessary.

## 2. What is already decided

| Decision | Where |
|---|---|
| An approval is a signed record beside the spec: framework, id and hash, the module it binds, the schema version and hash, who approved with what authority and for which hub, and when; the signature covers all of it. | D-18 AD-6 (`approved-spec-register.md:85`) |
| Strict reading before hashing; the method named is the method run. | D-18 AD-7 (`:86`) |
| Who may approve what, and where, is one table of authorities, each with its key; the owner's rule and a hub's are two entries. | D-18 AD-13 (`:91`) |
| Screens, flows, lists and packages use the same record. | D-18 C-9 (`:170`) |
| Tokens are verified offline against the issuer's public key; a hub's key is certified by its parent. | D-1 R-8 (`roles.md:28, 104, 134`) |
| Every spec carries an integrity block; two verdicts, the hash verifies and it is approved; `stamp` is a required command; a spec records the schema version and hash it was approved against; an unapproved spec is stamped so a later change is seen. | D-14 F-4, F-9, F-10, Q-2, Q-6 |
| Nobody but the owner approves a spec hash, a schema version or a governed list, always. | `hard-limits.list.json:51-60` (approved) |
| Object schemas are approved through the view spec that uses them; test fixtures are not governed. | the owner, 2026-11-24 |
| A waiver of M-3, M-4 or M-15 counts only in an approved module spec. | D-12 Q-10 (`forge-module-requirements.md:123`) |

## 3. What exists (from the grounding, 2026-11-24)

- **[FACT]** 93 owner approvals: 63 specs (forge-mes's module spec is pending), 6 governed lists, 14 schema versions, 10 accepted gaps. Each is a name in a field; nothing checks who wrote it.
- **[FACT]** The hub at run time reads a spec's hash from its integrity block and refuses a hash that does not verify, never reads the approval, and treats a spec with no block as a warning (`forge_hub/ingest/facts_check.py:125-129`). 16 source files and 27 test files read the integrity block.
- **[FACT]** No verdict names its kind of evidence; one check id gives different statuses on different specs (`fmts:m4` passes on eight, is not run on one); some ids are built at run time (`parity:<field>`, `facts:capabilities-<name>-type`); some checks cover several sections or none.
- **[FACT]** Checks of the real thing run in the gate only for FMTS M-4 to M-7 (the kit) and FVTS enum parity (which checks `$defs`, no section).
- **[FACT]** No run is recorded anywhere.
- **[FACT]** `cryptography` 50.0.2 is installed only through `pyjwt[crypto]`; no public-key code exists.
- **[FACT, experiments 2026-11-24]** A record signed with `ssh-keygen -Y sign -n forge-approval` verifies in Python with `cryptography` alone and with `ssh-keygen -Y verify`; a changed byte, namespace or key fails. A hardware-style `sk-ssh-ed25519` key made in software, with the touch flag clear, also verifies: a verifier cannot tell. An OpenSSH signature carries no time. `ssh-keygen -Y sign -f <key>` asks a running ssh-agent first when `SSH_AUTH_SOCK` is set.

## 4. What the attack changed

| First draft | Proven against it | Second draft |
|---|---|---|
| Remove the integrity block (AE-7). | Contradicts D-14 F-4, F-9, F-10, Q-2; the hub then treats an edited spec as a warning (shown on the real code); an unapproved spec's hash is stored nowhere; 43 files read the block. | **The block stays, smaller**: the hash, its method and the schema record. Only the approval leaves it (AE-7). |
| Revocation "from a time", by `signed_at`. | The signer writes `signed_at`; a stolen key back-dates and counts. | **No rule depends on a time a signer writes.** A key that is not current signs nothing that counts; rotation re-signs (AE-9). |
| Nothing supersedes an approval. | Reverting a spec, or the authorities file, together with its old record, counts again. | **Each record has a sequence number per subject**, and the authorities file a version; neither may go down (AE-10). |
| Hub approver keys in the contract's authorities file. | A hub key can sign a new owner key in; D-1 has hubs certify keys down their own chain. | **The contract file holds the owner's keys only**; a hub's approvers live in its own store, certified by its parent (AE-8). |
| "Every signature needs a touch." | Not verifiable; a touch shows no content. | **Claimed nowhere.** The protection is the key's place and FB-288 (§1, Q-1). |
| The record omits the module. | D-18 AD-6 names "the module it binds". | **`binds`** is in the record (AE-5). |
| An approval needs a run that "did not fail". | An INCOMPLETE run (shows nothing) counts; and forge-mes's module spec could never be approved, since its run fails a check that needs the approval. | **The gate must let the run through**, approval-dependent checks set aside, and the record names every check that did not run (AE-11). |
| One evidence kind per check id; claim or description per top-level section. | One id, many statuses; dynamic ids; checks across sections; mixed sections; `spec_version` is neither. | **Kind per verdict, declared per check (or id pattern) with the sections it covers; three marks per property: claim, description, structure** (AE-1 to AE-3). |
| Findings `<fw>:evidence:<section>`. | The gaps file refuses that id; about 45 gaps on day one. | **`<fw>:evidence-<section>`**, one gap per section for every spec of the framework; the count is stated (AE-4). |
| One writer per file (C-5). | Gap and schema-version approvals sat in shared files. | **One writer per record**; where records share a file the writes are the owner's command, one at a time (AE-6). |
| §10 listed four acts. | Missing: the D-14 amendments, the hard limit for gaps, the record's own schema, a direct dependency on `cryptography`, FB-288. | **§10 lists eight.** |

## 5. The proposal

### Evidence

| # | Rule |
|---|---|
| AE-1 | **Every verdict names its kind of evidence**: `self` (the spec against itself or its schema), `file` (another governed file), `artifact` (the real thing: code imported or introspected, the app built in process, the proto, the module run through the kit), or `none` (not run, waived). **Amended 2026-11-24 by the owner (§12 S-1: a verdict names what it reached; its kind comes from that, capped by its declaration).** |
| AE-2 | **Each runner declares, as data, each check it can give** (by id, or by id pattern for ids built at run time), the schema properties it covers (one or more JSON pointers) and the kind it reaches when it runs. A verdict that matches no declaration is a runner error; a declaration no real spec reaches is reported. |
| AE-3 | **Each property of a framework's schema is marked**, `x-forge-evidence`: `claim` (says something about the real thing), `description` (text for people; nothing may read it to decide anything) or `structure` (selects the schema or the shape, such as `spec_version`, `spec_kind`). A property without a mark takes its parent's; every top-level property is marked. A mixed object marks its parts. **Amended 2026-11-24 by the owner (§12 S-2 to S-4: `structure` is about the spec as a document; the marks split a schema cleanly; a check that reads a description rests on nothing).** |
| AE-4 | **A claim with no `artifact` check is a gate finding**, `<fw>:evidence-<section>`, not run, on every spec of the framework; it gets through only by an accepted gap naming the backlog item that adds the check. About 45 such gaps on day one (FACTS 8, FATS 6, FMTS about 8, FTTS 9, FUTS about 3, FVTS 11 to 12); they only shrink. **Amended 2026-11-24 by the owner (§12 S-5, S-6: a claim is covered by a check of the real thing in the spec's own run; the marks in force are the latest approved version's).** |

### Approval

| # | Rule |
|---|---|
| AE-5 | **One form of approval record** for specs, governed lists, schema versions and accepted gaps: `kind`, `framework`, `id`, `binds` (the module or view owner, where the subject has one), `content_hash` and `hash_method`, `schema` (version and hash, where it has one), `run` (runner and version, outcome, the digest of the verdicts with their kinds, and the checks not run), `seq` (per subject), `authority`, `scope` (the repository, or a hub), `signature`. The signature (`ssh-keygen -Y sign`, namespace `forge-approval`) covers the canonical form of every other field, read strictly. |
| AE-6 | **The record lives beside its subject**: `<name>.approval.json` next to a spec or list, next to a frozen schema version; inside its entry for an accepted gap. A new kind in the closed set. Only the approve command writes a record. |
| AE-7 | **The integrity block stays and holds only** the hash, its method (one name, one code path) and the schema version and hash the spec is written against. `hash_state`, `approved_by`, `approved_at` and `change_history` leave it. A spec with a block is still stamped (F-9) and its hash still checked by the hub. The hash is unchanged by this, since the block is outside it. |
| AE-8 | **The owner's keys are a contract file** (`forge-core/contract/authorities.json`): a `version`, and each key with its id, its OpenSSH public key, what it may approve (Forge's own specs, lists, schema versions, gaps), and whether it is current. A change to the file needs a record signed by a key the file already holds as current, and its `version` goes up. It holds no hub's key; a hub's approvers are in that hub's store, certified by its parent (D-1 R-8), built with D-18 admission. *Amended 2026-11-25 by the owner (D-20, signed; its §11).* |
| AE-9 | **No rule depends on a time a signer writes.** A key that is not current signs nothing that counts. Rotation adds the new key, re-signs every current approval with it, and retires the old one in the same change; a compromise retires it at once, and the owner re-signs what should stand. *Amended 2026-11-25 by the owner (D-20, signed; its §11).* |
| AE-10 | **Nothing goes backwards.** A subject's record carries `seq`, one more than its last; the gate compares with `main` and refuses a lower `seq`, or a record removed while its subject stays; the authorities file's `version` may not go down. A hub keeps the highest it has seen. Going back to an earlier content is a new approval of it, with a new `seq`. *Amended 2026-11-25 by the owner (D-20, signed; its §11).* |
| AE-11 | **Approving runs the framework first**, with the approval-dependent checks set aside (`hash-approved`, and the approval condition of `fmts:waivers`); the approval is refused unless the gate would let that run through. The record names every check that did not run and the gap that covers it. |
| AE-12 | **An approval counts only if**: its signature verifies against a key the authorities file holds as current for that kind; its `content_hash` is the subject's hash now; its schema version and hash are the spec's and the released file still hashes to them; its `binds` is the subject's; its `seq` is not below `main`'s; and its run was let through. Otherwise `<fw>:hash-approved` fails, naming which condition broke. *Amended 2026-11-25 by the owner (D-20, signed; its §11).* |
| AE-13 | **Forge never reads a private key.** It hands `ssh-keygen` the bytes to sign, after showing the owner the subject, its hash and the record. |
| AE-14 | **Each approval act names its permission**: `governance:spec:approve`, `governance:list:approve`, `governance:schema:approve`, `governance:gap:approve`, `governance:authority:change`; all five sit under the `owner-approval` hard limit (a list release). |
| AE-15 | **The gate's run is kept:** CI keeps the JSON report of every `forge governance check` as a build artifact. |

## 6. Cases

| # | Case | What happens |
|---|---|---|
| 1 | Scale: thousands of subjects at an installation | One Ed25519 verification each, under a millisecond. Rotation re-signs in one batch. |
| 2 | Change while in use: a key rotated or stolen | Rotation re-signs and retires in one change; a stolen key is retired at once and nothing it signed counts, whenever it claims to have signed. |
| 3 | A hub cut off | It verifies offline against the authorities file it holds, and keeps the highest `version` and `seq` it has seen, so a replayed older file or record is refused there too. |
| 4 | No person acting: an agent, CI | Can verify; cannot sign without the owner's key; cannot get a change past the owner while FB-288 holds (Q-1). Editing a record breaks its signature; editing a subject breaks its hash; replaying an older one breaks `seq`. |
| 5 | A signing session stops halfway | Each record is written whole or not at all; running again signs what is left. |
| 6 | Renaming and migration | A record names framework and id and moves with its subject. Moving the approvals out of the blocks changes no hash; the change that does it carries the owner's one signing session, and its gate reads only the new records, so there is no time when neither counts. |
| 7 | Before it is complete | The evidence findings pass as accepted gaps naming the work of step 5. Without FB-288 the records are tamper-evident but do not by themselves prove the owner signed; the owner accepts that (Q-1). |
| 8 | The wrong thing made impossible | No field in a subject says "approved"; a record without a current key's valid signature counts for nothing; a verdict without a declared check is a runner error. |
| 9 | What it pins | Ed25519 in the OpenSSH signature form; canonical JSON; the record names its method, so a later one is added beside it. |
| 10 | How it is known to hold | §7. |

## 7. Laws

Each gets an exhaustive check on the real code and a `verify-*` skill when it is built.

1. **An approval counts if and only if** every condition of AE-12 holds.
2. **Any change to any field of a record, or to its subject, its schema or its binding, makes it count for nothing**; so does a lower `seq`, a retired key, or an older authorities file.
3. **Every verdict any runner gives matches a declared check and names its kind of evidence.** *Amended 2026-11-24 by the owner (§12 S-1): its kind is the strongest thing it names as reached, capped by its declaration.*
4. **No approval is recorded for a run the gate would not let through.**

## 8. Order of building

1. Evidence kinds on verdicts and each runner's declared checks (AE-1, AE-2). No schema change.
2. The marks in the six schemas, the evidence findings and their accepted gaps (AE-3, AE-4): six schema releases, about 45 gaps, the D-14 amendment.
3. The record, its schema, the authorities file, signing and verification, the smaller integrity block, every reader of the old fields changed (the runners, the hub's check, `stamp`, `approve`, `specs`, the lists loader, the index, the module builder's generator, the closed set, the gaps file, their tests), and every approval re-signed once (AE-5 to AE-15).
4. The hub reads approvals as D-18 builds admission.

## 9. Choices made in this draft (open to the owner's correction)

| # | Choice | Why |
|---|---|---|
| C-1 | SSH signatures over a record, not git signatures | What D-18 signed; verifiable offline by a hub; nothing new to install. |
| C-2 | The marks live in the schemas, owner-approved | What a spec may claim is the framework's definition. |
| C-3 | Today's run need not equal the approved run | Otherwise every new check voids every approval. |
| C-4 | Keep the integrity block, move only the approval out | The signed baseline and the hub rest on the hash in the file; the fields that could be rewritten unseen are the approval's. |
| C-5 | Records beside their subjects; one writer per record | No conflicts between changes; the owner's command writes them one at a time. |
| C-6 | No time in any rule | A signer writes the time; ordering comes from `seq` and the authorities `version`. *Amended 2026-11-25 by the owner (D-21 §14; `approval-signing.md` Q-D): rules may use ages on a hub's own monotonic clock and attested time from the time authority's signed, nonce-bound exchange; a time a signer writes still counts for nothing.* |

## 10. What only the owner decides, one at a time

| # | Question | Claude's recommendation |
|---|---|---|
| Q-1 | **Answered 2026-11-24.** The owner: "option 1 is fine, but I am not concerned about this issue. Unless its necessary I would perfer to not waste time with it." So step 3 does not wait on FB-288: the signed approvals it builds are tamper-evident and traceable, and that an agent running as the owner could reach the owner's key is a risk the owner accepts. FB-288 stays open, low, with option 1 as its fix when it becomes necessary. The question as put: how coding agents are kept from acting as the owner: on GitHub (their own identity that cannot approve, merge or push to `main`; `enforce_admins` on) and on the machine (no reach to the owner's signing key or login). | Both. On GitHub: a machine identity for the agents, and `enforce_admins` on. On the machine: the signing key where no process running as the agent's user can use it. Without this, step 3 gives tamper-evidence, not proof of the owner. |
| Q-2 | Where the owner's signing key lives. | A hardware security key, loaded in no agent; or a key file held by an OS user the agents do not run as. Not in the agent's ssh-agent, not with its passphrase in the keychain. **Answered 2026-11-24:** the owner chose the hardware security key, "Option 1, during development": an `ed25519-sk` key on a FIDO2 device signs Forge's own artifacts in the repository; production approvals by a hub's approvers stay with FB-189 and FB-232. |
| Q-3 | Whether the same key also signs git commits. | Not the same key: a commit signature and an approval would then ask for the same confirmation, so one could be passed off as the other. **Answered 2026-11-24:** "A separate key": approvals have their own `ed25519-sk` key (it may sit on the same device); commits keep what signs them today. |
| Q-4 | The D-14 amendments: F-4 (the block keeps the hash and the schema; the approval is a record), F-11 (every verdict names its evidence), F-12 (every claim has a check of the real thing or an accepted gap). | Accept the three. **Partly answered 2026-11-24:** the owner accepted F-11, F-12 and the F-2 note ("Accept all three"; D-14 §7). F-4 waits for step 3. |
| Q-5 | The `owner-approval` hard limit gains `governance:gap:approve` and `governance:authority:change`, and states it covers Forge's own artifacts (with FB-261). | Accept; a list release. **Answered 2026-11-24:** "Accept": a release of the hard-limits list, approved in the step 3 session. |
| Q-6 | The record's form as a governed schema, approved like the others. | Accept. **Answered 2026-11-24:** "Accept": the record and session forms are a governed schema from v1.0.0. |
| Q-7 | `cryptography` as a direct dependency (it is installed now only through `pyjwt[crypto]`). | Accept; it is D-1's "cryptography library, confirmed with the owner" (`roles.md:215`). **Answered 2026-11-24:** "Accept": `cryptography>=50.0.2` is a direct dependency (the locked version is unchanged). |
| Q-8 | The one signing session: every approval re-signed once (about 93 today, about 145 once step 2 adds its gaps and schema versions). | Accept; the list is shown before signing, and nothing is signed that the gate would not let through. **Answered 2026-11-24:** "Accept": one session, shown in full and signed once with the approvals key; the pull request is pushed only after it. |

## 11. What this does not decide

How approvals and the owner's keys travel to hubs (FB-232), the role that may approve on a hub (FB-189), what a cut-off hub may approve (D-17 §11.5, not signed), and FHTS's future (FB-279).

## 12. Step 2 as built (2026-11-24): the amendments it needs

**[OWNER] 2026-11-24: signed** (the owner, asked whether §12 is signed: "Sign all eight"). Building step 2 (gate 1, `+cases`) settled what the record left open and found two faults in the framework base. Nothing here changes a law of §7 except law 3, which it tightens. Each row below is **[OWNER]** from 2026-11-24, and the rule it amends carries a dated note. S-7 and S-8 amend D-14's F-2, which D-14 records (its §7).

| # | Amends | What was built | Why |
|---|---|---|---|
| S-1 | AE-1, law 3 | **A verdict names what it reached**, in `reached`: `file:<path in the repository>` or `artifact:<what>`. Its kind is the strongest thing it names, `self` when it names nothing, never stronger than its check's declaration; a verdict that did not run or is waived rests on nothing; a name in any other form makes the verdict an error. | Step 1 took the kind from the declaration alone, so `futs:expressions` passing "No expressions." on a view with none was labelled the real thing though nothing was compiled **[FACT]** (PR 185). The default is now the weakest kind, and strength has to be shown. |
| S-2 | AE-3 | **`structure` means "about the spec as a document"**: its version, its kind, its integrity block, the owner's waivers. Identity fields (an id, a name) name real things and are claims. | `integrity` and FMTS `waivers` select no shape, yet nothing real can disagree with them. |
| S-3 | AE-3 | **The marks split a schema cleanly**: every property lies under exactly one mark; a mixed property is unmarked and marks its parts; a release whose marks do not split it, or where two top-level names give one section id, is refused. A top-level property with no mark is a claim (the strictest). | Overlapping marks would make a claim's mark ambiguous; the strict default means an unmarked framework is loud, not silent. |
| S-4 | AE-3 | **No check decides on a description**: a check declared to read a property marked `description` is declared to rest on nothing (`none`). The four `metadata` checks (FACTS, FMTS, FTTS, FVTS), which only count keys and always pass, are declared so. | AE-3: nothing may read a description to decide anything. |
| S-5 | AE-4 | **A claim is reached in a run** when a verdict of that run, of kind `artifact`, comes from a check declared to cover the claim or a property above it. A check covering only a part of a claim does not cover the whole; the schema marks the parts when the checks are finer (FMTS marks each of M-1 to M-16). A claim the spec does not make (the property is absent) gives nothing. | Computed in each spec's own run, so `forge governance run`, the gate and a hub (D-18) give the same answer offline; a run with `--live` that reaches the route clears that claim for that run. |
| S-6 | AE-4 | **The marks in force are the latest version the owner approved**, not the current file and not the version a spec was approved against; with none approved, every top-level property is a claim. Each finding records the version its marks came from. | `forge governance check` does not refuse a release awaiting approval (only the baseline test does, in CI), so reading the current file would let marks take effect in a local run, or on a hub, before the owner approved them. |
| S-7 | D-14 F-2 | **Adding, changing or removing a mark is a minor step**, and each release records every change it makes (`changes` in the registry), so a claim weakened to a description is named. | No spec's validity or meaning changes, so no spec needs review. Before, the classifier called a mark a new constraint, a major step that would have failed `schema-current` on all 64 specs **[FACT]**. |
| S-8 | D-14 F-2 | **A property named like a wording keyword is a name.** The classifier treated a property called `description`, `title`, `default` or `examples` as the keyword: removing one was a patch, not a major step, and a mark on one was hidden as "wording changed" **[FACT]**. Fixed in the classifier, for every framework. | Found while classifying FVTS `view_identity.description`. |

**The cases (gate 1, `+cases`, 2026-11-24).** Scale: findings are per spec, gaps per section (`spec: "*"`), so gaps grow with schema sections (about 47), not with modules. Change in use: S-6. A hub cut off: S-5, computed locally. No person acting: only the owner approves marks (a release) and gaps. Failure: a fault while finding claims is `<fw>:runner-error`; a release run twice is refused as unchanged. Renaming: a renamed section's gap covers nothing and stops the gate, so the owner approves the new one. Before complete: S-3's strict default closes the gate until the owner approves the marked releases; specs that passed outright are incomplete, which approval (AE-11) and admission (D-18 AD-4) allow, since they read the gate's judgment. The wrong thing: S-1, S-3, S-4; still possible are a runner naming what it did not reach, and a claim marked `structure` or weakened by an approved release, which the owner's review of each release's `changes` guards. What it pins: the `x-forge-evidence` key and its three values in kept versions, the finding id `<fw>:evidence-<section>` in the gaps file, and the `reached` form in kept reports.

## 13. Step 3 as built (2026-11-24): the amendments it needs

**Superseded 2026-11-25 by D-20 (`approval-signing.md`) and D-21 (`security-framework.md`), both signed: the session became the signed release list, the authorities file became the deployment's anchor, and step 3 is built as D-21's step 5.** The text below is the draft as it stood.

**[OPEN, superseded] awaiting the owner's word.** Gate 1 for step 3 (`+cases`, 2026-11-24) settled what the record left open; the owner answered Q-2, Q-3 and Q-5 to Q-8 the same day (§10). On the owner's word each row becomes **[OWNER]** and the rule it amends carries a dated note.

| # | Amends | What is built | Why |
|---|---|---|---|
| T-1 | AE-5, AE-6 | **One signature per approval act, a session.** The approve command builds every record, shows the owner the whole list (each subject, its hash, what it binds to, its run and the gaps of its checks not run), and the owner signs that list once. The session is a file of its own, `forge-core/approvals/sessions/<id>.json`, whose id is the hash of its list (no time in it); each record beside its subject names its session, and counts only if the session lists the record's exact hash and its signature verifies. | The owner approves in acts ("six schema releases, approved"; "47 gaps, approved"), so one decision is one signature; with a hardware key, 146 records would otherwise be 146 touches. |
| T-2 | AE-12, Q-2 | **The owner's approvals key is an `sk-ssh-ed25519` key on a FIDO2 device** (Q-2, for development), its own key (Q-3), and a signature counts only if the device reported the owner's touch (the user-presence flag). Verification is pure Python (`cryptography`, a direct dependency since Q-7), so a hub needs no `ssh-keygen`; an ordinary `ssh-ed25519` key verifies the same way. | A cut-off hub verifies offline (case 3); a signature the device made without a touch is refused. |
| T-3 | AE-5 | **A record names its subject by identity, not by path**, with one rule for the runner and the hub (`forge_core.fxts.identity`: an API spec by method and path, the others by their id), and `binds` is the owner of the `fxts` folder the spec lives in. | A spec moved keeps its approval; a spec moved to another module's folder, or whose identity changes, is a new subject (case 6). |
| T-4 | AE-6 | **New kinds in the closed set**: the approval record (`*.approval.json`), the session, the authorities file and the approval forms' schema (`forge-core/contract/approvals/approvals.v<version>.schema.json`, Q-6). | Every file is still exactly one kind (FB-268). |
| T-5 | D-14 F-4 | **The integrity block keeps only the spec's hash, its method and the schema version and hash it is written against; the approval is a signed record** (the last part of Q-4). | AE-7; the hash is unchanged, since the block is outside it. |

**The cases (gate 1, `+cases`, 2026-11-24).** Scale: one signature check per session, cached, and a hash lookup per record; a rotation is one session. Change in use: an edited spec or a re-released schema voids its record with the reason named; a new check voids nothing (C-3); files are written whole or not at all. A hub cut off: T-2. No person acting: CI and hubs verify and never sign; with the key on a device, nothing signs without the owner's touch. Failure: a declined or timed-out signature writes nothing, the signature is verified before any file is written, and a rerun signs only what is missing. Renaming: T-3; the migration is one session. Before complete: from the moment the old fields leave, every approval fails until the owner signs the migration session, so the session is the last act before the push. The wrong thing: a record outside a signed session, copied onto another subject, replayed with a lower `seq`, signed by a retired key, or read with an authorities file whose version went down counts for nothing; still possible are the owner signing without reading (the session shows every subject and hash first), and an agent reaching a key file, which a device key closes. What it pins: OpenSSH's signature format and the namespace `forge-approval`, the forms' schema v1.0.0, the authorities file and the session layout, all versioned data with one reader.
