# WorkOS Overview

_Last updated: 2026-04-06 (public docs and pricing reviewed on this date)_

## What WorkOS is

WorkOS is a developer platform for making a SaaS product **enterprise-ready** without building all of the enterprise identity and access infrastructure yourself. Its main value is that it gives you a single platform and API surface for:

- enterprise authentication
- user and organization management
- SSO with customer identity providers
- directory sync / provisioning
- admin self-service onboarding
- RBAC and fine-grained authorization
- audit logging
- feature rollout controls

In plain English: if you sell software to companies and they ask for **Okta / Entra SSO, SCIM provisioning, role mapping, audit logs, and self-serve IT admin setup**, WorkOS is designed to cover that layer.

---

## Core functionality

### 1. AuthKit / User Management

WorkOS AuthKit is the authentication and user-management layer. According to the docs, it supports:

- Single Sign-On (SSO)
- Email & Password
- Social Login
- Multi-Factor Authentication (MFA)
- Magic Auth

AuthKit can be used with a prebuilt hosted UI or through the API if you want to own the full sign-in experience yourself.

**Why this matters:** it gives you a single auth layer that can start simple and then expand to enterprise SSO later without replacing your whole authentication stack.

Docs:
- https://workos.com/docs/authkit/overview
- https://workos.com/docs

### 2. Enterprise SSO

WorkOS SSO provides a unified integration layer for enterprise identity providers using **SAML** and **OIDC**.

Typical use cases:
- Sign in with Okta
- Sign in with Microsoft Entra ID / Azure AD
- Sign in with Google Workspace
- Support enterprise procurement/security requirements

**Why this matters:** enterprise customers often will not buy your product until SSO exists.

Docs:
- https://workos.com/docs/sso
- https://workos.com/docs/authkit/sso

### 3. Directory Sync / Provisioning

Directory Sync is WorkOS’s user lifecycle management layer. It is intended to solve the ugly parts of SCIM-style provisioning and deprovisioning.

It handles events such as:
- new user provisioning
- attribute updates
- account deprovisioning
- group / access-rule changes

Supported source systems mentioned in the docs include Microsoft Active Directory, Okta, Workday, and Google Workspace.

Directory updates can be delivered by **webhooks** or retrieved through WorkOS APIs.

**Why this matters:** enterprise IT wants user lifecycle control from their directory, not manual account management inside your app.

Docs:
- https://workos.com/docs/directory-sync
- https://workos.com/directory-sync
- https://workos.com/docs/authkit/directory-provisioning

### 4. Admin Portal

Admin Portal gives customer IT admins a self-service setup flow for:

- domain verification
- SSO configuration
- Directory Sync configuration
- log stream setup
- reviewing connection/session details

WorkOS supports two main approaches:
- share a setup link from the WorkOS dashboard
- integrate Admin Portal directly into your app via SDKs / API

**Why this matters:** your team does not have to manually walk every enterprise customer through SSO and provisioning setup.

Docs:
- https://workos.com/docs/admin-portal
- https://workos.com/docs/admin-portal#add-to-your-app

### 5. RBAC (Role-Based Access Control)

WorkOS RBAC lets you define roles and permissions, then check access from your app. It also integrates with AuthKit, so roles can be attached to organization memberships and read from session JWT claims.

It also supports **IdP role assignment**, where enterprise identity-provider groups can map to roles in your app.

**Why this matters:** you avoid inventing a half-broken permissions model and can line up app roles with the customer’s identity system.

Docs:
- https://workos.com/docs/rbac/quick-start
- https://workos.com/docs/rbac/integration
- https://workos.com/docs/rbac/idp-role-assignment
- https://workos.com/docs/rbac/organization-roles

### 6. Fine-Grained Authorization (FGA)

WorkOS FGA extends simple RBAC for more complex application authorization. It is aimed at products where organization-wide roles are not enough and access has to be scoped to nested resources such as workspaces, projects, apps, pipelines, or other product objects.

Key ideas from the docs:
- access checks answer: _can this user do this action on this resource?_
- permissions can be inherited from parent resources
- it is built to handle more complex B2B SaaS authorization structures

WorkOS also publishes migration guidance from OpenFGA.

**Why this matters:** once your product grows, basic org-level roles often stop being enough.

Docs:
- https://workos.com/docs/fga/quick-start
- https://workos.com/docs/fga/access-checks
- https://workos.com/docs/fga/migration-openfga
- https://workos.com/docs/fga/resource-types

### 7. Audit Logs

WorkOS Audit Logs provides strongly typed, exportable audit event capture and streaming for enterprise customers and compliance workflows.

