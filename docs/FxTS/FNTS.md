# FNTS — Forge Normalization Test Specification

**Framework ID:** FNTS
**Full Name:** Forge Normalization Test Specification
**CI Gate:** Soft-fail (warning, non-blocking)
**Status:** Planned
**Phase:** F15
**MDEMG Analog:** UNTS (adapted)

---

## Purpose

FNTS governs unit consistency and definition alignment across the platform. Manufacturing data arrives in diverse units (°F vs °C, gallons vs liters, PSI vs bar), with diverse naming conventions (temperature, temp, T, TEMP), and diverse precision levels. FNTS ensures that normalization rules are applied consistently and that curated data products use canonical units and definitions.

Without normalization governance, two data sources reporting the same physical measurement in different units will produce misleading analytics. FNTS prevents this by declaring what "normalized" means for every measurement type.

## What FNTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Unit Consistency** | Canonical units per measurement type | All values converted to canonical unit |
| **Definition Alignment** | Canonical names for measurements | Aliases mapped to canonical names |
| **Precision** | Required decimal precision per type | Values rounded/truncated to spec |
| **Engineering Units** | UoM registry (ISA-88 aligned) | All units registered and convertible |
| **Normalization Factors** | Conversion formulas and constants | Factors produce correct output |

## Schema Structure (Planned)

```
fnts.schema.json
├── spec_version
├── measurement_type      # what physical quantity (temperature, pressure, flow, level, etc.)
├── canonical
│   ├── name              # canonical field name (e.g., "temperature")
│   ├── unit              # canonical unit (e.g., "celsius")
│   ├── precision         # decimal places
│   └── aliases[]         # accepted input names (temp, T, TEMP, etc.)
├── conversions[]
│   ├── from_unit         # source unit
│   ├── to_unit           # target (canonical) unit
│   ├── formula           # conversion expression
│   └── test_vectors[]    # known input/output pairs for validation
├── isa88_mapping
│   ├── physical_model    # ISA-88 physical model reference
│   └── procedural_model  # ISA-88 procedural model reference
└── metadata
```

## Key Design Decisions

- **ISA-88 alignment** — Manufacturing normalization follows ISA-88 (batch process control) naming conventions where applicable.
- **Test vectors for conversions** — Every conversion formula includes known input/output pairs so the runner can verify mathematical correctness.
- **Alias registry** — Different source systems call the same thing by different names. FNTS maintains a canonical alias map.

## Dependencies

- Curation Service (F40) — normalization is applied during curation
- Shared FxTS runner infrastructure (F10)

## Implementation Status

Not yet implemented. No scaffold directory exists. Will be built as part of phase F15.
