# Approval signing for a production beta — design record

**Status: approved by reh3376 on 2026-11-25 as D-20** (its questions answered one at a time: Q-A by re-framing, Q-B by removal, Q-C to Q-G; then, asked whether the record is signed: "Sign it"). It is the signing chapter of the security framework (`security-framework.md`, D-21), whose rules win where the two differ; freshness is D-21 §14. Nothing is built yet. Before signing: **Status: PROPOSED, not signed; re-framed by the owner 2026-11-24.** Asked Q-A (who co-signs the root), the owner answered: "This framework will become enterprise software. This is no way to instantiate roles in a prod environment. We can set temporary development creds up that would only include myself and potentially a couple of collaborators if I hire them, but why waste time on that we we should build the full security framework out and use in in dev mode then when it can be switched to its default state when placed in prod mode." So who may approve, co-sign or hold a key comes from the security framework (identities, credentials, roles and scopes as data; `permissions-framework.md`, FB-189, FB-254), run in development as data on that framework, with production its default state; the thresholds of SG-1 to SG-3 become policies on the approval scopes, and this record becomes the security framework's signing chapter. §12 Q-A is answered by that; Q-B to Q-G wait for the framework's record. Second draft, 2026-11-24, on the owner's `+design` at gate 1 for D-19 step 3, after the owner asked why approvals should rest on "such a temp means" when Forge is building towards a production beta. The first draft was attacked by three adversaries (cryptography and protocol; operations and regulation; fit with Forge's signed records); every finding they proved is folded in (§7). It amends D-19 (`approvals-and-evidence.md`) where §11 says; nothing here is decided until the owner answers §12 and signs.

Marks: **[OWNER]** the owner's words or decision · **[FACT]** verified, with the source · **[PROPOSED]** Claude's proposal · **[OPEN]** a question for the owner.

## 1. The problem

D-19 makes every approval of Forge's own artifacts (specs, governed lists, schema versions, accepted gaps) a signed record, and step 3 began building it with one key used from the owner's machine. The owner, 2026-11-24: "tying this to my machine is ok during development, but its not way to implement a long term prod ready solution. Why use such a temp means when we should be building towards prod beta release?"

Production needs two kinds of approval, at two levels of authority:

1. **The vendor's release approvals.** Forge's own artifacts are what every customer's hub runs. Each hub must verify, offline and for weeks at a time, that what it runs came from the vendor unaltered and is current.
2. **A deployment's own approvals.** Under A-19 most of what a plant runs is built on site in the designer. An engineer approves that a version may run; in regulated plants this is an electronic signature under 21 CFR Part 11 and EU GMP Annex 11. D-17 §11.2 makes forge-core the one place a deployment's administrative changes are made and distributed.

A design right for the beta has no single key and no single machine as its root, never lets anyone but the owner approve the vendor's artifacts (the `owner-approval` hard limit), survives the loss of a device, keeps a cut-off hub verifying offline, lets a hub tell a current approval from a withheld, replayed or forged one, keeps every approved version a plant may roll back to, keeps every signature for the record's retention period, and carries deployment approvals in the same form.

## 2. What is already decided

- **[OWNER]** D-19 is signed (2026-11-24) with §12 (S-1 to S-8); its records, laws and evidence rules stand except as §11 amends them. Q-2 (a hardware key "during development"), Q-3 (a separate approvals key), Q-5 to Q-8 are answered (D-19 §10).
- **[OWNER]** The `owner-approval` hard limit (`forge-core/contract/lists/hard-limits.list.json`): nobody but the owner approves a spec hash, a schema version, a governed list or an accepted gap, or changes the owner's approval keys. CLAUDE.md says the same.
- **[OWNER]** Agent separation is not a concern (FB-288): what rests on the owner's key is tamper-evident, not proof against an agent running as the owner; this record says so wherever it matters.
- **[OWNER]** One clock: the top hub is the time authority, every stored time is UTC, time checks fail closed (`one-clock-ot-source-time.md`). D-13 Q-8: rollback is promoting the previous approved version. D-18 AD-4, AD-10, AD-14: a hub runs only promoted versions, refuses an unmarked development artifact on a production hub, and knows the hashes it runs.

## 3. What exists (grounded 2026-11-24)