Typical use cases:
- logging user/admin actions
- compliance evidence
- SIEM streaming
- customer-facing audit trails

**Why this matters:** security reviews and enterprise buyers commonly require auditable activity history.

Docs:
- https://workos.com/audit-logs
- https://workos.com/docs/audit-logs

### 8. Feature Flags

WorkOS Feature Flags lets you roll out functionality to:

- specific organizations
- specific users

The docs position it as part of the authenticated product experience, with flags accessible through the user’s access token.

**Why this matters:** safer rollouts, controlled beta programs, and premium feature gating.

Docs:
- https://workos.com/docs/feature-flags
- https://workos.com/docs/feature-flags/index

---

## How to use WorkOS

## Typical implementation path

A practical implementation usually looks like this:

1. **Create a WorkOS account** and configure a staging environment.
2. **Pick an SDK** for your backend stack.
3. **Store your API credentials** securely as environment variables.
4. **Integrate authentication** using AuthKit hosted UI or the API.
5. **Add organizations** if your app is multi-tenant.
6. **Enable SSO** for enterprise customers that need SAML/OIDC login.
7. **Enable Directory Sync** if customers need SCIM-style provisioning/deprovisioning.
8. **Embed or link the Admin Portal** so customer IT can self-configure.
9. **Define roles and permissions** using RBAC, and move to FGA if your authorization model becomes resource-hierarchical.
10. **Emit audit log events** for compliance-sensitive actions.
11. **Use feature flags** for controlled rollouts or enterprise entitlements.

## Minimal integration pattern

At the docs level, WorkOS expects a fairly standard setup:

### Step 1: install an SDK

Examples:
- Node: `npm install @workos-inc/node`
- Go: `go get -u github.com/workos/workos-go/v6`
- Python: see the Python SDK repo and API reference

SDK repos:
- https://github.com/workos/workos-node
- https://github.com/workos/workos-go
- https://github.com/workos/workos-python

### Step 2: configure secrets

The Admin Portal docs show the standard secret pattern:

- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`

These should live in managed secrets / environment variables, not in source control.

### Step 3: choose the UX model

You have two broad choices:

- **Hosted / prebuilt**: faster time to value, less UX control
- **API-driven / custom UI**: more control, more implementation work

### Step 4: onboard enterprise customers

For a customer organization, the usual sequence is:

- create an organization in WorkOS
- verify the customer domain
- configure SSO connection(s)
- optionally configure Directory Sync
- map IdP groups to application roles
- test sign-in and provisioning behavior

### Step 5: wire your app logic

Your application still needs to do the product-specific work:

- create or update users in your own database
- map WorkOS organizations to your tenant/account model
- apply role and permission checks in application code
- receive webhooks and handle provisioning changes
- send audit events for important actions

## Best-fit use cases

WorkOS is strongest when your product is:

- **B2B SaaS**
- **multi-tenant**
- selling into **mid-market or enterprise accounts**
- likely to face requests for **SSO, provisioning, auditability, and delegated administration**

It is usually **not** the most obvious fit if you only need lightweight consumer authentication and do not expect enterprise buying requirements.

---

## Public pricing summary

> Pricing below is based on WorkOS’s public pricing page reviewed on **2026-04-06**. Always verify current pricing directly before committing architecture or budget.

### General billing notes

- WorkOS says you can **start for free**.
- You **do not need to add a credit card until you are ready to move to production**.
- **All products are available in staging at no cost** for testing.

Pricing page:
- https://workos.com/pricing

### 1. AuthKit

- Up to **1 million monthly active users**: **Free**
- Each additional **1 million users**: **$2,500/month**

Interpretation:
- extremely attractive if your bottleneck is enterprise features, not basic MAU pricing
- the free tier is unusually large for early and mid-stage SaaS teams

### 2. Enterprise SSO

Priced per **connection**.

A WorkOS connection is defined as the relationship between WorkOS and a group of end users for an enterprise customer. WorkOS states that **each enterprise customer you support with SSO or Directory Sync counts as one connection**.

Public pricing:

| Number of connections | Price per connection per month |
|---|---:|
| 1-15 | $125 |
| 16-30 | $100 |
| 31-50 | $80 |
| 51-100 | $65 |
| 101-200 | $50 |

Important note from WorkOS:
- pricing is **not based on number of end users** inside the connection
- it is billed per customer connection instead

### 3. Directory Sync

Also priced per **connection**, with the same public price bands:

| Number of connections | Price per connection per month |
|---|---:|
| 1-15 | $125 |
| 16-30 | $100 |
| 31-50 | $80 |
| 51-100 | $65 |
| 101-200 | $50 |

This means your cost scales more with **number of enterprise customer setups** than with seat count.

### 4. Audit Logs

Public pricing on the Audit Logs / pricing pages:

- **Log streaming**: **$125/month per SIEM connection**
- **Event retention**: **$99/month per 1 million stored events**

### 5. Admin Portal

WorkOS states that **Admin Portal is included in all WorkOS accounts**.

However:
- **custom branding** and **custom domains** are additional paid options
- the public docs reviewed here do **not** show a specific public price for those add-ons
- the docs say to reach out to support / sales for custom domain setup

### 6. RBAC, FGA, Feature Flags, and other products

The public docs clearly describe these products, but the public pricing material reviewed for this note does **not** clearly expose a stand-alone public price for each of them.

Engineering takeaway:
- treat these as products/features you should verify directly with WorkOS sales or the current dashboard before making a hard budget assumption
- do not assume they are free just because a public price is not shown in the snippet reviewed here

---

## Cost examples

These are rough examples based strictly on the public pricing above.

### Example A: 8 enterprise SSO customers

- 8 SSO connections × $125 = **$1,000/month**

### Example B: 25 SSO customers

- first pricing band no longer applies uniformly; WorkOS publishes the 16-30 band at **$100 per connection**
- rough expected monthly spend at 25 connections: **about $2,500/month**

### Example C: 10 Directory Sync customers + 10 SSO customers

This depends on whether you are paying for both product types per customer connection in your commercial plan. Public pages clearly list SSO and Directory Sync separately, but you should verify how mixed-product billing is applied in your specific contract.

Conservative budgeting approach:
- assume each enabled product can carry its own per-connection cost until confirmed otherwise

### Example D: Audit Logs with 3 SIEM streams and 8 million retained events

- 3 × $125 = **$375/month** for streaming
- 8 × $99 = **$792/month** for retention
- total = **$1,167/month**

---

## Open-source status

WorkOS itself is a hosted commercial platform, not an open-source identity platform.

What is open source:
- official SDKs and related libraries published in the WorkOS GitHub organization
- several SDK repos are public and MIT-licensed

Useful links:
- https://github.com/workos
- https://github.com/workos/workos-node
- https://github.com/workos/workos-python
- https://github.com/workos/workos-go

---

## Engineering assessment

### Where WorkOS is strong

- fast path to enterprise-ready SaaS capabilities
- avoids hand-building SAML/OIDC edge cases
- avoids hand-building SCIM / provisioning complexity
- reduces IT-admin onboarding friction with Admin Portal
- coherent identity + authorization + audit surface
- good fit for teams that want to **buy infrastructure instead of maintaining it**

### Where you should be careful

- this is still a **vendor dependency** in a high-leverage part of your stack
- enterprise auth and provisioning can become deeply coupled to your tenant/user model
- authorization design still remains **your problem** at the business-logic layer even if WorkOS provides primitives
- if you already have a mature internal identity platform, introducing WorkOS may duplicate capabilities
- if your product is not actually facing enterprise requirements, WorkOS may be overkill

### First-principles build-vs-buy view

Use WorkOS when:
- enterprise features close deals
- your internal team should stay focused on product differentiation
- the opportunity cost of building SSO / provisioning / audit infrastructure is high

Consider building or using a more self-hosted/open route when:
- you need deep control of the identity plane
- vendor lock-in is unacceptable
- your compliance, tenancy, or custom auth model is very unusual
- you already have the internal engineering capacity and a durable reason to own the full stack

---

## Further research URLs

### Product and docs
- https://workos.com/
- https://workos.com/docs
- https://workos.com/pricing
- https://workos.com/docs/authkit/overview
- https://workos.com/docs/sso
- https://workos.com/docs/directory-sync
- https://workos.com/docs/admin-portal
- https://workos.com/docs/rbac/quick-start
- https://workos.com/docs/fga/quick-start
- https://workos.com/audit-logs
- https://workos.com/docs/feature-flags

### SDKs and examples
- https://github.com/workos
- https://github.com/workos/workos-node
- https://github.com/workos/workos-python
- https://github.com/workos/workos-go

### Status / trust / legal
- https://status.workos.com/
- https://trust.workos.com/
- https://workos.com/legal/terms-of-service

---

## Bottom line

WorkOS is best understood as a **commercial enterprise identity and access acceleration layer** for B2B SaaS. If your product is moving upmarket and enterprise deals are being slowed by auth, provisioning, permissions, and audit requirements, WorkOS can compress a large amount of non-differentiating engineering work into an API/service purchase.

If you are only solving basic consumer auth, it is probably too much platform for the job.
