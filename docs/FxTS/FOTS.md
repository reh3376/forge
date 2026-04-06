# FOTS — Forge Observability Test Specification

**Framework ID:** FOTS
**Full Name:** Forge Observability Test Specification
**CI Gate:** Soft-fail (warning, non-blocking)
**Status:** Planned
**Phase:** F15
**MDEMG Analog:** UOBS/UOTS (adapted)

---

## Purpose

FOTS governs pipeline health and observability. Every service, adapter, and data pipeline in Forge must be observable — meaning its health, throughput, latency, error rate, and data freshness can be measured and monitored. FOTS specs define what observability must exist and what SLOs (Service Level Objectives) must be met.

Observability is how Forge detects problems before they become decision-quality issues. A stale data product, a degraded adapter, or a backlogged message queue are all signals that the platform's ability to support good decisions is compromised.

## What FOTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Health Endpoints** | Service must expose health check | Health endpoint returns valid status |
| **Metrics** | Required metrics (throughput, latency, errors) | Metrics emitted with correct labels |
| **Data Freshness** | Max age for data products | Last-updated timestamp within SLO |
| **Pipeline Latency** | End-to-end processing time SLO | Ingestion-to-availability latency measured |
| **Alerting** | Required alert rules per service | Alerts configured in monitoring system |

## Schema Structure (Planned)

```
fots.schema.json
├── spec_version
├── target                # service_id, adapter_id, or pipeline_id
├── health
│   ├── endpoint          # health check URL path
│   ├── interval_ms       # check frequency
│   └── timeout_ms        # max response time
├── metrics
│   ├── required[]        # metric names that must be emitted
│   ├── labels[]          # required metric labels (service, environment, etc.)
│   └── format            # prometheus | opentelemetry | custom
├── slos
│   ├── availability_pct  # uptime target (e.g., 99.9%)
│   ├── latency_p99_ms    # 99th percentile latency target
│   ├── error_rate_pct    # max error rate
│   └── freshness_max_age # max data staleness (duration)
├── alerting
│   ├── required_alerts[] # alert name, condition, severity
│   └── escalation_policy # who gets notified, when
└── metadata
```

## Key Design Decisions

- **OpenTelemetry native** — Forge uses OpenTelemetry as its observability standard. FOTS specs reference OTel metric names and label conventions.
- **SLOs, not SLAs** — FOTS defines internal objectives, not external contractual commitments. SLOs are aspirational targets that trigger investigation when missed.
- **Data freshness as a first-class SLO** — In manufacturing, stale data is worse than missing data (it creates false confidence). FOTS treats freshness as a core observable.

## Dependencies

- Observability infrastructure (F70) — metrics collection, dashboards
- Shared FxTS runner infrastructure (F10)
- OpenTelemetry SDK integration

## Implementation Status

Not yet implemented. No scaffold directory exists. Will be built as part of phase F15.
