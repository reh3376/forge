# Forge authorization model — decision record

**Status:** draft, round 5 of the owner dialogue (2026-10-16) · **Backlog:** FB-075 · **Roadmap:** D-1
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
| R-9 | Topology is a **hub of hubs** along ISA-95 Part 2. Every instance has a site hub; a multi-site enterprise adds an enterprise hub above its sites; area hubs are possible below a site. (Round 4 correction: not every instance has an enterprise hub.) Details in §8. | [OWNER] |
| R-10 | Identity methods ship in the order OIDC + local accounts + service identities, then LDAP / Active Directory, then SAML. | [OWNER] |
| R-11 | Assignments constrain **reads as well as actions**: a subject without a domain's read scope sees none of that domain's data (e.g. ERP data hidden from distillery operators). Details in §10. | [OWNER] |
| R-12 | Shipped roles are **per module** (each module ships its domain roles as data). A cross-module "universal ladder" is at most an optional overlay. Details in §11. | [OWNER, overlay question open] |
| R-13 | **Each hub owns what is attached directly to it**: its spokes (the enterprise hub has spokes of its own), its child hubs and the subjects whose credentials are associated with it. Nothing communicates *through* a hub: a subject or hub that needs something held elsewhere asks its **next-hop hub**, which obtains it from the owning hub (unless it already holds it) and serves it. Details in §8. | [OWNER] |
| R-14 | **Each hub collects, governs, stores, curates and serves** the data of its directly attached spokes and hubs. Hubs on the same side of the enterprise hub (one site subtree) request data from one another directly; across the enterprise hub they ask the enterprise hub, which handles it. The same structure applies one level down. Details in §8. | [OWNER] |
| R-15 | Access-token lifetime is an installation choice within the floor and ceiling of §7; the **default is 1 hour**. | [OWNER] |
| R-16 | **Roles are assigned at the managing hub and inherited downward.** The managing hub is the site hub of a single-site instance and the enterprise hub of a multi-site one. Every datum has exactly one source of truth, and that source is a hub; the same data is not stored long-term in two places. | [OWNER] |
| R-17 | **Audit records always flow upward**; every other data set is requested on demand unless a site opts it into replication. | [OWNER] |

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

**Numbers and mechanics** (range confirmed by the owner in round 3, default set to 1 h; the mechanics remain [PROPOSED]):

| Setting | Proposed | Why |
|---|---|---|
| access-token lifetime floor | 5 min | below this every client refreshes constantly; a thousand HMI sessions at 1 min is ~17 refreshes/s on a site hub |
| access-token lifetime default | **1 h** [OWNER] | the owner's call; an installation may set anything between the floor and the ceiling |
| access-token lifetime ceiling | 12 h | one long shift; longer and a token outlives a shift change |
| refresh-token lifetime | administrator-set, default 8 h, absolute maximum 30 d | sliding, revocable, only ever presented to the hub |

- **Refresh tokens make "expiry" the revocation bound without constant re-login.** The access token is the short-lived, offline-checked statement. A refresh token is longer-lived and is redeemed only at the hub, which checks that the subject is still enabled and re-reads the current assignments before issuing a new access token. Disable a subject and they lose access at the next refresh, never later than the access-token lifetime.
- **High-impact actions are online anyway.** Tag writes, interlock bypass, approvals and grants already pass through the hub (write-back path; pending actions, §6), and the hub checks the subject live there regardless of the token. The offline model therefore only ever extends a revoked subject's *reads and routine module actions*, by at most one token lifetime.
- **Revocation push (refinement, not blocking).** The hub already holds a gRPC session with every spoke. A disabled subject can be pushed as a deny-list entry (subject id, revoked-at) so spokes cut them off within seconds without any per-request call; a spoke that misses the push falls back to expiry. Proposed for v1.1.
- **Keys.** Each token-issuing hub publishes its signing keys (JWKS with key ids); verifiers cache them and follow rotation. In a hub of hubs (§8) a site hub signs the tokens for its site; verifiers trust the site hub's key because the enterprise hub signed the site hub's certificate (Q11).
- **Token shape.** `sub` (immutable subject id, §4), `scopes` with constraints encoded as node ids and attribute selectors, `iss` (issuing hub), `kid`, `exp`, `nbf`, `jti` (revocation key) and `amr` (how the subject authenticated, so MFA-only scopes can be checked).

