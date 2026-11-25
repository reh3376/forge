# The trust root and identities (D-21 step 1) — design record

**Status: approved by reh3376 on 2026-11-25 as D-23** (the owner answered Q-1 to Q-9 one at a time, then, asked whether the record is signed: "Sign it"). It amends D-21 §10, SF-2 and §11 and notes D-20 Q-E, each with a dated note there (§9), and answers D-17 C-6. Nothing in it is built yet; T-11 is the order. Before signing: **Status: PROPOSED, not signed.** Second draft, 2026-11-25, on the owner's `+design` at gate 1 for D-21's first build step (FB-293). The first draft was attacked by three adversaries (cryptography and custody; ceremonies, operations and regulation; fit with Forge); every finding they proved is folded in (§8). It builds within D-21 (`security-framework.md`), D-20 (`approval-signing.md`) and D-22 (`permissions-framework.md`); it answers D-17's open question C-6, and where the attack showed a signed rule cannot hold as written it proposes an amendment, named with the rule it changes (§9), each on the owner's word. Nothing is decided until the owner answers §10 and signs.

Marks: **[OWNER]** the owner's words or decision · **[FACT]** verified, with the source · **[PROPOSED]** Claude's proposal · **[OPEN]** a question for the owner.

## 1. The problem

D-21 §11 step 1: the anchor, the certificate authority and identities; the development anchor and genesis ceremony, forge-creds' first form, the identity store and enrolment (two-person rules, attestation), as forge-core's first manager function. Every key lives in hardware even in development, development differs from production only in data, and the owner enrols through the real path. **[OWNER] 2026-11-25:** "I do not want to be locked into a service I have to pay for … I will leave this decision up to you because you have all the necessary context to make it" (the hardware).

## 2. What exists (grounded 2026-11-25)

- **[FACT]** No manager, certificate authority, identity store, key or enrolment code. forge-core's Go module has `forged` and `forgectl` stubs that only start and exit; the hub is Python, one image carries every package root (`deploy/docker/Dockerfile.forge`), migrations are Alembic in the hub's storage, there are no Kubernetes manifests. Anything under `forge_core/` is the foundation and may import nothing of the hub (`tests/test_layer_imports.py`); the manager's layer is D-17's open C-6.
- **[FACT]** The owner's Mac: Go 1.26.1, Python 3.14.3, Swift, OpenSSL 3.6.3; no `ykman`, `ykcs11`, `yubico-piv-tool`, OpenSC, SoftHSM, `step`, SPIRE or Vault; CryptoTokenKit carries the PIV and CCID drivers. Docker Desktop on a Mac cannot pass a USB device to a container.

## 3. What the research and the attack found

**Custody.** A YubiKey 5's PIV applet generates P-256/P-384 keys on the device, attests them through slot `f9` to Yubico's PIV CA, never exports them, and is untouched by a FIDO2 reset; but a PIV reset needs only the PIN and PUK blocked (no touch, no management key), the default touch policy is "never", the `f9` key can be replaced with the default management key, and firmware 5.7.4+ chains through intermediates to a new root. YubiHSM 2 (bought once, US$650; FIPS edition $950) is a PKCS#11 HSM that attests the keys it generates and backs them up M-of-N, wrapped; it is reached through Yubico's connector, an untrusted transport, so a container can use it where it cannot use a USB key; an authentication key can be limited to signing with its own keys; its software is Apache 2.0 for macOS and Linux. A TPM fits a host's keys; the Secure Enclave is not attestable without device management; a cloud KMS cannot sign while a plant is cut off. **Python's `cryptography` 50.0.2 signs a certificate with a key held elsewhere** (`CertificateBuilder.sign` calls a custom key's `sign()`; the certificate verified), so the issuer can be one Python library; one PKCS#11 interface reaches a YubiKey (`ykcs11`), a YubiHSM 2, a TPM (`tpm2-pkcs11`) and SoftHSM in CI.

