# FATS — Forge API Test Specification

**Framework ID:** FATS
**Full Name:** Forge API Test Specification
**CI Gate:** Hard-fail (merge-blocking)
**Status:** Schema + Runner implemented (v0.1.0)
**Phase:** F11
**MDEMG Analog:** UATS

---

## Purpose

FATS governs API contracts. When a FATS spec declares an endpoint, that endpoint MUST exist and behave exactly as specified. FATS is the primary mechanism for ensuring that every Forge platform service (gateway, registry, context engine, storage, curation, decision support) exposes APIs that are predictable, documented, and enforceable.

## What FATS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Endpoint** | Path (e.g., `/v1/health`) | Path format, existence |
| **Method** | HTTP method (GET, POST, etc.) | Valid method enum |
| **Authentication** | Required/optional, allowed schemes | Auth fields present, schemes valid |
| **Request** | Request body schema, headers, query params | Request envelope present |
| **Response** | Success status code, error format, latency | Status code match, structure, timing |
| **Rate Limit** | Requests per minute | Rate limit field present |

## Schema

**Location:** `src/forge/governance/fats/schema/fats.schema.json`

Top-level fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec_version` | string | yes | Schema version (currently `0.1.0`) |
| `endpoint` | string | yes | API path (must start with `/`) |
| `method` | string | yes | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `authentication` | object | yes | `required: bool`, `schemes: string[]` |
| `request` | object | yes | Request body/params definition |
| `response` | object | yes | `success_status: int`, `error_format: object` |
| `rate_limit` | object | yes | `requests_per_minute: int` |

## Runner

**Location:** `src/forge/governance/fats/runners/fats_runner.py`
**Class:** `FATSRunner(FxTSRunner)`
**Version:** 0.1.0

### Check Catalog

| Check ID | Spec Ref | What it validates |
|----------|----------|-------------------|
| `fats:spec-version` | `FATS/spec_version` | Spec version is `0.1.0` |
| `fats:endpoint-format` | `FATS/endpoint` | Endpoint starts with `/` |
| `fats:endpoint-match` | `FATS/endpoint` | Spec endpoint matches target |
| `fats:method` | `FATS/method` | Method is in allowed set |
| `fats:authentication` | `FATS/authentication` | `required` and `schemes` fields present |
| `fats:request` | `FATS/request` | Request section exists |
| `fats:response` | `FATS/response` | `success_status` and `error_format` present |
| `fats:rate-limit` | `FATS/rate_limit` | `requests_per_minute` defined |

### Live Checks (optional, `--live` flag)

| Check ID | What it validates |
|----------|-------------------|
| `fats:live-status` | Actual HTTP status matches `success_status` |
| `fats:live-latency` | Response time within `max_latency_ms` |
| `fats:live-connect` | Endpoint is reachable |

### Usage

```bash
# Static validation (spec-only, no HTTP calls)
forge governance run fats --spec path/to/spec.fats.json

# Live validation against a running service
forge governance run fats --spec path/to/spec.fats.json --live --base-url http://localhost:8000
```

### Programmatic Usage

```python
from forge.governance.fats.runners.fats_runner import FATSRunner

runner = FATSRunner(
    schema_path="governance/fats/schema/fats.schema.json",
    base_url="http://localhost:8000",
)

# Static check
report = await runner.run(target="/v1/health", spec=my_spec_dict)

# Live check
report = await runner.run(target="/v1/health", spec=my_spec_dict, live=True)

if not report.passed:
    for v in report.verdicts:
        if v.status != "PASS":
            print(f"  [{v.status}] {v.check_id}: {v.message}")
```

## Writing a FATS Spec

### Example: Health Endpoint

```json
{
  "spec_version": "0.1.0",
  "endpoint": "/v1/health",
  "method": "GET",
  "authentication": {
    "required": false,
    "schemes": []
  },
  "request": {
    "body": null,
    "query_params": [],
    "headers": []
  },
  "response": {
    "success_status": 200,
    "error_format": {
      "type": "object",
      "properties": {
        "error": { "type": "string" },
        "message": { "type": "string" }
      }
    },
    "max_latency_ms": 500
  },
  "rate_limit": {
    "requests_per_minute": 60
  }
}
```

### Naming Convention

`{service}-{endpoint-slug}.fats.json`

Examples:
- `gateway-health.fats.json`
- `registry-schema-register.fats.json`
- `context-enrich.fats.json`

## Planned Enhancements (Future Versions)

- Variant support (multiple test cases per spec)
- Environment variable resolution (`${FORGE_BASE_URL}`)
- JSONPath body assertions for response validation
- Request/response schema validation against JSON Schema definitions
- Makefile targets: `make test-api`, `make test-api-{spec}`
