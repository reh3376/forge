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
| AE-1 | **Every verdict names its kind of evidence**: `self` (the spec against itself or its schema), `file` (another governed file), `artifact` (the real thing: code imported or introspected, the app built in process, the proto, the module run through the kit), or `none` (not run, waived). |
| AE-2 | **Each runner declares, as data, each check it can give** (by id, or by id pattern for ids built at run time), the schema properties it covers (one or more JSON pointers) and the kind it reaches when it runs. A verdict that matches no declaration is a runner error; a declaration no real spec reaches is reported. |
| AE-3 | **Each property of a framework's schema is marked**, `x-forge-evidence`: `claim` (says something about the real thing), `description` (text for people; nothing may read it to decide anything) or `structure` (selects the schema or the shape, such as `spec_version`, `spec_kind`). A property without a mark takes its parent's; every top-level property is marked. A mixed object marks its parts. |
| AE-4 | **A claim with no `artifact` check is a gate finding**, `<fw>:evidence-<section>`, not run, on every spec of the framework; it gets through only by an accepted gap naming the backlog item that adds the check. About 45 such gaps on day one (FACTS 8, FATS 6, FMTS about 8, FTTS 9, FUTS about 3, FVTS 11 to 12); they only shrink. |

### Approval

| # | Rule |
|---|---|
| AE-5 | **One form of approval record** for specs, governed lists, schema versions and accepted gaps: `kind`, `framework`, `id`, `binds` (the module or view owner, where the subject has one), `content_hash` and `hash_method`, `schema` (version and hash, where it has one), `run` (runner and version, outcome, the digest of the verdicts with their kinds, and the checks not run), `seq` (per subject), `authority`, `scope` (the repository, or a hub), `signature`. The signature (`ssh-keygen -Y sign`, namespace `forge-approval`) covers the canonical form of every other field, read strictly. |
| AE-6 | **The record lives beside its subject**: `<name>.approval.json` next to a spec or list, next to a frozen schema version; inside its entry for an accepted gap. A new kind in the closed set. Only the approve command writes a record. |
| AE-7 | **The integrity block stays and holds only** the hash, its method (one name, one code path) and the schema version and hash the spec is written against. `hash_state`, `approved_by`, `approved_at` and `change_history` leave it. A spec with a block is still stamped (F-9) and its hash still checked by the hub. The hash is unchanged by this, since the block is outside it. |
| AE-8 | **The owner's keys are a contract file** (`forge-core/contract/authorities.json`): a `version`, and each key with its id, its OpenSSH public key, what it may approve (Forge's own specs, lists, schema versions, gaps), and whether it is current. A change to the file needs a record signed by a key the file already holds as current, and its `version` goes up. It holds no hub's key; a hub's approvers are in that hub's store, certified by its parent (D-1 R-8), built with D-18 admission. |
| AE-9 | **No rule depends on a time a signer writes.** A key that is not current signs nothing that counts. Rotation adds the new key, re-signs every current approval with it, and retires the old one in the same change; a compromise retires it at once, and the owner re-signs what should stand. |
| AE-10 | **Nothing goes backwards.** A subject's record carries `seq`, one more than its last; the gate compares with `main` and refuses a lower `seq`, or a record removed while its subject stays; the authorities file's `version` may not go down. A hub keeps the highest it has seen. Going back to an earlier content is a new approval of it, with a new `seq`. |
| AE-11 | **Approving runs the framework first**, with the approval-dependent checks set aside (`hash-approved`, and the approval condition of `fmts:waivers`); the approval is refused unless the gate would let that run through. The record names every check that did not run and the gap that covers it. |
| AE-12 | **An approval counts only if**: its signature verifies against a key the authorities file holds as current for that kind; its `content_hash` is the subject's hash now; its schema version and hash are the spec's and the released file still hashes to them; its `binds` is the subject's; its `seq` is not below `main`'s; and its run was let through. Otherwise `<fw>:hash-approved` fails, naming which condition broke. |
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
3. **Every verdict any runner gives matches a declared check and names its kind of evidence.**
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
| C-6 | No time in any rule | A signer writes the time; ordering comes from `seq` and the authorities `version`. |

## 10. What only the owner decides, one at a time

| # | Question | Claude's recommendation |
|---|---|---|
| Q-1 | **Answered 2026-11-24.** The owner: "option 1 is fine, but I am not concerned about this issue. Unless its necessary I would perfer to not waste time with it." So step 3 does not wait on FB-288: the signed approvals it builds are tamper-evident and traceable, and that an agent running as the owner could reach the owner's key is a risk the owner accepts. FB-288 stays open, low, with option 1 as its fix when it becomes necessary. The question as put: how coding agents are kept from acting as the owner: on GitHub (their own identity that cannot approve, merge or push to `main`; `enforce_admins` on) and on the machine (no reach to the owner's signing key or login). | Both. On GitHub: a machine identity for the agents, and `enforce_admins` on. On the machine: the signing key where no process running as the agent's user can use it. Without this, step 3 gives tamper-evidence, not proof of the owner. |
| Q-2 | Where the owner's signing key lives. | A hardware security key, loaded in no agent; or a key file held by an OS user the agents do not run as. Not in the agent's ssh-agent, not with its passphrase in the keychain. |
| Q-3 | Whether the same key also signs git commits. | Not the same key: a commit signature and an approval would then ask for the same confirmation, so one could be passed off as the other. |
| Q-4 | The D-14 amendments: F-4 (the block keeps the hash and the schema; the approval is a record), F-11 (every verdict names its evidence), F-12 (every claim has a check of the real thing or an accepted gap). | Accept the three. |
| Q-5 | The `owner-approval` hard limit gains `governance:gap:approve` and `governance:authority:change`, and states it covers Forge's own artifacts (with FB-261). | Accept; a list release. |
| Q-6 | The record's form as a governed schema, approved like the others. | Accept. |
| Q-7 | `cryptography` as a direct dependency (it is installed now only through `pyjwt[crypto]`). | Accept; it is D-1's "cryptography library, confirmed with the owner" (`roles.md:215`). |
| Q-8 | The one signing session: every approval re-signed once (about 93 today, about 145 once step 2 adds its gaps and schema versions). | Accept; the list is shown before signing, and nothing is signed that the gate would not let through. |

## 11. What this does not decide

How approvals and the owner's keys travel to hubs (FB-232), the role that may approve on a hub (FB-189), what a cut-off hub may approve (D-17 §11.5, not signed), and FHTS's future (FB-279).