**Certificates.** Go's `CreateCertificate` signs a sub-CA under a `pathlen:0` parent and a CA-capable leaf for another deployment; URI name constraints match only the host, and `cryptography` refuses every chain that carries one while Go accepts it; Go's default verification refused a correct client-auth leaf. The issuer must check its own profile before signing, and both verifiers must check the issuer-under-identity rule in their own code, from one written profile.

**Credentials.** OpenSSH's `-O write-attestation` holds the leaf attestation certificate, the signature and the authenticator data; it is verifiable only with `-O challenge=<nonce>`. A genuine attestation can be paired with a different software key unless the attested COSE key is matched byte for byte to the `.pub` enrolled, and a nonce accepted twice was accepted. Accept `packed` with a chain, BE=0, UV, `credProtect=3`; exclude biometric models (metadata cannot tell whether several people enrol fingerprints); FIDO's metadata may not be redistributed and carries no FIPS 140 status; Ed25519 is not approved under FIPS 186-4.

## 4. Two shapes

| | A. Adopt step-ca | B. A small issuer of Forge's own, one Python library over PKCS#11 |
|---|---|---|
| Hardware keys | its HSM build | one PKCS#11 path for YubiKey, YubiHSM 2, TPM and SoftHSM |
| Forge's certificate rules | policy around a product with its own state | written directly, one owner per piece of state |
| Who issues | step-ca, plus each hub | the manager and each hub through the same library |

**[PROPOSED] Shape B.** One issuer library, used by the manager (certifying hubs' intermediates) and every hub (issuing its leaves), on one device interface: one path, no mode by stage.

## 5. The design

**Keys and their roles**

| # | Rule |
|---|---|
| T-1 | **Two separate roles of root.** The *authorities* (who may change the anchor and approve) are the owner's FIDO2 credentials, exactly as D-20 SG-1 and SG-9 say (`sshsig-sk`, Ed25519 or P-256). The *certificate roots* (which sign hubs' intermediates) are X.509 keys on separate devices, listed in the anchor with their attestation; they sign nothing else, and an intermediate counts only if the current anchor, signed by the authorities' threshold, lists its key. A single certificate root can therefore mint nothing that counts. |
| T-2 | **Hardware, bought once.** Development: three YubiKey 5 keys and one YubiHSM 2. **A** is the owner's daily authorities credential (FIDO2); **B** (kept apart) and **D** (kept offline, in a safe) are authorities credentials too, and each also carries one certificate root (PIV). The authorities' threshold is 2 of A, B and D, so a lost key is recoverable and one stolen key is not enough. The **YubiHSM 2** holds the development deployment's online keys: the manager's distribution-signing and freshness keys, and the development hub's intermediate, token-signing and audit-signing keys. Production: two YubiHSM 2 units hold the certificate roots, offline, with M-of-N wrapped backup; each hub has two intermediates on two attested devices (its host's TPM and a YubiHSM 2, or two hosts), so a failed node does not stop issuance; the development deployment records its one device as unmet, shown on every surface, as it does separation of duties. A module's certificate key is in its host's TPM where it has one; on a host without one it is a software key, as SF-1 allows: short-lived, marked unattested in its certificate, and refused where the policy says so. A cloud KMS may be an optional adapter, never a requirement. FIPS editions where a deployment's policy names Part 11 or Annex 11. |
| T-3 | **Every key generated on its device and attested; the devices set up first.** The ceremony sets each YubiKey's PIN, a random PUK and a random management key (held off the host, the management key PIN-protected on the device), and touch policy "always" and PIN policy "always" on the certificate roots. On the YubiHSM 2 it replaces the factory authentication key and gives each service its own authentication key that may only sign with that service's keys (capability `sign-ecdsa`, delegated capabilities none, one domain per service). Every key's attestation is read and kept with its certificate (YubiKey PIV `f9`, YubiHSM 2 attestation, TPM2_Certify); a key without one, or whose attestation does not show those policies, is refused, in development too. The PIV, YubiHSM and TPM attestation roots and intermediates are a governed list, `device-attestation-roots`. A falling PIN or PUK retry counter, or a failed authentication on the YubiHSM 2, raises an alarm. A service's device credential comes from its environment, so a process running as that service's user can sign as it (FB-288's accepted risk, stated). Yubico's documentation disagrees on whether any authentication key can reset a YubiHSM 2 (the reset guide needs `reset-device`; the command reference says any key); the ceremony tests it on the real device and records the result, and a wiped development device is recovered by generating its keys again and certifying them with B or D. |
| T-4 | **One certificate profile, written once.** Path length, key usage, explicit extended key usage (server and client auth), lifetimes capped by the anchor's policy (never chosen by the signer), ids `spiffe://<deployment>/hub/<id>/module/<id>`, and no name constraints. The issuer checks every certificate against the profile before signing; the Python and Go verifiers check the issuer-under-identity rule in their own code; test vectors are generated from the profile, so they cannot drift from it. |