## 8. Topology (R-9): hub of hubs along ISA-95

**[OWNER]** The enterprise hub is a hub of hubs. One enterprise hub is required; one site hub per site is recommended; area hubs are possible. Levels follow ISA-95 Part 2 (enterprise → site → area → work centre → process).

Owner's worked example: Whiskey House is one 179-acre site. The Distillery area (7 processes) and the Bottling area (5 processes) each run their own hub; the warehouse serves both. The enterprise hub has spokes of its own (ERP, corporate systems).

```
enterprise hub (required)       trust root; identity providers; enterprise directory of subjects,
  │                              roles and assignments; cross-site reporting; complete audit ledger
  ├─ enterprise spokes          ERP, corporate systems; governed by the enterprise hub itself
  └─ site hub: Whiskey House    home hub of the site's subjects; owns the site's spokes and area hubs;
       │                         governs and serves the site's data; never waits on the WAN for local work
       ├─ area hub: Distillery  7 processes; its OT, Ignition and MES spokes register here
       ├─ area hub: Bottling    5 processes
       └─ warehouse             shared by both areas (Q14)
```

**[OWNER, round 3]** Each hub (area, site or enterprise) controls the spokes attached directly to it. A user's credentials are associated with one hub; to reach a hub that is not theirs, the user goes through the next-hop hub: an area-hub user reaches another area hub in the same site through the site hub, a site-hub user reaches another site through the enterprise hub. Each hub collects, governs, stores, curates and serves the data of the spokes and hubs attached to it, and serves it to them. Hubs on the same side of the enterprise hub may request data from any hub on that side directly; they cannot reach a hub on the other side directly and must ask the enterprise hub, which handles it. The same structure applies to a one-site, two-area set-up. WAN-outage grace therefore only matters when a user reaches for a hub that is not local to them.

**[OWNER, round 4 clarification]** No hub communicates *through* the enterprise hub; the transfer occurs *at* it. When site A's hub wants the current or historical value of `SiteB.Area01.Cell004.Filler01.OEE`, it asks the enterprise hub; the enterprise hub requests that value directly from site B's hub, unless it already holds it, and serves it to site A.

**[OWNER, round 4]** A17: the next-hop hub serves the request; nothing tunnels through a hub (confirmed). A18 and A19: all data has one source of truth, and that source is a hub; the same data is not stored long-term in several places; audit records always flow upward, everything else is requested on demand unless a site opts a data set in. A20: roles are assigned at the managing hub and inherited: the site hub in a single-site installation, the enterprise hub in a multi-site one. Not every Forge instance has an enterprise hub; every instance has a site hub.

**[PROPOSED] Claude's restatement (rows marked resolved are now owner decisions):**

| Concern | Rule |
|---|---|
| Trust (PKI) | The hub tree **is** the certificate tree. The enterprise hub holds the root CA and issues an intermediate CA to each site hub; a site hub issues an intermediate to each area hub; every hub issues leaf certificates to its own spokes. Hub-to-hub and spoke-to-hub links are mTLS verified against the enterprise root (FB-063 and FB-072 take a CA on both ends already). Each hub's token-signing key is certified by its parent, so any hub verifies any other hub's tokens offline (R-8) by walking the chain, never by calling the issuer. |
| Home hub | Every subject has exactly one home hub: where its credentials are associated, where its subject record and sign-in live, and which signs its tokens. Corporate users signing in through OIDC at the enterprise hub are homed there; site users at the site hub; area users at the area hub. |
| Cross-hub access | A subject talks only to its next-hop hub. That hub verifies the home-hub token against the chain, checks what the subject may read or do at the target, obtains the data or the action's outcome from the owning hub (through its own next hop when needed) and serves it. No session is tunnelled and no visitor token is issued (resolves Q17). |
| Where assignments live (R-16) | At the **managing hub** only: the site hub of a single-site instance, the enterprise hub of a multi-site one. Lower hubs inherit them. What a site hub holds locally so that local sign-in survives a WAN outage is Q21. |
| Where a decision is made | At the hub that owns the resource, against its own store. A local operation never waits on another hub. |
| Data requests | Direct between hubs on the same side of the enterprise hub; across sites, site A asks the enterprise hub, which fetches from site B's hub unless it already holds the value, and serves site A. The same rule one level down. A hub answers with what it governs, filtered by the requesting subject's read scopes (R-11). The enterprise hub therefore holds copies of site data; how they get there is Q19. |
| Outage (resolves Q12) | Local work never depends on the WAN, so there is no grace period to design for it. A non-local hub is simply unreachable while the next hop is down; local break-glass accounts cover administration meanwhile. |
| Shared resources (resolves Q14) | A resource is attached to exactly one hub: the warehouse to whichever hub it is wired into (the site hub, or one of the area hubs). The other area hub requests its data from the owning hub, which is direct within the site. |
| Audit (R-17) | Every decision record is written at the hub that made it and always flows upward; other data is requested on demand unless a site opts a data set into replication. |

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