- **[FACT]** Built in this branch, not merged: the record, session and authorities forms and a pure-Python verifier (`forge_core/fxts/shared/approvals.py`) with laws 1 and 2 of D-19 checked; the identity rule in the foundation (`forge_core/fxts/identity.py`); the approval forms' schema v1.0.0; half of the readers' migration (paused, saved in the session's scratch folder). The adversaries proved faults in it that this record's rules remove (§7, F-1 to F-4, F-12).
- **[FACT]** `main`'s protection: one approving review, stale reviews dismissed, force pushes and deletion refused, four required checks, signed commits not required, `enforce_admins` off. An admin can merge without review.
- **[FACT]** How bundles reach a hub (FB-232), the hub's approver store (FB-189) and the permissions framework (FB-254, `permissions-framework.md`, proposed) are not decided.

## 4. What the research found

**Supply chain** (The Update Framework spec 1.0.37; Uptane PURE-2 and best practices; Sigstore; in-toto). D-19 as signed covers arbitrary content and rollback of a record a hub has seen. It leaves open: **mix-and-match** (nothing signed lists the current set; TUF §2.1.3), **freeze** (no freshness; TUF §4.3), **key compromise** (any one current key can sign the next authorities file; TUF §2.1.1), **fast-forward** (TUF §5.3 step 11) and **endless data**. TUF's freshness needs an online timestamp key a cut-off hub cannot reach; Uptane's PURE-2 gives offline updates long-lived roles and checks "the most recent securely attested time", accepting that revocations arrive when a device reconnects. `python-tuf` 7.0.1 has no signer for FIDO keys and adds two dependencies. The research recommends borrowing TUF's rules into D-19's own format.

**Electronic signatures** (21 CFR Part 11, its 1997 preamble, FDA guidance 2003 and 2024; Annex 11 2011 in force and the 2025 draft). Part 11 binds records a predicate rule requires (pharma, devices, supplements §111.605(c), juice HACCP §120.12(g), low-acid foods); FSMA preventive-controls and traceability records are exempt (§11.1(i), §117.305(g), §1.1455(e)); Part 117 does not apply to alcoholic beverages (§117.5(i)). Part 11 anticipates tokens (§11.300(c),(e)); *interpretation:* a username plus a hardware key with a PIN at every signing meets two distinct components (§11.200(a)), a touch-only key does not, a device fingerprint tells the hub only that someone enrolled was verified (§11.200(b)), and a synced passkey can be copied. A signature shows name, date and time and meaning (§11.50) and is linked to its record (§11.70); UTC is accepted with the reference documented. Records stay retrievable for their retention period (§11.10(c)); audit trails do not obscure earlier entries (§11.10(e)). The Annex 11 2025 draft adds full re-authentication at each signing (13.3), "token or smart card alone is not sufficient" (11.3), role and time zone shown (13.6), a changed signed record shown unsigned (13.8).

**FIDO2** (OpenSSH `PROTOCOL.u2f`, `PROTOCOL.sshsig`; W3C WebAuthn Level 3).
- **[FACT, by experiment]** An OpenSSH security-key signature and a WebAuthn assertion are the same construction (`application or site hash || flags || counter || hash of the message`); one verifier core served both, in Ed25519 and P-256.
- **[FACT, read from the library on the owner's Mac]** Apple's `/usr/lib/ssh-keychain.dylib` cannot serve: its enrolment is a stub that answers "not supported", it signs only with keys held by the Mac, it writes the touch and PIN flags from stored settings, and its counter restarts in every process. A FIDO2 key needs a `libfido2` provider (§12, Q-F).
- **[FACT]** `ssh-keygen -Y verify` only logs the flags; Forge's verifier must enforce them. A resident key's files can be recreated on another machine (`ssh-keygen -K`, with the PIN); the private key cannot be exported, so a lost device loses the key.
- **[FACT, proved by the adversary]** The flags are only as good as the hardware: a software key can set touch and PIN flags and pass a verifier. Only attestation at enrolment shows a key lives on genuine hardware.

## 5. Two shapes

| | A. TUF's metadata | B. D-19's records with TUF's rules |
|---|---|---|
| Root of trust | TUF root role, threshold | numbered authorities files, each signed by a threshold of the previous root keys including the owner's |
| Current set | targets, snapshot, timestamp roles | one signed, numbered release manifest per approval act |
| Freshness | an online timestamp key, or PURE-2 workarounds | an expiry with a cap set by the root, checked at import against attested time |
| Deployment approvals | outside TUF | the same forms, under a deployment authority held by forge-core |
| Dependencies | `python-tuf`, `securesystemslib`, a custom FIDO signer | none new |
| Who writes each piece of state | snapshot and timestamp rewritten by every change, by an online key | root holders write authorities files; the approve command writes records and the next manifest, one act at a time |

**[PROPOSED] Shape B**, for one writer per piece of state, offline verification without an online key, deployment approvals in the same form, and nothing to install. The one shared, serialized target is the manifest, whose single order is the invariant it exists for (principle 10).

## 6. The design

**Authorities and keys**

| # | Rule |
|---|---|
| SG-1 | **Two roles of key, both on hardware.** *Root* keys sign only authorities files. *Release* keys sign approval acts. Every key is a FIDO2 credential resident on its device, demanding a PIN at every signing, and enrolled with an attestation that it lives on genuine hardware, checked in the root ceremony; two keys on one device count as one (distinct key material, distinct attested devices). For the vendor, every release key is the owner's (the hard limit), on at least two devices, one kept apart. |
| SG-2 | **The authorities files move only forward, and only with the owner.** `forge-core/contract/authorities/<N>.json`, append-only, never edited or deleted. Version N+1 is exactly N+1 and is signed by the owner's root key plus a threshold of version N's other root keys, counted by distinct key material, and by the same of N+1's keys; it is verified against N's key material, never against keys N+1 introduces. No release key can change it. The owner's key is always required, so the co-signers can help rotate or recover keys but can never approve or add an approver without the owner. |
| SG-3 | **The root is pinned and staged.** The first authorities file (genesis) is pinned out of band: CI pins `main`'s genesis, and each hub release ships with the genesis it trusts. Each file carries a signed `stage`, `development` or `production`. A production hub refuses any chain whose files are not all `production` (as D-18 AD-10 refuses a development artifact). Production starts from its own production genesis; a development chain is never rotated into production. |

**Approval acts**

| # | Rule |
|---|---|
| SG-4 | **One manifest per approval act, signed once.** The approve command writes the next release manifest, `forge-core/approvals/manifests/<N>.json`, append-only: its number, the authorities version it was signed under, an expiry, and for every subject the set of record hashes approved for it, with explicit withdrawals. Re-approving a subject adds a hash; it never removes an older one, so every approved version stays available to promote (D-13 Q-8, D-18 AD-14). A withdrawal is an explicit act. One touch and one PIN sign the manifest. It replaces D-19 step 3's session (D-19 §13 T-1). |
| SG-5 | **Which manifest is current.** Manifests are ordered by the pair (authorities version, manifest number). A hub keeps the highest pair it has accepted and refuses anything lower. Two different valid manifests with the same pair are both refused and raise an alarm on status. A root rotation may reset the manifest number only to the last legitimate number the new authorities file names. |
| SG-6 | **A record counts only if the current manifest lists its hash for its subject and has not withdrawn it**, and every condition of D-19 AE-12 holds. Which listed version a hub runs is the hub's promotion (D-18). Records are compared with `main` by subject, never by file path. |
| SG-7 | **Every signature is kept.** A subject's records are append-only (`<name>.approval.<seq>.json`); re-approval adds a record and never overwrites one (Part 11 §11.10(e)). A retired key's past signatures stand (§11.10(c)); a key reported compromised stops counting from the point the issuing authority records it (for the vendor, the authorities version that retires it; at a plant, the hub's own audit-trail sequence), never from a time the signer wrote. |

**Time**

| # | Rule |
|---|---|
| SG-8 | **Time enters one rule: import.** A manifest's `expires` may not exceed the cap the authorities file sets (`max_validity`). When a hub imports a bundle it checks the expiry and the cap against its attested time: the later of its own clock and the highest top-hub time it has recorded, refusing a clock that has gone below that mark. Expiry never stops a hub running what it has: the hub shows "approvals stale since <date>" on status, health, API and CLI, and refuses an expired bundle. A hub rebuilt after expiry may import its last bundle only on a signed acceptance by its deployment's authority, shown on every surface. CI checks only that an expiry is present and within the cap; it never compares with a clock, so a commit gives the same answer on any day. C-6 otherwise stands. *Amended 2026-11-25 by the owner (D-21 §14): no expiry and no cap; freshness is D-21 §14's nonce-bound exchange.* |

**Signatures**

| # | Rule |
|---|---|
| SG-9 | **Schemes are data, checked strictly.** Every signature names its scheme, `sshsig-sk` or `webauthn`, and its algorithm, Ed25519 or P-256, taken from the enrolled key, never from the signature. One FIDO core checks the application or site, the touch flag, the user-verification flag, that the backup flags are clear (no synced credential), the WebAuthn type, challenge, origin and `crossOrigin` exactly, low-S for ECDSA, and the counter rising per credential where the authenticator keeps one. Every byte is parsed strictly: base64 validated, no trailing data, every decode error a named refusal. A plain key without hardware attestation is not accepted for an approval. |
| SG-10 | **Every approval says who and what it means.** The record carries the signer (id, printed name, role), the meaning from a governed list (`released` for the vendor; `authored`, `reviewed`, `approved`, `accept-expired` in a deployment) and, in a deployment, the hub's UTC time; the signature covers all of it (§11.50, §11.70; Annex 11 §14). |
| SG-11 | **Limits.** Each file has a size cap and each manifest an entry cap; past them it is refused unread. A manifest's verdict is computed once and cached by its hash, and its entries are indexed by subject. |

**Deployments and the repository**

| # | Rule |
|---|---|
| SG-12 | **A deployment's approvals use the same forms under its own authority**, held by forge-core (D-17 §11.2) and distributed to its hubs: its own authorities files, root threshold, manifests and expiry cap. Its approvers enrol passkeys with attestation from an allow-list that excludes authenticators letting several people enrol a fingerprint; each signing asks for the approver's password checked by the hub and the passkey with user verification (two components at every signing; Annex 11 draft 13.3); the approver is not the author; ids are never reused; tokens are tested periodically; enrolment, signing, refusal, retirement and compromise go to an append-only audit trail in hub UTC. Built with FB-189, FB-232 and FB-254. |
| SG-13 | **The repository guards its own history.** On every push to `main`, the gate compares with the previous head: authorities files, manifests and records may be added, never changed or removed. A release bundle's manifest names the digest of the hub release that verifies it. The record states the residual risk plainly: an admin can merge without review while `enforce_admins` is off (§12, Q-G), and an agent running as the owner could reach a key file but not a key on a device without the owner's touch and PIN. |

## 7. What the attack found, and where each went

| # | Finding (proved by) | Severity | Where |
|---|---|---|---|
| F-1 | The built code let a new authorities file keep a key's id and swap its key, then sign itself (`adv-crypto/a1_authorities_takeover.py`) | breaks a law | SG-2: verify against N's key material |
| F-2 | Rollback by renaming a record's file (`a2_rollback_by_rename.py`) | breaks a law | SG-6: compare by subject |
| F-3 | Malformed signatures crashed instead of naming a cause; trailing data and junk base64 counted (`a3_malformed.py`) | weakens | SG-9: strict parsing |
| F-4 | Verification cost grew with the square of a session's size (`a4_verify_per_record.py`) | weakens | SG-11 |
| F-5 | The prototype accepted a synced passkey, a wrong origin, a malleable ECDSA signature and a falling counter (`a5_prototype.py`) | weakens | SG-9 |
| F-6 | Thresholds counted by key id; one holder with two ids met two of three (`a6_proposal_model.py`) | weakens | SG-1, SG-2: distinct key material |
| F-7 | Nothing anchored the genesis (`a6_proposal_model.py`) | weakens | SG-3 |
| F-8 | A floor reset re-admitted an old manifest (`a6_proposal_model.py`) | weakens | SG-5 |
| F-9 | Two holders other than the owner could add a release key, against the hard limit (fit review; `adv-ops/rules_model.py`) | contradicts a signed record | SG-1, SG-2: the owner always required |
| F-10 | One record per subject withdrew the versions plants run and forbade rollback (fit and operations reviews) | contradicts D-13 Q-8, D-18 AD-14 | SG-4, SG-6 |
| F-11 | The signer wrote the expiry; a stolen key could set the year 9999 (`rules_model.py`) | weakens | SG-8: the cap |
| F-12 | A software key with touch and PIN flags passed the built verifier (`adv-ops/sw_sk_flags.py`) | weakens | SG-1, SG-9: attestation |
| F-13 | Revoking an approver voided their past signatures, against retention (operations review) | breaks Part 11 §11.10(c) | SG-7 |
| F-14 | A cut-off hub has no top-hub clock; a clock set back admitted an expired bundle; a rebuilt hub could not start (`rules_model.py`) | breaks the design's purpose | SG-8 |
| F-15 | Deleting the newest manifest left the previous one valid (`rules_model.py`) | weakens | SG-13 |
| F-16 | CI compared expiry with its own clock: the same commit passed or failed by the day (fit review) | weakens | SG-8 |
| F-17 | Deployment approvals had no manifest, threshold or expiry (fit review) | weakens | SG-12 |
| F-18 | The development root was a switch with no law and no enforcement point (fit and operations reviews) | weakens | SG-3, law 2 |
| F-19 | The record file was overwritten on re-approval (operations review) | breaks §11.10(e) | SG-7 |
| F-20 | Gaps against Part 11 and Annex 11: two components at each signing, shared fingerprints, ids never reused, token testing (operations review) | weakens | SG-12 |

The proof scripts are in the session's scratch folder (`adversary_proofs/`); each finding becomes a test of the build, run against the real code, before it is claimed fixed. What held: thresholds counted by key material; the manifest stops mix-and-match; refused namespaces, untouched keys, non-canonical Ed25519, type confusion, unknown hashes, records copied to another subject or naming another session; refusing synced passkeys can be enforced through the backup flags.

## 8. The cases

1. **Scale.** A manifest lists every subject's approved hashes; one verification per manifest, cached; caps bound what is read.
2. **Change while in use.** A hub on manifest N keeps running its promoted versions; N+1 adds approvals without withdrawing the old ones; promotion is the hub's. A root rotation reaches a hub only through the owner-signed chain.
3. **A hub cut off.** It verifies offline, keeps its attested time, cannot learn of a revocation until it reconnects (accepted, as in PURE-2), shows staleness after expiry, and keeps running.
4. **No person acting.** CI and hubs only verify. Every signature needs a person's PIN on an attested device; the root needs the owner plus co-signers. An agent running as the owner cannot use a device key without the owner's touch and PIN.
5. **Failure and recovery.** A declined or timed-out signature writes nothing. A lost release key: the owner's backup device signs the next manifest; the root retires the lost key. A compromised release key: the root retires it, the floor is reset to the last legitimate manifest, and the owner re-approves. A lost root key: the owner and the remaining co-signers rotate it. The owner's own root key lost: recovery needs the owner's backup root key (§12, Q-A).
6. **Renaming and migration.** Records name subjects by identity; the migration is manifest 1 under a development genesis; production starts from its own genesis.
7. **Before it is complete.** In the repository, step 3 builds SG-1 to SG-11 and SG-13 for the vendor's approvals under a development genesis; a production hub refuses it (SG-3). SG-12 and a hub's import are built with FB-189, FB-232 and FB-254.
8. **The wrong thing.** Everything F-1 to F-20 names is refused. Still possible: the owner and co-signers colluding; the owner signing without reading (the act shows every subject and hash first); an admin merging without review while `enforce_admins` is off.
9. **What it pins.** The roles, the threshold rule, the manifest and the schemes are versioned data in the governed forms schema; a scheme or a meaning is added without migrating records.
10. **How it is known to hold.** §9.

## 9. Laws

1. **A record counts if and only if** the current manifest lists its hash for its subject without withdrawing it, and every condition of D-19 AE-12 holds (extends D-19 law 1).
2. **An authorities file counts if and only if** it is the pinned genesis, or it is exactly one more than an accepted file and is signed by the owner's root key and a threshold of the previous file's other root keys and of its own, counted by distinct key material and verified against the previous file's keys; and a production hub accepts only a chain staged `production` throughout.
3. **No manifest is accepted below the highest (authorities version, manifest number) already accepted; of two different manifests with the same pair, neither; and none past its expiry or its cap at import** (unless a deployment's signed acceptance of an expired bundle names it).
4. **A signature counts only if** it parses strictly, its touch and user-verification flags are set and its backup flags clear, it is for Forge's application or site, its scheme and algorithm are the enrolled key's, ECDSA is low-S, and the counter has risen where kept.
5. **Expiry never stops a hub running what it has.**
6. **A record, a manifest or an authorities file, once on `main`, is never changed or removed; a retired key's past signatures still count.**
7. **In a deployment, an approver never approves what they authored.**
8. **No file past its cap is read.**
9. D-19 laws 2 and 4 stand.

Each gets an exhaustive check on the real code, a broken variant shown caught (the adversaries' scripts among them), and the `verify-fxts-approvals` skill.

## 10. Building order

1. **Step 3 (now, one pull request):** the authorities files with SG-1 to SG-3 under a development genesis; the manifest (SG-4 to SG-7); the import rule's checks that CI can make (SG-8's cap and presence); the strict verifier for both schemes (SG-9) and the record's signer and meaning (SG-10); the caps (SG-11); the repository guards (SG-13); the approve command; the readers; the migration as manifest 1; every law of §9 that applies to the repository. The paused work is resumed against these rules; the faults F-1 to F-4 and F-12 are removed by them.
2. **The production genesis**, when the owner's co-signers and devices exist (§12, Q-A).
3. **A hub's import and attested time** (SG-8 on hubs), with D-18's build and FB-232.
4. **Deployment approvals** (SG-12), with FB-189, FB-232 and FB-254.

## 11. What it changes in D-19

AE-8 (one authorities file; any current key) is replaced by SG-1 to SG-3; AE-9 is amended by SG-7 (retired and compromised differ); AE-10 by SG-5 and SG-13; AE-12 by SG-6 and SG-9; C-6 by SG-8 (time enters the one import rule, through attested time); §13 T-1 (the session) is replaced by SG-4, and T-2 (an ordinary key verifies the same way) by SG-9. The `owner-approval` hard limit is kept, not amended: SG-2 makes the owner's key required for every root change.

## 12. What only the owner decides, one at a time

| # | Question | Recommendation |
|---|---|---|
| Q-A | Who co-signs root changes with you, and how many must. | You plus one of two co-signers you trust, in different places, each with their own attested key; your own second (backup) root key kept apart. Until the co-signers exist, the development genesis is you alone on two devices, staged `development`, which no production hub accepts. **Answered 2026-11-24 by re-framing (see the status line): holders come from roles in the security framework, not from names in this record.** |
| Q-B | The cap on a manifest's validity. | One year; the approve command offers the cap and the owner may choose less. **Answered 2026-11-25 by removal: no cap; freshness is D-21 §14.** |
| Q-C | Whether deployment approvals are built to Part 11 and Annex 11. | Yes: one path that serves pharma and costs food and spirits plants nothing. **Answered 2026-11-25: "Build to Part 11".** |
| Q-D | Amend C-6 so time enters the one import rule, through attested time (SG-8). | Accept. **Answered 2026-11-25, re-framed by D-21 §14: "Accept": rules use only ages on a hub's own monotonic clock and attested time from the time authority's signed, nonce-bound exchange; never a time a signer writes.** |
| Q-E | Two approvals devices now (primary and backup). | Yes, both attested and enrolled before manifest 1 is signed. **Answered 2026-11-25: "Yes, two keys".** *Noted 2026-11-25 (D-23 Q-1): the development authorities are three keys, any two required (D-21 §10 as amended); SG-1's "at least two devices, one kept apart" and SG-2's owner-required rule stand.* |
| Q-F | Install a `libfido2` provider for OpenSSH on your Mac. | Homebrew's `openssh-sk-provider`, named by `SSH_SK_PROVIDER` for the approve command only; the system `ssh-agent` is never used for approvals. **Answered 2026-11-25: "Yes, that package" (`openssh-sk-provider`, installed by the owner when the developer's ceremony is built).** |
| Q-G | Turn on `enforce_admins` for `main`. | Yes before the beta: without it an admin's merge bypasses review, which the manifest's signature exposes but does not prevent (you said in FB-288 this is not a concern now; this asks only for the beta). **Answered 2026-11-25: "On before the beta" (FB-294).** |

## 13. What this does not decide

How bundles travel to hubs and when a hub imports (FB-232); the hub's approver store and screens (FB-189, FB-181, FB-254); a public append-only log of manifests (Sigstore's Rekor), worth revisiting after the beta; in-toto attestations by CI that the gate ran.