**The service and its data**

| # | Rule |
|---|---|
| T-5 | **The manager is a Python service, `forge_manager`, its own layer**, above the hub in the chain of command (D-17 C-1): it imports only the foundation, `forge_core`, and reaches hubs over the link, never by importing them; nothing imports it (answering D-17 C-6; the layer test gains it). The issuer library lives in `forge_core` (the foundation), so the manager and the hubs issue with the same code, and enrolment's attestation check is D-20 SG-9's one FIDO core, not a second one. The manager has its own image stage and its own Postgres database with its own migration chain. Device access is PKCS#11 everywhere (`python-pkcs11`): `ykcs11` for YubiKeys, YubiHSM 2's module, `tpm2-pkcs11`, and SoftHSM in CI. **[FACT]** On the repository's `cryptography` 50.0.2, `CertificateBuilder.sign` called a key object's external `sign()` and the certificate verified (run 2026-11-25). |
| T-6 | **The identity store is an append-only log** of events (created, credential enrolled, credential retired or reported lost, replaced, tested, deactivated, granted, revoked), each with who acted, who checked identity and when (hub UTC); the current state is derived from it (D-21 §14 FR-2, FR-4; Part 11 §11.10(e), §11.100(b), §11.300(c),(e); Annex 11 §12.3). A token is tested on a policy schedule. |
| T-7 | **The anchor at genesis holds everything a later step needs**: the authorities and their threshold, the two certificate roots, the distribution-signing key and the freshness key (D-21 SF-21, §14), the policy (including lifetime caps and the stage), and its own id. Stages are `development`, `test` and `production`; a `test` anchor may hold a test attestation root and is refused by every hub release (CI runs under it, on SoftHSM); a `development` anchor is refused by production hubs. |

**Enrolment and the allow-lists**

| # | Rule |
|---|---|
| T-8 | **Enrolment is signed from the first day.** Every enrolment request is signed by enrolled approvers' FIDO2 credentials checked against the anchor (two people for a privileged identity, never its subject), names its scope (`identity:credential:enrol`, `identity:identity:create`) and carries a one-time code signed under the anchor. The manager's nonce is single-use, bound to the request and consumed atomically; the attested COSE key must equal the enrolled `.pub` byte for byte; the application string names the anchor (`ssh:forge-<anchor id>`); the key type (`ed25519-sk`, or `ecdsa-sk` under a FIPS policy) is a policy value. The manager's API is reachable only over mutual TLS from its first line. |
| T-9 | **Two governed allow-lists**: `authenticator-models` (FIDO2: AAGUID, attestation roots and intermediates, `packed`, required properties, FIDO and FIPS certificate numbers checked by hand, provenance; no biometric models) and `device-attestation-roots` (T-3). Nothing changes them but a release the owner approves. A deployment's own list may add models that meet every required property, or narrow, never loosen, under its own anchor, so a replacement key at a cut-off site is not refused for a newer firmware's AAGUID. The vendor keeps its list from makers' published roots and never redistributes FIDO's metadata; a deployment that fetches it under its own agreement compares and alarms, never changes a list by itself. A model later marked compromised: alarm, new enrolments refused, affected credentials shown with the effective date; the owner's release decides blocking or re-enrolment. |