"Presets" in Q10 meant only **the role bundles Forge ships**. The owner's reading, that roles are determined per module, is the default: each module ships its domain roles as data (forge-mes: `mes-operator`, `mes-supervisor`, `mes-planner`, `mes-admin`; the OT module: `ot-operator`, `ot-engineer`, `ot-admin`; the hub: `hub-admin`, `hub-auditor`). The "universal ladder" (`viewer < operator < engineer < admin` across all modules) would be an **optional overlay**: four enterprise-wide roles that inherit each module's role of the same rank, for installations that want one simple ladder. Whether the overlay ships in v1 is Q20 (Q15 re-asked with context).

## 12. Migration from today

| Today | Becomes |
|---|---|
| gateway `Role.ADMIN/OPERATOR/VIEWER` | hub roles `hub-admin`, `hub-operator`, `hub-auditor` (and the ladder overlay if Q15 says yes); scopes unchanged (`adapters:*`, `records:*`, `health:read`) plus the new registry |
| OT `WriteRole` | scopes `ot:tag:write`, `ot:recipe:download`, `ot:interlock:bypass`, `ot:alarm:*`; `WritePermission` area/tag patterns become constraints |
| FVTS `required_role` | `required_scope`; the `VIEWER` enum entry disappears (read is the absence of an action) |
| spoke session id + callback token | unchanged (channel authentication); acting subject added to requests |
| hub-issued JWT (`FORGE_JWT_*`) | the access token of §7, now carrying constraints and `iss`/`kid`; verified offline by spokes |

## 13. Open questions (round 5)

Resolved in round 3: Q11 (the PKI follows the hub tree, restated in §8), Q12 (no WAN grace for local work; a non-local hub needs the next hop), Q13 (each hub stores and governs its own; direct within a site, through the enterprise hub across sites), Q14 (one owning hub per resource; the other hub requests), Q16 (lifetime range confirmed, default 1 h).

- **Resolved Q17 (round 4 clarification):** the next-hop hub is in the data path as a serving broker, never a tunnel. It fetches from the owning hub unless it already holds the value, and serves the requester; no visitor token, no proxied session.
- **Resolved Q18 and Q19 (round 4):** assignments live at the managing hub only and are inherited (R-16); audit always upward, everything else on demand unless opted in (R-17).
- **Q20 (round 4):** the owner decided where roles are assigned (R-16); whether the four-role ladder ships as a preset is re-asked as Q22.
- **[OPEN] Q21 the site hub's working copy:** assignments are mastered at the managing hub (R-16), and local sign-in must survive a WAN outage (A12). A site hub below an enterprise hub therefore needs the assignments that apply to its subtree at hand. Proposal: it holds them as a **derived copy** refreshed from the managing hub, never edited locally, with the managing hub remaining the single source of truth; tokens issued at the site carry the scopes from that copy. Is a refreshed derived copy acceptable under "no long-term duplicate storage", or must a site hub fetch assignments from the enterprise hub at every sign-in, and therefore sign nobody in while the WAN is down?
- **[OPEN] Q22 ladder preset, yes or no:** ship the four generic roles (`viewer`, `operator`, `engineer`, `admin`, each inheriting every installed module's role of the same rank) as an optional preset, off by default and chosen at setup (§11)? Yes or no is enough.
