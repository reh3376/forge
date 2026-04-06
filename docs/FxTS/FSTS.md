# FSTS — Forge Security Test Specification

**Framework ID:** FSTS
**Full Name:** Forge Security Test Specification
**CI Gate:** Hard-fail (merge-blocking)
**Status:** Stub (directory structure exists)
**Phase:** F14
**MDEMG Analog:** USTS

---

## Purpose

FSTS governs security controls. Every service and adapter in Forge must meet declared security requirements. FSTS specs define what security behavior must exist — authentication enforcement, authorization rules, injection prevention, data exposure controls, and security headers.

Security is a non-negotiable design principle of the WHK Digital Strategy ("security by design"). FSTS operationalizes this by making security contracts enforceable and auditable.

## What FSTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Authentication** | Required auth methods, token validation | Auth bypass attempts blocked |
| **Authorization** | Role/permission requirements per endpoint | Unauthorized access denied |
| **Injection** | Input sanitization requirements | SQL/NoSQL/command injection blocked |
| **Data Exposure** | Sensitive field handling (PII, secrets) | No sensitive data in logs, responses, errors |
| **Headers** | Required security headers (CORS, CSP, etc.) | Headers present with correct values |

## Schema Structure (Planned)

```
fsts.schema.json
├── spec_version
├── target                # service_id or adapter_id being secured
├── authentication
│   ├── required_methods[]    # jwt, azure_ad, api_key, certificate
│   ├── token_validation      # expiry, audience, issuer checks
│   └── session_management    # timeout, rotation, revocation
├── authorization
│   ├── model                 # RBAC | ABAC | custom
│   ├── default_deny          # boolean (must be true)
│   └── rules[]               # resource, action, required_roles[]
├── injection_prevention
│   ├── input_sanitization    # boolean
│   ├── parameterized_queries # boolean
│   └── test_vectors[]        # known injection patterns to test against
├── data_exposure
│   ├── sensitive_fields[]    # field names that must never appear in logs/errors
│   ├── pii_handling          # mask | encrypt | omit
│   └── error_sanitization    # boolean (no stack traces in production)
├── headers
│   ├── required[]            # header name, expected value pattern
│   └── owasp_mapping[]      # OWASP A01-A10 references
└── metadata
```

## Key Design Decisions

- **OWASP mapping** — Every security check maps to an OWASP Top 10 category, providing a familiar reference for security audits.
- **Default deny is mandatory** — FSTS enforces that all services use deny-by-default authorization. No endpoint is accessible without explicit permission.
- **Manufacturing-specific PII** — In manufacturing, PII includes operator IDs, shift assignments, and production data tied to specific workers. FSTS handles these manufacturing-context sensitive fields.

## Dependencies

- API Gateway (F05) — primary target for security specs
- Shared FxTS runner infrastructure (F10)
- Authentication module (F08)

## Implementation Status

Stub exists at `src/forge/governance/fsts/`. Schema, runner, and specs not yet created. Will be built as part of phase F14.