**The ceremony and the build**

| # | Rule |
|---|---|
| T-10 | **The development genesis ceremony** is the one act a single person may do: it sets up A, B, D and the YubiHSM 2 (T-3), generates and attests every key, and writes the development anchor signed by 2 of A, B and D, granting the owner's first roles with the anchor as grantor (the `self-grant` hard limit is kept). It reads what exists before acting and never regenerates a key that is already pinned (D-21 principle 8). Separation of duties, which one person cannot meet, is recorded as unmet and shown on every surface; a production anchor refuses that. The manager, the hub and the databases run in Docker Compose, as D-21 §10 says; the containers reach the YubiHSM 2 through Yubico's connector on the Mac, which is only a transport (Yubico: "The Connector is not a trusted component"; sessions are encrypted and authenticated between the service and the device). Whether a container reaches a connector on the Mac's loopback is tested on the real machine when it is built (Docker's documentation does not say); if not, the connector listens on the address Docker reaches with the firewall closed to everything else, as Yubico advises. Certificate-root acts run from `forgectl` on the Mac with B or D plugged in. |
| T-11 | **Step 1 as two pull requests, 1a and 1b**, each leaving the system working and nothing bypassed: **1a**, the issuer library, the certificate profile, the anchor and allow-list forms, the `test` stage and SoftHSM in CI, and the verifiers with their generated vectors; **1b**, the manager service with its database, the identity log, signed enrolment and the genesis ceremony. Nothing enforces these until step 2; until then the hub keeps today's checks and shows which anchor, if any, it holds. |

## 6. The cases

1. **Scale.** The certificate roots sign only intermediates, rarely and offline; each hub issues its own leaves.
2. **Change while in use.** A root or authority rotates by a new anchor under the 2-of-3 threshold; an allow-list release changes only future enrolments.
3. **A hub cut off.** It keeps two intermediates and issues its own leaves; local enrolment is D-21 SF-6 (step 6), under the deployment's own list.
4. **No person acting.** Services sign unattended with a device credential from their environment, stated as accepted risk; every authority act needs a person's touch and PIN on a key.
5. **Failure and recovery.** A lost A, B or D: the other two rotate it out. A wiped YubiHSM 2 in development: its keys are generated again and certified with B or D; in production, the wrapped backup on the second unit. A failed ceremony leaves the devices as they were and is re-run from what exists.
6. **Renaming and migration.** Development and test anchors never become production; production starts from its own genesis.
7. **Before it is complete.** §5 T-11.
8. **The wrong thing.** A software or unattested key, a key whose attestation shows the wrong PIN or touch policy, a reused nonce, an attestation for another key, a biometric or synced authenticator, an intermediate not in the anchor, a certificate outside the profile, a test anchor on a hub: each is refused. Still possible: a process running as a service using its device credential (stated); collusion of two authority-key holders.
9. **What it pins.** Python for the manager and the issuer; PKCS#11 for every device; the certificate profile and the two lists as governed data.
10. **How it is known to hold.** §7.

## 7. Laws

1. **No certificate counts unless its issuer's key is in the current anchor (or certified by a key that is), its subject sits under its issuer's identity, and it fits the profile**; both verifiers, on vectors generated from the profile, and an issuer that refuses to sign outside it.
2. **No credential is enrolled without an attestation that verifies against the allow-list, for the request's single-use nonce, for exactly the enrolled key, device-bound and with user verification, on a request signed by the required approvers.**
3. **Nothing changes an allow-list or the anchor but a release or anchor signed by the threshold.**
4. **No hub release accepts a test anchor, and no production hub a development anchor.**
5. **The identity store is never changed except by appending an event.**

Each law gets an exhaustive check on the real code and a `.claude/skills/verify-*` skill with the pull request that builds it (CLAUDE.md, "A law is proved"); every proof script of §8 becomes a test of the build.

