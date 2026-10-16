# Forge authorization model — decision record

**Status:** draft, round 3 of the owner dialogue (2026-10-16) · **Backlog:** FB-075 · **Roadmap:** D-1
**Participants:** reh3376 (owner, decides), Claude (drafts, challenges)

This record accumulates the decisions and the open questions about how Forge decides what a person, a spoke or a module may do. It is edited in place as the dialogue proceeds; every statement is tagged **[OWNER]** (decided by the owner), **[PROPOSED]** (Claude's proposal, not yet approved) or **[OPEN]** (question outstanding). Nothing here is implemented until the status line says `approved`.

---

## 1. Why this matters now

- Two unrelated role sets exist: the hub API's `admin / operator / viewer` (expanded to scopes such as `adapters:write`, enforced on the write, backfill and subscription endpoints since FB-063) and the OT write engine's `OPERATOR / ENGINEER / ADMIN` with per-area, per-tag permissions and interlock bypass.
- Nothing is scoped to a site, area or equipment, so a multi-site enterprise cannot be expressed.
- forge-display (FVTS) needs to name the permission an action requires; the Go management modules need one SDK-provided way to declare and check permissions; third-party integration modules need the same.
- Getting this wrong is expensive to unwind: permissions end up referenced from every module, every screen and every audit record.

## 2. Decisions so far

| # | Decision | Tag |
|---|---|---|
| R-1 | Forge is enterprise-class software; identity and authorization are designed to that standard, with the method chosen by the installing administrator at setup. | [OWNER] |
| R-2 | Once an identity is established, **Forge** decides role assignment; the identity provider does not decide what someone may do in Forge. | [OWNER] |
| R-3 | Role shape (one universal ladder, domain roles, or custom) is an installation choice. Forge offers the options; the administrator picks. | [OWNER] |
| R-4 | Assignment scoping (how far a role reaches: enterprise, site, area, equipment, or other) is also an installation choice; the ISA-95 subtree is one of the offered methods. | [OWNER] |
| R-5 | Roles are authored per module as part of module setup; an installation may inherit roles from existing ones or use another predefined method. | [OWNER] |
| R-6 | Separation-of-duties rules (two-step review, interlock bypass with reason, approvals) are part of the authorization model, evaluated by the hub, not application-level checks. Rationale in §6. | [PROPOSED → owner delegated the call] |
| R-7 | Roles are scoped: a permission is always a scope, and an assignment always carries where it applies. | [OWNER] |
| R-8 | Tokens are verified **offline** against the issuing hub's public key. The administrator sets the token lifetime (and with it the longest a revoked subject can keep working); Forge enforces a floor and a ceiling. Details in §7. | [OWNER] |
| R-9 | Topology is a **hub of hubs** along ISA-95 Part 2: one enterprise hub required, one site hub per site recommended, area hubs possible. Details in §8. | [OWNER] |
| R-10 | Identity methods ship in the order OIDC + local accounts + service identities, then LDAP / Active Directory, then SAML. | [OWNER] |
| R-11 | Assignments constrain **reads as well as actions**: a subject without a domain's read scope sees none of that domain's data (e.g. ERP data hidden from distillery operators). Details in §10. | [OWNER] |
| R-12 | Shipped roles are **per module** (each module ships its domain roles as data). A cross-module "universal ladder" is at most an optional overlay. Details in §11. | [OWNER, overlay question open] |

## 3. Design consequence of R-3, R-4 and R-5

Configurability at setup must not mean several authorization engines. Every preset the administrator can pick is **data on top of one model**:

```
Scope        the atomic permission, declared by a module:  domain:resource:action
Role         a named bundle of scopes (data, never code); may inherit other roles
Assignment   subject + role + constraint (where it applies) + who granted it, when, until when
Constraint   a selector over the resource context: everything | ISA-95 subtree | site list | attribute match
Policy rule  an extra condition on an action: two distinct subjects, reason required, approval required, time window
Subject      a person, a service (spoke or module) or an API key, with linked identities
```

"Universal ladder" is then four shipped roles (`viewer < operator < engineer < admin`, by inheritance) and "domain roles" are the modules' shipped roles; "custom" is the administrator editing either. Switching presets later is a data migration, not a code change. This is the single most important guard against future debt: **one decision engine, many presets.**

## 4. Identity (R-1, R-2)

**[PROPOSED]** Pluggable identity, normalised to one subject record:

| Method | Typical use | Notes |
|---|---|---|
| OIDC (Entra ID, Okta, Keycloak, Auth0) | corporate users | first-class; group claims available as assignment inputs |
| SAML 2.0 | enterprises standardised on SAML | same subject model |
| LDAP / Active Directory bind | on-premises plants without a cloud IdP | password verified against the directory; attributes read for rules |
| Local Forge accounts | small sites, break-glass administrator | always present; MFA (multi-factor authentication) required for admin |
| Service identities (mTLS certificate or client-credentials) | spokes, modules, forge-display backends | never interactive; scoped like any subject |
| API keys | tooling and CI | bound to a subject, revocable, scoped |

**On keying assignments by username or e-mail [PROPOSED, challenging the owner's suggestion].** E-mail and username are the right *matching inputs* for rules ("everyone at `@distillery.example`", "user `jdoe`") but the wrong *keys* for assignments. Both are mutable (name changes, contractor turnover, a second identity provider) and reusing an address silently inherits the previous holder's rights. Recommendation: Forge mints an immutable subject id at first sign-in, links the identity provider's stable identifier (`sub`, Entra `oid`, AD `objectGUID`) to it, and assignments reference the subject id. Rules that *create* assignments may match on e-mail, username, group or attribute. Forge still decides (R-2); it just decides against a stable key. Provisioning is just-in-time at first login; deprovisioning disables the subject when the provider stops asserting it, and sessions expire within the token lifetime (§7).

## 5. Enforcement points (where a decision is made)

| Point | Today | Target |
|---|---|---|
| Hub REST and gateway | role → flat scopes, write path gated (FB-063) | every route names a scope; constraint applied to the request's site/area context |
| Hub → spoke callbacks (write-back, backfill, subscribe) | session id + per-spoke token | unchanged for the channel; the **acting subject** travels in the request (`on_behalf_of`) so the spoke audits who asked |
| OT write engine | `WriteRole` on the request, per-tag permissions, interlock bypass | role replaced by scopes (`ot:tag:write`, `ot:interlock:bypass`, `ot:recipe:download`); per-tag/area permissions stay, expressed as constraints |
| forge-display actions (FVTS) | `required_role` enum | `required_scope`; renderers hide what the subject lacks, the hub enforces regardless |
| Module commands (Go SDK) | — | SDK helper `Authorize(subject, scope, context)`; modules never implement their own checks |
| Grants themselves | — | `iam:assignment:grant` is a scoped action, so a site administrator can only grant within their own constraint (delegation falls out of the model) |

Every decision writes a record: subject, scope, constraint evaluated, outcome, policy rules applied, and the assignment(s) that justified it.

## 6. Separation of duties (R-6, Claude's call as delegated)

Put multi-party and reason rules **in the model**, as policy rules the hub evaluates, because: they must behave identically on an HMI, a desktop app and a phone (FVTS principle); they must be auditable in one place; sites need to tune them without module code changes; and the OT write path already routes through the hub. Mechanism: a **pending action** record (staged → reviewed/approved → executed) owned by the hub; the OT write engine executes only committed actions (this is FB-074). Modules declare in their manifest that an action is `two_step`, `requires_reason` or `requires_approval(role)`; the hub enforces it. Domain validation (interlocks, ranges) stays in the module because it is about the process, not about people.

## 7. Token model (R-8)

**[OWNER]** Offline verification: a spoke, module or forge-display backend checks the token's signature against the issuing hub's public key and reads the scopes and constraints from the token; there is no call to the hub per request. The administrator sets the token lifetime, which is exactly how long a revoked subject can keep working. Forge enforces a floor, so clients cannot be configured to refresh so often that the hub is congested, and a ceiling.

**[PROPOSED] Numbers and mechanics** (owner to confirm the numbers, Q16):

| Setting | Proposed | Why |
|---|---|---|
| access-token lifetime floor | 5 min | below this every client refreshes constantly; a thousand HMI sessions at 1 min is ~17 refreshes/s on a site hub |
| access-token lifetime default | 15 min | the revocation latency most enterprises accept for routine actions |
| access-token lifetime ceiling | 12 h | one long shift; longer and a token outlives a shift change |
| refresh-token lifetime | administrator-set, default 8 h, absolute maximum 30 d | sliding, revocable, only ever presented to the hub |

- **Refresh tokens make "expiry" the revocation bound without constant re-login.** The access token is the short-lived, offline-checked statement. A refresh token is longer-lived and is redeemed only at the hub, which checks that the subject is still enabled and re-reads the current assignments before issuing a new access token. Disable a subject and they lose access at the next refresh, never later than the access-token lifetime.
- **High-impact actions are online anyway.** Tag writes, interlock bypass, approvals and grants already pass through the hub (write-back path; pending actions, §6), and the hub checks the subject live there regardless of the token. The offline model therefore only ever extends a revoked subject's *reads and routine module actions*, by at most one token lifetime.
- **Revocation push (refinement, not blocking).** The hub already holds a gRPC session with every spoke. A disabled subject can be pushed as a deny-list entry (subject id, revoked-at) so spokes cut them off within seconds without any per-request call; a spoke that misses the push falls back to expiry. Proposed for v1.1.
- **Keys.** Each token-issuing hub publishes its signing keys (JWKS with key ids); verifiers cache them and follow rotation. In a hub of hubs (§8) a site hub signs the tokens for its site; verifiers trust the site hub's key because the enterprise hub signed the site hub's certificate (Q11).
- **Token shape.** `sub` (immutable subject id, §4), `scopes` with constraints encoded as node ids and attribute selectors, `iss` (issuing hub), `kid`, `exp`, `nbf`, `jti` (revocation key) and `amr` (how the subject authenticated, so MFA-only scopes can be checked).

## 8. Topology (R-9): hub of hubs along ISA-95

**[OWNER]** The enterprise hub is a hub of hubs. One enterprise hub is required; one site hub per site is recommended; area hubs are possible. Levels follow ISA-95 Part 2 (enterprise → site → area → work centre → process).

Owner's worked example: Whiskey House is one 179-acre site. The Distillery area (7 processes) and the Bottling area (5 processes) each run their own hub; the warehouse serves both.

```
enterprise hub (required)       trust root; identity providers; enterprise directory of subjects,
  │                              roles and assignments; cross-site reporting; complete audit ledger
  └─ site hub: Whiskey House    issues tokens for the site; replica of the site's assignments;
       │                         keeps working through a WAN outage; store-and-forward upward
       ├─ area hub: Distillery  7 processes; its OT, Ignition and MES spokes register here
       ├─ area hub: Bottling    5 processes
       └─ warehouse             shared by both areas (Q14)
```

**[PROPOSED] Rules that follow:**

| Concern | Rule |
|---|---|
| Trust | one chain: enterprise CA → site intermediate → area-hub and spoke certificates. FB-072 (hub gRPC TLS, done) and FB-063 (callback TLS) take a CA on both ends already; Q11 decides who runs the CA. |
| Where a decision is made | at the **nearest hub** to the resource (an area hub decides for its processes) against its own replica; an operator action never waits on the enterprise hub. |
| Where assignments live | authored at the hub whose constraint covers the author (§5 delegation), stored once, replicated **downward** to every hub whose subtree they touch; Q13 covers conflicts and edits made during an outage. |
| Identity providers | integrated at the enterprise hub; site hubs cache what their subjects need. Local break-glass accounts may exist at a site hub. |
| Outage | a site hub keeps verifying (offline) and keeps refreshing against its replica for a grace period (Q12); audit and records queue upward (store-and-forward, already a requirement). |
| Audit | every decision record is written where it was made and forwarded upward: the site hub has it immediately, the enterprise hub eventually and completely. |
| Shared resources | an ISA-95 node has exactly one owning hub; Q14 picks the pattern for the warehouse. |

## 9. Identity methods for v1 (R-10)

**[OWNER]** Ship in this order: OIDC + local accounts + service identities (certificate or client credentials); then LDAP / Active Directory bind; then SAML 2.0. All normalise to the subject record of §4.

## 10. Data visibility (R-11)

**[OWNER]** Assignments constrain **reads as well as actions**. Example: an organisation that runs forge-erp must be able to keep ERP data on the hub invisible to distillery operators.

**[PROPOSED] Consequences:**

- Every read is a scope too (`erp:order:read`, `ot:tag:read`, `mes:batch:read`) and carries a constraint like any other. A subject with no `erp:*` scope sees nothing from the ERP domain, on any screen, at any node.
- The hub applies the constraint to **queries**, not only to routes: a record query is rewritten to the subject's visible domains and nodes before it reaches storage. There is no "read everything, filter in the UI".
- forge-display renders only what the subject can read; cross-site views stay read-only by default (the existing FVTS assumption) and can be widened by assignment.
- Module-to-module reads (MES reading ERP orders) run under the module's service identity with its own read scopes, and the final read is still checked against the person's token (`on_behalf_of`, §5), so a module cannot leak a domain to someone who lacks it.

## 11. Presets (A10, clarified): per-module roles are the default (R-12)

"Presets" in Q10 meant only **the role bundles Forge ships**. The owner's reading, that roles are determined per module, is the default: each module ships its domain roles as data (forge-mes: `mes-operator`, `mes-supervisor`, `mes-planner`, `mes-admin`; the OT module: `ot-operator`, `ot-engineer`, `ot-admin`; the hub: `hub-admin`, `hub-auditor`). The "universal ladder" (`viewer < operator < engineer < admin` across all modules) would be an **optional overlay**: four enterprise-wide roles that inherit each module's role of the same rank, for installations that want one simple ladder. Whether the overlay ships in v1 is Q15.

## 12. Migration from today

| Today | Becomes |
|---|---|
| gateway `Role.ADMIN/OPERATOR/VIEWER` | hub roles `hub-admin`, `hub-operator`, `hub-auditor` (and the ladder overlay if Q15 says yes); scopes unchanged (`adapters:*`, `records:*`, `health:read`) plus the new registry |
| OT `WriteRole` | scopes `ot:tag:write`, `ot:recipe:download`, `ot:interlock:bypass`, `ot:alarm:*`; `WritePermission` area/tag patterns become constraints |
| FVTS `required_role` | `required_scope`; the `VIEWER` enum entry disappears (read is the absence of an action) |
| spoke session id + callback token | unchanged (channel authentication); acting subject added to requests |
| hub-issued JWT (`FORGE_JWT_*`) | the access token of §7, now carrying constraints and `iss`/`kid`; verified offline by spokes |

## 13. Open questions (round 3)

- **[OPEN] Q11 PKI:** should Forge run its own certificate authority (the enterprise hub issues and rotates site, area and spoke certificates; no manual PEM handling), or only consume customer-supplied certificates from a corporate PKI? Recommendation: Forge-managed by default, with import of a customer CA or intermediate as an option. FB-072 and FB-063 accept any CA already.
- **[OPEN] Q12 WAN-outage grace:** how long may a site hub keep refreshing tokens from its replica while the enterprise hub is unreachable? Recommendation: administrator-set, default 72 h; beyond that only local break-glass accounts work, and forge-display shows a "degraded trust" banner throughout.
- **[OPEN] Q13 assignment storage and conflicts:** (a) a single system of record at the enterprise hub with site hubs forwarding writes (simple, but a site administrator cannot grant during an outage), or (b) writes accepted at any hub within the author's constraint, queued upward, with the enterprise hub resolving conflicts. The site-autonomy requirement points to (b). Recommendation: (b), conflict rule "latest grant wins", both grants audited.
- **[OPEN] Q14 a resource in two areas:** the warehouse serves Distillery and Bottling. Options: (a) a site-level node owned by the site hub that both area hubs read; (b) an area of its own with its own hub; (c) two nodes, one per area, sharing equipment identity. Recommendation: (a), unless warehouse operations need autonomy from the site hub, then (b).
- **[OPEN] Q15 ladder overlay:** ship the universal-ladder overlay of §11 in v1, or leave it to custom roles?
- **[OPEN] Q16 token lifetimes:** confirm the floor, default and ceiling proposed in §7.
