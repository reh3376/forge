# The security framework — design record

**Status: approved by reh3376 on 2026-11-24 as D-21** (the owner answered Q-1 to Q-10 one at a time, then, asked whether the record is signed: "Sign it"). Nothing in it is built yet; §11 is the order. Second draft, 2026-11-24, on the owner's `+design`. The first draft was attacked by three adversaries (a threat model; a standards audit against IEC 62443, NIST SP 800-63-4, 21 CFR Part 11 and Annex 11; and a review of fit and operability); every finding they proved is folded in (§8), and two of them are defects in today's code, written as FB-291 and FB-292. It unifies identity, authentication, sessions, authorization, credentials, machine identity, secrets, audit, release integrity, signing and the trust anchor into one framework, run in development as data on that framework and in production as its default. It builds on the signed records D-1 (`roles.md`), D-15, D-17, D-18 and D-19; the proposed `permissions-framework.md` is its authorization chapter and the proposed `approval-signing.md` its signing chapter. Its chapters are signed: `permissions-framework.md` as D-22 and `approval-signing.md` as D-20 (2026-11-25); §14 (freshness) was added on 2026-11-25.

Marks: **[OWNER]** the owner's words or decision · **[FACT]** verified, with the source · **[PROPOSED]** Claude's proposal · **[OPEN]** a question for the owner.

## 1. The problem

**[OWNER]** 2026-11-24: "This framework will become enterprise software. This is no way to instantiate roles in a prod environment. We can set temporary development creds up that would only include myself and potentially a couple of collaborators if I hire them, but why waste time on that we we should build the full security framework out and use in in dev mode then when it can be switched to its default state when placed in prod mode." Earlier the same day: "tying this to my machine is ok during development, but its not way to implement a long term prod ready solution."

Everything Forge does (a record ingested, a value shown, a write to a controller, a spec approved, a release installed) must be done by an identity that proved who it is, holds the permission for that act at that place, and leaves a trace no one can alter or cut short unseen. Plants are cut off for weeks, operators share stations, contractors arrive at night, customers bring their own directories, regulated customers need electronic signatures, and a hub can be compromised. Today none of it is built (§4). The framework is the real one from the first line built; development is only different data on it, and moving to production is a ceremony this record writes down (§10).

## 2. What is already decided

- **[OWNER] D-1 (`roles.md`, signed):** a scope is `domain:resource:action`; a role is a bundle of scopes; an assignment carries where it applies (R-7); Forge assigns roles, the identity provider only says who someone is (R-2); tokens are verified offline (R-8), one hour by default (R-15); identity methods ship with OIDC, local accounts and service identities first, then LDAP, then SAML (R-10); roles are mastered at the managing hub (R-16) and a site's copy is never edited locally (R-18); the privileged roles of §14 (super admin with at least two holders, hub admin, dev).
- **[OWNER] D-15 Q-8, T-12:** mutual TLS in production with certificates from forge-creds; a module's identity is its certificate; a development mode must be deliberate and visible.
- **[OWNER] D-17 §11:** forge-core is the foundation and the administrative manager of a deployment; it administers, never operates; a hub cut off from it keeps running.
- **[OWNER] D-18:** one admission decision for every way in; approvals are signed records; development artifacts are marked and refused by production hubs, never a switch (AD-10).
- **[OWNER] D-19, and `approval-signing.md` re-framed by the owner:** approvals are signed records under this framework; the owner-approval hard limit stands; FB-288 (agent separation not a concern now; designs say "tamper-evident, not agent-proof").
- **[OWNER] CLAUDE.md:** role-level security built in; one path over a mode; no silent failure; the value checked is the value acted on (no truthiness); laws proved.

## 3. What the research found