*Amended 2026-11-25 by the owner (step 1a's design, Q-B): when each part takes hold.* Law 3 for the anchor: from step 1a an anchor counts only as the pinned genesis and every later version is refused by name; a later version counts on the authorities' threshold from step 1b, which builds D-20's FIDO core for signed enrolment. Law 3 for the allow-lists: they are approved as every governed list is until signed approvals exist (D-21 step 5). Law 4's first half (no hub release accepts a test anchor): from D-21 step 5, when a release carries its identity; its second half holds from step 1a. Until a part takes hold, its verify skill states it and reports it as not run, never as passing.

## 8. What the attack found, and where each went

| # | Finding | Where |
|---|---|---|
| B-1 | PIV P-384 roots cannot be D-20's authorities (SG-1, SG-9) | T-1 |
| B-2 | No threshold; either value failed; any root alone could certify an intermediate | T-1, T-2 |
| B-3 | PIN-only roots, default touch, attestation policy not checked | T-3 |
| B-4 | A host process can wipe a YubiKey's PIV keys; default management key lets `f9` be replaced | T-2, T-3 (online keys on the YubiHSM 2, sign-only; random PUK and management key) |
| B-5 | A genuine attestation enrolled a different software key; a nonce accepted twice | T-8 |
| B-6 | Go signed a sub-CA under `pathlen:0` and a cross-deployment CA leaf; URI constraints match only the host | T-4 |
| B-7 | The two verifiers already disagree | T-4 |
| B-8 | Device attestation roots not governed | T-3, T-9 |
| B-9 | Enrolment had no check point and no named scope before step 2 | T-8 |
| B-10 | The two-person rule made a setting | T-8, T-10 |
| B-11 | piv-go in development and PKCS#11 in production: a mode by stage; CI has no device | T-5, T-7 |
| B-12 | Python can sign with a device key; a Go manager would make a second issuer | T-5 |
| B-13 | Migrations in the hub's chain; no image for the manager; C-6 open | T-5 |
| B-14 | Module keys without a TPM | T-2 |
| B-15 | Law 1 uncheckable by verifiers; law 4 passes with no vectors | §7 |
| B-16 | Certificate lifetimes chosen by the signer | T-4 |
| B-17 | Ceremony, enrolment and allow-list releases have no FxTS spec (A-13) | §10 Q-8 |
| B-18 | The anchor lacked the distribution and freshness keys | T-7 |
| B-19 | No USB passthrough to Compose; the hub key's PIN unplaced | T-2, T-3, T-10 |
| B-20 | Re-running genesis would regenerate a pinned root | T-10 |
| B-21 | The PR order did not work | T-11 |
| B-22 | Genesis breaks the `self-grant` hard limit | T-10 |
| B-23 | The identity store was mutable rows; Part 11 lifecycle missing | T-6 |
| B-24 | A newer firmware's AAGUID refused at a cut-off site; no metadata watch | T-9 |
| B-25 | Ed25519 not approved under FIPS | T-8 |
| B-26 | A hub's keys in one node's TPM | T-2 |
| B-27 | The application string did not name the anchor | T-8 |

The proof scripts are in the session's scratch folder; each becomes a test of the build.

## 9. What it settles, and what it would amend

- **Settles D-17 C-6:** the manager is its own layer, `forge_manager`, importing only the foundation, reaching hubs over the link and imported by nothing (T-5).
- **Amends D-21 §10, the developer's ceremony** ("the owner's two FIDO2 keys (primary and backup) as its root holders; break-glass is the backup key"). With two keys every threshold fails: 2 of 2 cannot recover from a lost key, 1 of 2 lets one stolen key with an observed PIN rotate the anchor (B-2). Proposed: three authorities keys, 2 of 3, the third kept offline (T-2); break-glass is the two keys other than the lost one. D-20 SG-1's "at least two devices, one kept apart" and SG-2's owner-required rule hold as written; D-20 Q-E's two approvals devices become three.
- **Amends D-21 SF-2** ("CI runs the suite under a test anchor staged `production`"; only "a development anchor may hold a test attestation root"). CI has no device, so a production-staged anchor without a test attestation root cannot issue anything in CI, and a production stage that may hold one would let a production deployment accept software keys (B-11). Proposed: a third stage, `test`, whose rules are production's except that it may hold a test attestation root, and which every hub release refuses (T-7, law 4). Production's rules stay what is tested.
- **Amends D-21 §11's heading** ("Building order (each a pull request)") for step 1 only: step 1 becomes steps 1a and 1b, each a pull request (T-11), because one pull request holding the issuer, the profile, the anchor and list forms, the `test` stage, the verifiers, the manager service, the identity log, signed enrolment and the ceremony could not be reviewed as one change.
- **Keeps D-22's `self-grant` limit** ("Nobody grants a role or a scope to themselves", held by "someone else who holds the right to grant it, at the same level or above"): the genesis grants come from the anchor, the principal above every level, not from the owner's identity; that the owner's keys sign the development anchor is the one-person act D-21 §10 already allows, stated here, and a production genesis takes two people (D-21 §10).

## 10. What only the owner decides, one at a time

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Amend D-21 §10: three authorities keys, 2 of 3, the third kept offline, in place of two (§9). | Accept. **Answered 2026-11-25: "Accept".** |
| Q-2 | Amend D-21 SF-2: a third stage, `test`, production's rules plus a test attestation root, refused by every hub release; CI runs under it (§9). | Accept. **Answered 2026-11-25: "Accept".** |
| Q-3 | The manager and the issuer in Python, `forge_manager` its own layer (T-5, D-17 C-6). | Accept. **Answered 2026-11-25: "Accept".** |
| Q-4 | Buy three YubiKey 5 keys (A, B, D) and one YubiHSM 2 (T-2). | YubiKey 5C NFC, three, and YubiHSM 2 v2.4 (US$650); FIPS editions (YubiHSM 2 FIPS US$950) when a regulated deployment needs them. **Answered 2026-11-25: "Accept".** |
| Q-5 | Installs, each when its pull request needs it: on the owner's Mac `ykman`, `yubico-piv-tool` (for `ykcs11`), Homebrew's cask `yubihsm2-sdk` (the connector) and `openssh-sk-provider` (approved); Yubico's `yubihsm-pkcs11` package in the image; SoftHSM in CI. | Accept. **Answered 2026-11-25: "Accept".** |
| Q-6 | Add `python-pkcs11` to the lock file (the manager's database uses `asyncpg`, SQLAlchemy and Alembic, already locked). | Accept. **Answered 2026-11-25: "Accept".** |
| Q-7 | FIDO's metadata: never redistributed by the vendor; a deployment fetches it under its own agreement (T-9). | Accept; a legal review before any commercial use. **Answered 2026-11-25: "Accept".** |
| Q-8 | FxTS specs for the ceremony, enrolment and allow-list releases (A-13): kinds of FSTS spec (the security framework's FxTS framework, planned; D-22 PF-3 made the permission catalog its first kind), written with the pull requests that build them; FSTS meets D-14's whole baseline when its first kind is built, never half-built. | Accept. **Answered 2026-11-25: "Accept".** *Amended 2026-11-25 by the owner (step 1a's design, Q-A): the allow-lists are governed lists (T-9) and are released as every governed list is (schema-checked, hashed, approved by the owner), with a per-list check that parses their root certificates; FSTS starts in step 1b with the ceremony and enrolment as its first kinds.* |
| Q-9 | Amend D-21 §11 ("each a pull request") for step 1: steps 1a and 1b, each a pull request (T-11, §9). | Accept. **Answered 2026-11-25: "Accept".** |
| Q-10 | Sign the record (D-23). | After Q-1 to Q-9. **Answered 2026-11-25: "Sign it".** |

## 11. What this does not decide

Step 2's decision point, mutual TLS on every link and distribution; browser passkeys (forge-display); the production ceremony's people; Kubernetes manifests.
