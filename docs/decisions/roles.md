# Forge authorization model — decision record

**Status:** draft, round 2 of the owner dialogue (2026-10-16) · **Backlog:** FB-075 · **Roadmap:** D-1
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

## 7. Token model — context for the owner (A6)

After sign-in the hub issues the subject a **token**: a signed statement (JWT) saying who they are, which scopes they hold, with which constraints, valid for a short time (minutes). Two ways a spoke can honour it:

| Model | How it works | Strength | Weakness |
|---|---|---|---|
| **Offline verification** | the spoke checks the token's signature with the hub's public key and reads the scopes from it; no call to the hub per request | fast (microseconds), keeps working if the hub is briefly unreachable | a revoked subject keeps working until the token expires (minutes); scopes are frozen at issue time |
| **Online check** | the spoke asks the hub "may subject S do X on Y?" for every action | instant revocation, always-current rules, one audit point | adds a round trip (milliseconds) and a hub dependency to every action |

**[PROPOSED] Hybrid:** offline-verified short-lived tokens for reads and routine actions; **online decisions for high-impact scopes** (tag writes, interlock bypass, approvals, grants), which already pass through the hub on the write-back path; plus a revocation push from the hub to spokes over the existing gRPC session so a disabled subject is cut off within seconds, not minutes. The industrial constraint that decides this: a PLC write must not depend on an *enterprise* identity provider being reachable, but it may depend on the *site's* hub — which raises Q7.

## 8. Migration from today

| Today | Becomes |
|---|---|
| gateway `Role.ADMIN/OPERATOR/VIEWER` | shipped roles in the universal-ladder preset; scopes unchanged (`adapters:*`, `records:*`, `health:read`) plus the new registry |
| OT `WriteRole` | scopes `ot:tag:write`, `ot:recipe:download`, `ot:interlock:bypass`, `ot:alarm:*`; `WritePermission` area/tag patterns become constraints |
| FVTS `required_role` | `required_scope`; the `VIEWER` enum entry disappears (read is the absence of an action) |
| spoke session id + callback token | unchanged (channel authentication); acting subject added to requests |

## 9. Open questions

- **[OPEN] Q6 (owner to confirm after §7):** hybrid token model as proposed, or strictly online, or strictly offline?
- **[OPEN] Q7 topology:** one central hub for the enterprise, or a hub per site federated upward? This decides where tokens are issued and verified, what keeps working during a WAN outage, and whether assignments are stored per site or centrally. (Owner's earlier notes: site autonomy and store-and-forward are requirements.)
- **[OPEN] Q8 identity methods for v1:** which of §4 ship first? Proposed order: OIDC + local accounts + service identities, then LDAP/AD, then SAML.
- **[OPEN] Q9 data visibility:** do assignments also constrain what a subject can *read* (site-scoped records, cross-site dashboards read-only), or only what they can do? FVTS currently assumes cross-site views are read-only.
- **[OPEN] Q10 preset catalogue:** which presets ship in v1 — universal ladder, domain roles (one default role set per module), and custom — and may a site mix them (ladder for OT, domain roles for MES)?
