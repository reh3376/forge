# FDTS — Forge Data Test Specification

**Framework ID:** FDTS
**Full Name:** Forge Data Test Specification
**CI Gate:** Hard-fail (merge-blocking)
**Status:** Planned
**Phase:** F10 (part of shared governance infrastructure)
**MDEMG Analog:** UDTS

---

## Purpose

FDTS governs data contracts — the schemas that define the shape of data flowing through the Forge platform. When a service, adapter, or data product declares a schema, FDTS ensures that schema evolves safely. It prevents breaking changes from silently corrupting downstream consumers.

## What FDTS Governs

| Aspect | What the spec declares | What the runner checks |
|--------|------------------------|------------------------|
| **Schema Registration** | Schema must be registered in the Schema Registry | Schema exists, is versioned |
| **Compatibility** | Compatibility mode (BACKWARD, FORWARD, FULL, NONE) | New schema version is compatible with previous |
| **Field Requirements** | Required fields, types, constraints | Fields present, types match, constraints satisfied |
| **Evolution Rules** | Allowed changes (add optional field, deprecate, etc.) | Change type is allowed under declared compatibility mode |
| **Versioning** | Schema version follows semver | Breaking changes increment major, additions increment minor |

## Schema Structure (Planned)

```
fdts.schema.json
├── spec_version
├── schema_identity       # schema_id, name, version, type
├── compatibility_mode    # BACKWARD | FORWARD | FULL | NONE
├── field_definitions[]   # name, type, required, constraints, deprecated
├── evolution_rules       # allowed_additions, allowed_removals, migration_required
├── consumers[]           # downstream services/products that depend on this schema
└── metadata
```

## Key Design Decisions

- **Compatibility modes mirror Confluent Schema Registry** — BACKWARD (new schema can read old data), FORWARD (old schema can read new data), FULL (both directions), NONE (no compatibility guarantee).
- **Consumer registry** — FDTS tracks which services consume each schema, enabling impact analysis before evolution.
- **Migration-required flag** — some schema changes require data migration (e.g., field rename). FDTS tracks this.

## Dependencies

- Schema Registry service (F20)
- Shared FxTS runner infrastructure (F10)

## Implementation Status

Not yet implemented. Scaffold exists at `src/forge/governance/` but FDTS directory not yet created. Will be built as part of the F10 governance infrastructure phase.
