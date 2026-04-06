# FQTS — Forge Quality Test Specification

**Framework ID:** FQTS
**Full Name:** Forge Quality Test Specification
**CI Gate:** Hard-fail (merge-blocking for production data products)
**Status:** Stub (directory structure exists)
**Phase:** F13
**MDEMG Analog:** None (new for Forge)

---

## Purpose

FQTS governs data quality. When data flows into Forge from adapters and is curated into data products, FQTS ensures the data meets declared quality standards. This is critical because Forge's primary design objective is decision quality — and decisions built on low-quality data produce confidently wrong outcomes.

FQTS is unique among FxTS frameworks because it operates **continuously**, not just at build/deploy time. Quality rules are evaluated against live data on a schedule, and quality scores are tracked over time.

## What FQTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Completeness** | Expected data frequency, max gaps, min completeness % | Record count, gap detection, null rates |
| **Accuracy** | Value ranges, statistical bounds, reference data | Out-of-range detection, anomaly flagging |
| **Freshness** | Max age, expected update frequency | Last-received timestamp, staleness detection |
| **Consistency** | Cross-field rules, cross-source agreement | Contradiction detection, referential integrity |
| **Context** | Required context fields per data product | Context field presence, completeness score |

## Schema Structure (Planned)

```
fqts.schema.json
├── spec_version
├── rule
│   ├── name                    # unique rule identifier
│   ├── description             # human-readable explanation
│   ├── category                # completeness | accuracy | freshness | consistency | context
│   ├── severity                # critical | high | medium | low
│   ├── data_product            # which data product this rule applies to
│   └── applies_to              # equipment_type, tag_pattern, entity_type filters
├── assertions
│   ├── expected_frequency_seconds
│   ├── max_gap_seconds
│   ├── min_completeness_pct
│   ├── max_null_pct
│   ├── value_range             # {min, max}
│   ├── quality_code_required
│   └── context_fields_required[]
├── evaluation
│   ├── mode                    # continuous | on_demand | ci_gate
│   ├── schedule                # cron expression (for continuous mode)
│   ├── lookback_window         # time window for evaluation
│   └── sample_size             # records to evaluate per run
└── metadata
```

## Example Spec

```json
{
  "spec_version": "0.1.0",
  "rule": {
    "name": "fermenter_temperature_completeness",
    "description": "Fermenter temperature readings must be present at expected frequency",
    "category": "completeness",
    "severity": "high",
    "data_product": "fermentation_process_data",
    "applies_to": {
      "equipment_type": "fermenter",
      "tag_pattern": "*/Temperature"
    }
  },
  "assertions": {
    "expected_frequency_seconds": 10,
    "max_gap_seconds": 60,
    "min_completeness_pct": 99.5,
    "max_null_pct": 0.1,
    "quality_code_required": true,
    "context_fields_required": ["equipment_id", "batch_id", "operating_mode"]
  },
  "evaluation": {
    "mode": "continuous",
    "schedule": "*/5 * * * *",
    "lookback_window": "1h",
    "sample_size": null
  }
}
```

## Key Design Decisions

- **Continuous evaluation** — Unlike other FxTS frameworks that run at build/deploy, FQTS runs on a schedule against live data. This catches quality degradation in real-time.
- **Quality scores, not just pass/fail** — FQTS produces quality scores (0-100) per dimension, not just binary verdicts. This enables trend tracking and early warning.
- **Severity levels** — Critical quality violations halt data product publishing. Low severity issues are logged for investigation.
- **Manufacturing-native assertions** — Expected frequency, gap detection, and quality codes are standard in manufacturing data (ISA-95/ISA-88 patterns).

## Dependencies

- Storage engines (F04) — to query live data
- Shared FxTS runner infrastructure (F10)
- Data products (F40) — FQTS specs target specific data products

## Implementation Status

Stub exists at `src/forge/governance/fqts/`. Schema, runner, and specs not yet created. Will be built as part of phase F13.
