# FPTS — Forge Performance Test Specification

**Framework ID:** FPTS
**Full Name:** Forge Performance Test Specification
**CI Gate:** Soft-fail (warning, non-blocking)
**Status:** Planned
**Phase:** F15
**MDEMG Analog:** UBTS (adapted)

---

## Purpose

FPTS governs throughput and latency benchmarks. Manufacturing data platforms must handle sustained high-volume data flows (thousands of sensor readings per second) with predictable latency. FPTS specs define performance profiles — baseline, burst, and stress — and the runner validates that the platform meets these under load.

Performance governance prevents the "works in dev, fails in production" problem. By declaring performance requirements as specs and running them in CI, Forge catches performance regressions before they reach production.

## What FPTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Throughput** | Records per second (sustained and burst) | Actual throughput meets target |
| **Latency** | p50, p95, p99 latency targets | Latency percentiles within bounds |
| **Resource Usage** | Max memory, CPU, connection pool utilization | Resources within declared limits |
| **Scalability** | Linear scaling expectation with N workers | Throughput scales proportionally |
| **Degradation** | Graceful degradation behavior under overload | Backpressure, not crash |

## Schema Structure (Planned)

```
fpts.schema.json
├── spec_version
├── target                # service_id, adapter_id, or pipeline_id
├── profiles
│   ├── smoke             # lightweight validation (runs in CI)
│   │   ├── duration_seconds
│   │   ├── target_rps    # requests/records per second
│   │   └── max_latency_p99_ms
│   ├── load              # sustained load (runs nightly)
│   │   ├── duration_seconds
│   │   ├── target_rps
│   │   ├── ramp_up_seconds
│   │   └── latency_targets  # {p50, p95, p99}
│   └── stress            # breaking point discovery (runs weekly)
│       ├── start_rps
│       ├── step_rps
│       ├── step_duration_seconds
│       └── failure_criteria  # when to stop (error_rate_pct, latency_p99)
├── resource_limits
│   ├── max_memory_mb
│   ├── max_cpu_pct
│   └── max_connections
├── degradation
│   ├── backpressure_mode   # reject | queue | throttle
│   └── recovery_time_seconds
└── metadata
```

## Key Design Decisions

- **Three profile tiers** — Smoke (fast, runs in CI), load (sustained, nightly), stress (breaking point, weekly). This balances CI speed with thorough validation.
- **Manufacturing throughput patterns** — Burst profiles model equipment startups (sudden data flood when a batch begins). Sustained profiles model steady-state operation.
- **Graceful degradation is mandatory** — FPTS requires that overload causes backpressure, not crashes. The spec declares which backpressure mode the service uses.

## Dependencies

- All platform services — FPTS can target any service
- Shared FxTS runner infrastructure (F10)
- Load testing toolset (Locust, k6, or custom)

## Implementation Status

Not yet implemented. No scaffold directory exists. Will be built as part of phase F15.