- **IEC 62443** (3-3 Annex B; 4-2; 4-1). SL 2 is the floor; SL 3 changes the architecture: a unique identity per process and device (SR 1.2 RE1), keys and credentials in hardware (SR 1.5 RE1, SR 1.9 RE1; CR 1.5, 1.9, 1.14 RE1), multifactor on every interface of a component (CR 1.1 RE2), session control (SR 2.6, 2.7, 3.8), a central time-correlated audit trail (SR 2.8 RE1, 2.11 RE1), non-repudiation (SR 2.12), automatic integrity alerts (SR 3.4 RE1), failed-attempt limits (SR 1.11) and refusal causes kept from the requester (SR 1.10, SR 3.7). A vendor's releases are signed and verified before use (4-1 SM-6, SM-8, SUM-4).
- **NIST SP 800-63-4.** Operators AAL2; engineers, administrators and approvers AAL3: a non-exportable, device-bound key (synced credentials SHALL NOT be used), phishing- and verifier-compromise-resistant, intent at each authentication, reauthentication within 12 hours, and FIPS 140 validated authenticators and verifier cryptography; failed attempts limited (at most 100); no forced periodic password changes and no composition rules (which 62443 SR 1.7 asks for: a policy setting). When Forge itself verifies the authenticator, Forge is the verifier and the directory only provisions people: AAL, not FAL, is what Forge claims; LDAP is provisioning, not federation.
- **Industrial platforms** (Ignition, FactoryTalk, AVEVA, Siemens UMC). None keeps a remote identity provider working through a cut; the pattern is the customer's directory as the identity of record, provisioned by SCIM, with a local copy at each site that issues and checks tokens; shared stations as machine identities with the person laid over; a private certificate authority with an intermediate per site, short-lived leaves and revocation pushed down the tree (OPC UA GDS); per-module secrets in a store inside the site's cluster; at least two break-glass accounts, monitored and tested.
- **Signing, supply chain and electronic signatures**: `approval-signing.md` §4 (TUF and PURE-2; Part 11 and Annex 11; FIDO2, WebAuthn and Apple's provider) and its twenty proved findings.

## 4. What exists, and what contradicts what

- **[FACT]** Code: hub authentication off by default with an anonymous administrator holding `*` (`forge_hub/gateway/auth.py` L31-36, L47, L120), and the flag read by truthiness so that `1`, `yes` or `on` also turn it off (FB-291); HS256 JWT without required expiry, issuer or audience; three roles fixed in code; scope checks only on write routes, `register` and `records` unguarded; the module link in plaintext unless configured, its identity a claim in the message (a second `Register` takes over a module's write-backs; guessable session ids; FB-292); the governance CLI records whatever name it is given (FB-280); no user store in the hub; audit stores but none of authentication; secrets from environment variables.
- **[FACT]** Contradictions, each settled here or put to the owner (§7): (1) `roles.md` §8 requires an enterprise hub, R-9 does not; (2) D-17 §11.5 wants hubs to handle some roles, R-16 and R-18 forbid local edits; (3) the permissions proposal treats §11.5's interim grants as settled; (4) FB-193 keeps an off switch, PF-10 and D-18 AD-10 forbid one, D-15 Q-8 allows a visible one; (5) the owner-approval hard limit against D-18 AD-13's hub approvers; (6) D-1 §8's enterprise-hub trust root against D-17's forge-core; (7) stale paths in D-15; (8) where roles are mastered (forge-core here, the managing hub in R-16); (9) D-15 Q-8's development exception for mutual TLS.

## 5. Two shapes

| | A. Forge as its own identity provider | B. The customer's directory of record, held locally by Forge |
|---|---|---|
| Who someone is | Forge's accounts, everywhere | the customer's directory, provisioned into forge-core by SCIM; Forge's own accounts where a customer has none, for development and for break-glass, through the same store |
| Who verifies a sign-in | Forge | Forge, at every hub, against credentials enrolled with Forge |
| Cut-off site | works | works: each hub holds a signed copy of what applies to it |
| Enterprise adoption | a second place to add and remove people | leavers removed where they already are |
| Who writes each piece of state | Forge for everything | the directory writes who exists; forge-core writes roles, grants and credentials; a hub writes its sessions, its audit trail and its local acts (SF-6) |

**[PROPOSED] Shape B**, as D-1 R-2, R-8 and R-10 describe, with Forge as the verifier everywhere.

## 6. The design

**Target and stages**

| # | Rule |
|---|---|
| SF-1 | **The mechanisms of IEC 62443 SL-C 3 are built; the enforced level is a signed policy, SL 3 by default in production.** These keys are held in hardware (TPM or HSM) and never leave it: the anchor's root (offline), each hub's intermediate, token-signing and audit-signing keys, each module instance's certificate key where its host has a TPM, the secret store's master key, and every person's authenticator. Cryptography that verifies an AAL3 authenticator is a FIPS 140 validated module where the policy requires it (regulated deployments). A deployment lowers a setting only by a signed policy change, shown on every surface. |
| SF-2 | **Development differs only in data, never in checks.** Each deployment's trust anchor (SF-21) is staged `development` or `production`; production is the default; the code and the checks are the same. A development anchor may hold a test attestation root (so a developer's own keys enrol), and nothing else differs. CI runs the suite under a test anchor staged `production`, so production's rules are what is tested. A production hub refuses a development anchor and everything under it. `FORGE_AUTH_ENABLED`, `FORGE_API_KEYS` and the anonymous administrator are removed; mutual TLS is used in development too, under the development anchor's certificate authority. |

**Identities and enrolment**

| # | Rule |
|---|---|
| SF-3 | **Every actor is an identity**: a person, a service (forge-core, a hub, a module instance), a script or sequence, or a station. Ids are never reused. |
| SF-4 | **Who exists comes from the customer's directory**, provisioned into forge-core by SCIM (LDAP as provisioning only); people without a directory account are Forge local accounts in the same store. Values from the directory are coerced once, never by truthiness. |
| SF-5 | **Enrolment is the only way to give access, and privileged enrolment takes two people.** An identity's credential is enrolled once through one path, with an identity check recorded (IAL2 evidence rules where the policy requires them) and a one-time enrolment code signed under the anchor. Creating, enrolling, re-enrolling or granting a privileged identity (an administrator, an approver, a signer) needs a second person, never the subject. The first holders are enrolled in the genesis ceremony (§10), never while any unauthenticated path exists. |
| SF-6 | **A hub may act locally, within limits, and reconciles upward.** A hub may always deactivate or suspend an identity locally (an edit that only denies). A site administrator at a hub may enrol an identity and grant site-scoped roles locally while forge-core is unreachable, under a lease (SF-12), never a privileged deployment-wide role. Every local act is audited and reconciled with forge-core when the hub reconnects; forge-core's decision wins where they differ, and the difference is shown. |

**Authentication, sessions and stations**

| # | Rule |
|---|---|
| SF-7 | **Authentication by role class, verified by Forge at the hub.** Engineers, administrators and approvers: a device-bound FIDO2 credential (not synced), attested at enrolment, user verification at every authentication (AAL3), reauthentication within 12 hours and 15 minutes idle. Operators: AAL2, a passkey or a badge plus a PIN at a station, one hour idle. Password lifetime and composition are policy settings. |
| SF-8 | **Sessions are bound and bounded.** Session ids are random and bound to the connection, device or station that opened them; tokens are bound to the device or station; a shared station receives no refresh token; idle and absolute limits by role class; concurrent sessions capped; any session can be ended remotely and is ended when its identity is deactivated at that hub. |
| SF-9 | **Failed sign-ins are limited and reported at once**: a per-identity limit (policy, at most NIST's 100), then lockout that a second person lifts; each lockout raises an alarm on status (Part 11 §11.300(d)). |
| SF-10 | **Stations.** A shared station is a machine identity; a person signs in on it and is the actor of what they do; a signature always re-authenticates the person; the station locks and signs out by policy. |
| SF-11 | **Break-glass.** At least two local accounts with hardware keys, outside the directory, each use requiring a second person and raising an alarm; tested on a schedule; never subject to a lease. |

**Authorization**

| # | Rule |
|---|---|
| SF-12 | **One decision point, with grants as data** (`permissions-framework.md`). Every route, gRPC method, CLI command and widget runs through one handler wrapper that names its scope and asks the decision point; a hub decides from its own copy of grants, never from scopes carried in another hub's token. Hard-limited scopes are never covered by a wildcard. Roles that administer identities and roles that approve are never held by one person (separation of duties; Annex 11 draft 11.10); super admin holds no approval scope. A group-to-role mapping that reaches a privileged role is applied only by Forge, with two people. A supervisor override is a time-boxed, audited grant; a policy may require two people for an act. **Leases:** a grant made or held at a cut-off site ends at the earlier of the cut's start plus its lease and its granter's own lease end, measured on elapsed time kept with the audit trail (not wall-clock), may be renewed only by a parent hub or forge-core, and never includes the right to grant. |
| SF-13 | **Refusals are visible to those entitled to see why.** The requester receives a refusal and a reference; the cause goes to the audit trail and to surfaces an authorized identity reads (62443 SR 1.10, SR 3.7). |

**Machines, links and distributions**

| # | Rule |
|---|---|
| SF-14 | **Every hub and module instance has its own certificate**, from the deployment's private certificate authority (forge-creds, FB-142): the root offline in hardware, an intermediate per hub that outlives the longest expected cut, short-lived leaves rotated automatically, ids of the form `spiffe://<deployment>/hub/<id>/module/<id>`. Every link is mutual TLS (D-15 T-12). **A leaf counts only if its id sits under its issuing hub's id** (a hub cannot mint another hub's, a sibling's module's or forge-core's identity). **The module id of every call and of every callback the hub dials is the id in the peer's certificate**; a message's own claim is checked against it, never trusted. |
| SF-15 | **Revocation without stopping a plant.** Each hub issues the revocation list for the leaves it issued; lists from above are signed and carry an expiry. An expired list from above never stops a link already admitted: the hub shows "revocation stale since <date>" on every surface; a new admission and a privileged act require a list within its expiry. *Amended 2026-11-25 by the owner (§14): no list carries an expiry; freshness is §14's nonce-bound exchange.* |
| SF-16 | **Distributions are versioned, addressed and bounded.** Every distribution from forge-core (identities, credentials, grants, policy, revocations) names the hub it is for, carries a version that only rises (a hub keeps its floor, survives a restore by refusing anything below it, and reports the floor on reconnect) and an expiry within the anchor's cap (as `approval-signing.md` SG-4, SG-5, SG-8). *Amended 2026-11-25 by the owner (§14): distributions carry no expiry; freshness is §14's exchange; versions, floors and addressing stand.* |
| SF-17 | **Attested time** (`approval-signing.md` SG-8) may rise by at most a policy step per observation; an erroneous mark is corrected only by a signed act under the anchor. *Amended 2026-11-25 by the owner (§14): attested time comes from the same signed, nonce-bound exchange.* |
| SF-18 | **Secrets are scoped to one module** in a store Forge runs inside the site, the same store in development and production, mounted only into that module's container; none in a repository or a log. |

**Audit, integrity and releases**

| # | Rule |
|---|---|
| SF-19 | **One audit trail, signed and anchored.** Every authentication, refusal, session event, decision on a privileged act, grant change, enrolment, credential change, local act, break-glass use, approval, write to a controller, and every create, change or delete of a governed record (with the earlier value, the new value and the reason; Part 11 §11.10(e), Annex 11 §9) is an entry: hash-chained, numbered, signed by the hub's hardware-held audit key, in hub UTC. Modules, stations and forge-core hold copies of the chain's head as it advances, so a cut-short trail is seen; on reconnect a missing number raises an alarm. Entries are forwarded by store and forward to forge-core, where they are kept for the deployment's retention period; a hub keeps them until forge-core confirms them. Capacity and audit failure raise alarms; the policy says which acts stop when they cannot be audited. |
| SF-20 | **Integrity is watched while running, and releases are signed.** Each hub checks, on a schedule and at start, the digests of its own and its modules' binaries and images, its configuration and its audit chain, raising an alarm on any difference (SR 3.4 RE1). Every release artifact and update the vendor ships is signed under the vendor's anchor (`approval-signing.md`) and verified before it runs (62443-4-1 SM-6, SUM-4). |

**Signing and the trust anchor**

| # | Rule |
|---|---|
| SF-21 | **Each deployment has one trust anchor, and a hub also pins the vendor's.** A deployment's anchor holds its certificate root, the key that signs its distributions, its approval authorities, its policy and its stage; forge-core holds it (D-17 §11) and it changes only under its own threshold policy. Each hub release ships pinned with the vendor's anchor (for Forge's own artifacts and releases); a deployment's anchor is pinned at the hub's genesis ceremony, never trusted on first use. |
| SF-22 | **Signing is `approval-signing.md`, on this framework.** The vendor is a deployment of its own; its owner-approval role is held by the owner; the thresholds are policy on the approval scopes (SF-12); a deployment's approvers approve what was built on site (D-18 AD-13). |

## 7. Settling the contradictions

| # | Settled by | Recommendation |
|---|---|---|
| 1 | SF-21 | No enterprise hub is required; forge-core holds the anchor (§12 Q-3). |
| 2, 3, 8 | SF-6, SF-12 | forge-core masters roles and grants for the deployment; a hub's copy is never edited except by SF-6's local acts (deny always; site-scoped enrolment and grants under a lease while cut off), reconciled upward; R-16 and R-18 are amended (Q-3, Q-4). |
| 4, 9 | SF-2 | No switch and no exception: development is a staged anchor with mutual TLS; FB-193's flag goes; D-15 Q-8's exception is withdrawn (Q-2). |
| 5 | SF-22 | Both stand, for different artifacts: the vendor's are the owner's; a deployment's are its approvers'. |
| 6 | SF-21 | forge-core, per D-17 (the newer signed record); D-1 §8 amended (Q-3). |
| 7 | mechanical | Paths corrected with the next change touching D-15. |

## 8. What the attack found, and where each went

| # | Finding (proved by) | Where |
|---|---|---|
| A-1 | A compromised hub minted identities for siblings and forge-core, and signed tokens with any scope (threat script `p2`) | SF-14, SF-12 |
| A-2 | A module's identity was a claim in its message: write-back takeover, guessable sessions, session-less ingest (threat script `p1`, run on the real hub code) | SF-14, SF-8; **FB-292** now |
| A-3 | The audit trail could be cut short or rewritten unseen (threat `p3`; fit `chain.py`) | SF-19 |
| A-4 | An expired revocation list would cut every link at a long-cut site (threat; fit) | SF-15 |
| A-5 | Leases renewed by colluding site admins; a clock reset kept a lease alive; break-glass unspecified (threat `p3`) | SF-12, SF-11 |
| A-6 | Distributions replayable, misaddressed, withheld (threat `p3`) | SF-16 |
| A-7 | The anchor trusted on first use; the first enrolment while the anonymous administrator was live (threat) | SF-21, SF-5, §10 |
| A-8 | One insider: a super admin's sock-puppet met the two-person rule; a helpdesk's group mapping granted privilege (threat) | SF-5, SF-12 |
| A-9 | Leavers kept access at a cut-off site; station tokens were bearer tokens with long refresh (threat; standards) | SF-6, SF-8 |
| A-10 | Today's flag read by truthiness turns authentication off; unbounded tokens accepted (threat `p4`, run on the real code) | SF-2; **FB-291** now |
| A-11 | Keys other than the root not held in hardware; no FIPS 140 for AAL3 (standards) | SF-1 |
| A-12 | No session rules; no failed sign-in limit (standards) | SF-8, SF-9 |
| A-13 | No runtime integrity check; releases not signed (standards) | SF-20 |
| A-14 | One administrator could enrol a signer; administrators and approvers in one class (standards) | SF-5, SF-12 |
| A-15 | IAL2 and FAL2 misclaimed; LDAP called federation (standards) | §3, SF-4, SF-7 |
| A-16 | Record changes not audited; no retention (standards) | SF-19 |
| A-17 | Refusal causes shown to requesters (standards) | SF-13 |
| A-18 | Development's relaxed policy values were a hidden mode; production's defaults untested (fit) | SF-2 |
| A-19 | No way to move from development to production (fit) | §10 |
| A-20 | Build order steps depended on later steps (fit) | §11 |
| A-21 | Enrolment and suspension impossible at a cut-off site (fit) | SF-6 |
| A-22 | One bad top-hub time raised the mark for good (fit) | SF-17 |
| A-23 | Contradictions 8 and 9 not named (fit) | §4, §7 |

The proof scripts are in the session's scratch folder; each becomes a test of the build, run against the real code. What held: an empty-key JWT is refused; within a session a record naming another adapter is refused; hard limits are checked before grants; policy changes sit under the anchor's threshold; WebAuthn at AAL3 works offline; SCIM's `"False"` is coerced; contradictions 1, 2, 4, 5 and 6 are real and correctly cited; Shape B matches R-2 and R-8; requiring the owner's key keeps the hard limit.

## 9. The cases

1. **Scale.** Each hub holds only what applies to it; one signed distribution per change; grants indexed by scope and place; audit forwarded in batches.
2. **Change while in use.** A withdrawn grant reaches hubs with the next distribution and takes effect at the next decision; a deactivated identity's sessions end at once at every hub it reaches.
3. **A hub cut off.** It authenticates, decides, audits and keeps its links; leases narrow privileged grants; local acts are allowed and reconciled; revocations and approvals from above show as stale, never as a stop.
4. **No person acting.** Services, scripts and sequences are identities with declared, approved scopes; a station is never the actor of a person's act.
5. **Failure and recovery.** A lost device: the backup credential, the lost one retired; a compromised credential or hub: revoked, its acts flagged from the audit point; forge-core lost: hubs run on their copies; the anchor's root lost: its threshold recovers it.
6. **Renaming and migration.** Ids never reused; today's API keys, JWT secret, flag and anonymous administrator are removed in the step that adds the decision point and machine identity (§11); the development-to-production ceremony (§10).
7. **Before it is complete.** §11's order; every step runs on the real framework from the first.
8. **The wrong thing.** A-1 to A-23 are refused. Still possible: collusion beyond a threshold; an agent running as the owner using a development software key (FB-288; in production every key is in hardware).
9. **What it pins.** The scope grammar (D-1), the certificate id form, the anchor, distribution and audit entry forms: versioned data in governed schemas.
10. **How it is known to hold.** The laws below.

## 10. Laws, the developer's ceremony, and going to production

**Laws.**

1. **Every request goes through the one handler wrapper to the decision point**: proved by an inventory of every route, method, command and widget against the wrapper's registry, and a deny-all policy under which every one refuses.
2. **A credential, token or certificate counts only if** its chain reaches the pinned anchor, a leaf's id sits under its issuer's, it is not on the latest valid revocation list, and it is within its lifetime by attested time.
3. **A production hub never accepts a development anchor.**
4. **An id is never reused.**
5. **No audit entry is changed, removed or cut short unseen**: signed entries, numbers and held heads.
6. **A lease never outlives the earlier of its cut-start plus its length and its granter's lease.**
7. **Every break-glass use, lockout and local act is recorded and alarmed or reconciled.**
8. **A privileged identity is never created, enrolled or granted by one person, nor by its subject.**
9. **A distribution below a hub's floor, or for another hub, is never accepted.**
10. **The module id of every call is its peer certificate's.**
11. The laws of `approval-signing.md` §9.

**The developer's ceremony** (one person, development stage): a development anchor is created on the owner's laptop with the owner's two FIDO2 keys (primary and backup) as its root holders; the owner is enrolled through the real path as super admin and as approver (separation of duties is a policy setting a one-person development deployment records as unmet, shown on every surface, which a production anchor refuses); break-glass is the backup key; the secret store and the certificate authority run in Docker Compose as the same components that run in Kubernetes.

**Going to production** (the owner's "switched to its default state"): a production genesis ceremony creates a new anchor with its own root holders in hardware; identities are carried over by re-enrolment under the production anchor (credentials and identity checks re-recorded, ids kept); certificates are re-issued; approvals of everything that will run are re-signed under the production authorities; development's data stays behind, refused by production hubs.

## 11. Building order (each a pull request)

0. **Now, before the framework:** FB-291 and FB-292, small fixes to today's live defects.
1. **The anchor, the certificate authority and identities**: the development anchor and genesis ceremony, forge-creds' first form, the identity store and enrolment (two-person rules, attestation), as forge-core's first manager function (§12 Q-9 decides where it runs).
2. **The decision point, machine identity and distribution together**: the handler wrapper on every route, method and command; mutual TLS with certificate-bound ids; signed, versioned distributions to hubs; the flag, API keys and anonymous administrator removed.
3. **Sessions, sign-in limits, stations, break-glass.**
4. **The audit trail and integrity checks.**
5. **Approvals and signed releases** (D-19 step 3, resumed under `approval-signing.md`).
6. **Local acts and leases at cut-off hubs.**
7. **Federation** (OIDC and SCIM, then SAML; LDAP provisioning).

## 12. What only the owner decides, one at a time

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Build the SL-C 3 mechanisms, with the level a signed policy and SL 3 production's default, keys in hardware as SF-1 lists (SF-1). | Accept. **Answered 2026-11-24: "Accept".** |
| Q-2 | Development differs only in data; mutual TLS in development too; `FORGE_AUTH_ENABLED`, API keys and the anonymous administrator removed; D-15 Q-8's exception withdrawn (SF-2). | Accept. **Answered 2026-11-24: "Accept".** |
| Q-3 | forge-core holds each deployment's anchor and masters its identities, roles and grants; no enterprise hub required; D-1 §8, R-16 and R-18 amended. | Accept. **Answered 2026-11-24: "Accept".** |
| Q-4 | A hub may always deny locally, and may enrol and grant site-scoped roles under a lease while cut off, reconciled upward (SF-6). | Accept. **Answered 2026-11-24: "Accept".** |
| Q-5 | Role classes and separation of duties: AAL3 device-bound keys for engineers, administrators and approvers; AAL2 for operators; administrators never approvers (SF-7, SF-12). | Accept. **Answered 2026-11-24: "Accept".** |
| Q-6 | The lease length for privileged grants at a cut-off site. | 14 days, a policy setting. **Answered 2026-11-24: "14 days", a policy setting.** |
| Q-7 | FIPS 140 validated cryptography for regulated deployments (SF-1). | A policy setting, required where the deployment's policy names Part 11 or Annex 11. **Answered 2026-11-24: "Policy setting".** |
| Q-8 | Fix FB-291 and FB-292 now, before the framework (§11 step 0). | Yes: both are live. **Answered 2026-11-24: "Fix now".** |
| Q-9 | Where forge-core's manager runs (D-17 §11, FB-232 C-4), since step 1 builds its first function. | Its own service in the deployment's top site's cluster, highly available, reachable by every hub over mutual TLS. **Answered 2026-11-24: "Own service"; this answers D-17 §11's C-4.** |
| Q-10 | The permissions framework's open questions Q-2 to Q-10, and `approval-signing.md`'s Q-B to Q-G, one at a time. | Take them in order after this record. **Answered 2026-11-24: "One at a time, next", after this record is signed.** |
| Q-11 | The freshness each class of privileged act needs (§14 FR-6); nothing an operator does, and nothing already running, ever waits on freshness. | Admitting or promoting a new artifact: approvals current within 24 hours. A privileged grant or enrolment made through forge-core: grants current within 1 hour. A hub's local acts (SF-6) need none. All policy settings. **Answered 2026-11-25: "Accept".** |
| Q-12 | How many freshness sources a deployment needs (n) and how many may be compromised (f), with k = f + 1 agreeing (§14 FR-5). | f = 1, k = 2: forge-core plus at least two witnesses (n ≥ 3); in the experiments, 0 false "current" in 80 cases, "current" available in 11 of 16 partition patterns. **Answered 2026-11-25: "f = 1, k = 2".** |

## 13. What this does not decide

How distributions travel (FB-232, beyond Q-9); the screens for sign-in, enrolment and administration (forge-display, FB-181); SIEM formats; a hardware security module product; the hosts' boot and root of trust (shared with whoever runs the Kubernetes hosts).


## 14. Amendment 2026-11-25: freshness without expiries

**[OWNER] 2026-11-25: accepted.** Asked to set a cap on how long a signed list stays valid, the owner answered that it "is a rule that should be engineered out of our system instead of required"; after `/sharpen` and the experiments, the owner accepted this design. It amends SF-15, SF-16 and SF-17, and `approval-signing.md` SG-8 (its Q-B is answered by removing the cap).

| # | Rule |
|---|---|
| FR-1 | **No expiry is chosen by anyone.** No list, distribution, manifest or revocation list carries an expiry or a validity cap. |
| FR-2 | **Freshness is a nonce-bound exchange inside the one-clock exchange.** A hub sends a fresh random nonce in the existing time exchange (D-9 P-9); a parent batches its children's nonces under one Merkle root. forge-core answers with its time and the head (size and root hash) of an append-only log of the deployment's approvals, grants and revocations, bound to the nonce, signed with a hardware-held key that can sign nothing else. A hub's freshness is the age, on its own monotonic clock, since the nonce it sent was answered; attested time comes from the same answer. |
| FR-3 | **A relayed answer keeps forge-core's time.** A parent that relays an answer passes it on as forge-core signed it; nothing is ever fresh because it arrived. |
| FR-4 | **State is a log, checked by consistency.** A hub behind the head it was shown fetches the missing entries and checks a consistency proof before applying them. |
| FR-5 | **Current needs agreement.** A hub shows its state current only when k answers agree on the head (forge-core and witnesses: the parent and sibling hubs, which relay and compare signed heads), with k = f + 1 for f tolerated compromised sources, and none reports a newer head. Two conflicting signed heads are kept as proof of misbehaviour and raise an alarm. |
| FR-6 | **What a hub shows**, per stream (approvals, grants, revocations): **Current**; **Unproven since T** with its age; **Behind, fetching**; **Conflict, proof held**; with the route, the witnesses that agree, and the privileged acts the policy is holding back and the freshness each needs. **Staleness never stops a hub running**; a policy threshold per class of privileged act says which acts need recent freshness (§12, Q-11). |
| FR-7 | **The limit, stated.** A whole site cut off with the freshness key compromised cannot detect a withheld update until it reconnects. |

**The law** (added to §10): *a hub never shows its trust state current while an update is withheld longer than its threshold, and staleness never stops it running.* **Evidence (2026-11-25):** TLA+ on the pinned checker passes for nonce challenge-response (970,238 states) and for two agreeing answers with one compromised source (905,702 states), and the three broken variants (broadcast fresh on receipt, broadcast by its own time, one answer enough) fail with counterexamples (`docs/decisions/models/freshness/`); a six-week fleet simulation with partitions of up to four weeks showed 0 violations when relayed answers keep forge-core's time and 142,823 when they count as fresh on arrival; replayed and altered answers were refused. The experiments become tests when FB-293 builds the exchange. Research: TUF §2.1.4 and §5.4, Uptane's time server, RFC 10049 (Roughtime), RFC 9162 (consistency proofs and conflicting heads as proof), RFC 6960 and RFC 6066.
