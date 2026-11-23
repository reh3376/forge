# FLTS — Forge Lineage Test Specification

**Framework ID:** FLTS
**Full Name:** Forge Lineage Test Specification
**CI Gate:** Soft-fail (warning, non-blocking)
**Status:** Planned
**Phase:** F15
**MDEMG Analog:** None (new for Forge)

---

## Purpose

FLTS governs data lineage integrity. Every record in Forge carries a provenance chain — where it came from, what transformations were applied, and how it reached its current state. FLTS ensures these lineage chains are complete, consistent, and traceable. This is foundational for regulatory compliance, root-cause analysis, and trust in data products.

In manufacturing, traceability is not optional. When a quality issue is discovered, the ability to trace backward through the entire data pipeline — from curated data product to raw sensor reading — is a regulatory and operational requirement.

## What FLTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Chain Completeness** | Every record must have a lineage chain | No orphan records (records without lineage) |
| **Source Attribution** | Every chain must start at an adapter | Chain root is a known adapter_id |
| **Transformation Logging** | Every transformation step must be recorded | Step count > 0, each step has operator and timestamp |
| **Provenance Integrity** | Chain hashes must be valid | Hash chain verification (tamper detection) |
| **Depth Requirements** | Minimum/maximum chain depth per data product | Chain depth within bounds |

## Schema Structure (Planned)

```
flts.schema.json
├── spec_version
├── data_product          # which data product's lineage is being governed
├── chain_requirements
│   ├── min_depth         # minimum transformation steps
│   ├── max_depth         # maximum (detect runaway pipelines)
│   ├── required_stages[] # stages that must appear (e.g., "context_enrichment", "normalization")
│   └── source_adapters[] # allowed source adapter IDs
├── integrity
│   ├── hash_algorithm    # SHA-256, etc.
│   ├── tamper_detection  # boolean
│   └── retention_days    # how long lineage records are kept
├── audit
│   ├── queryable         # lineage must be queryable via API
│   └── export_format     # W3C PROV, OpenLineage, custom
└── metadata
```

## Key Design Decisions

- **Soft-fail CI gate** — Lineage is critical but adding it retroactively to existing pipelines takes time. Soft-fail allows gradual adoption without blocking releases.
- **W3C PROV and OpenLineage compatibility** — Lineage export supports standard formats for interoperability with external governance tools.
- **Hash chain integrity** — Each lineage record includes a hash of the previous record, creating a tamper-evident chain (similar to blockchain provenance patterns).

## Dependencies

- Storage engines (F04) — lineage stored in Neo4j (graph structure)
- Context Engine (F21) — context enrichment is a lineage step
- Shared FxTS runner infrastructure (F10)

## Implementation Status

Not yet implemented. No scaffold directory exists. Will be built as part of phase F15 alongside FNTS, FOTS, and FPTS.
