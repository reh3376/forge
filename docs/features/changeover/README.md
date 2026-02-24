# Changeover System

## Documentation Index

| Document | Description | Audience |
|---|---|---|
| **[Architecture](./architecture.md)** | Technical deep-dive: module structure, state machine design, DB persistence, MQTT publishing, equipment state integration | Developers |
| **[Ignition Integration Guide](./ignition-changeover-integration.md)** | REST API reference, endpoint payloads, state diagram, MQTT topics, sequence diagrams, error recovery | Ignition Developers |
| **[Specification](./ignition-changeover-specification.md)** | Original system specification: UNS tag structure, UI screen mockups, tag-to-MES data mapping, implementation requirements | All Stakeholders |

---

## Overview

The Changeover System manages the transition between schedule orders on production equipment. When one schedule order finishes its cooks and the next order needs to begin, the changeover process orchestrates the sequence of CIP (clean-in-place), recipe loading, and production startup steps.

The system is built as a **per-area state machine** with 9 states, exposed via REST endpoints that Ignition calls to drive each step of the workflow. State is persisted to PostgreSQL and published to MQTT for real-time visibility.

## Key Concepts

### Areas

Changeover state is tracked independently for three production areas:

| Area | Description |
|------|-------------|
| `cooker` | Mashing/cooking area |
| `fermentation` | Fermentation area |
| `barreling` | Barreling/packaging area |

Each area has its own state machine instance, its own MQTT topic namespace, and optionally a linked asset for equipment state tracking.

### State Machine

The changeover follows a fixed sequence from `PRODUCTION` through cleanup and recipe loading back to `PRODUCTION`:

```
PRODUCTION --> AWAITING_CHANGEOVER --> CIP_IN_PROGRESS --> CIP_COMPLETE
     --> RECIPE_LOADING --> RECIPE_LOADED --> READY_TO_START --> PRODUCTION
```

Two transitions auto-advance (no separate API call needed):
- **CIP_COMPLETE -> RECIPE_LOADING** (after `cip-complete` endpoint)
- **RECIPE_LOADED -> READY_TO_START** (after `recipe-loaded` endpoint)

CIP can be skipped when not needed (the `cip-complete` endpoint accepts `AWAITING_CHANGEOVER` state directly).

Any state can transition to `ERROR`, which requires a manual reset via the `reset` endpoint.

### Orchestration Layer

The changeover module is an **orchestration layer** -- it does not own schedule order or queue data. Instead it delegates to:
- `ScheduleOrderService` for cook tracking, recipe load auditing, and queue advancement
- `ScheduleOrderQueueService` for order start operations
- `ScheduleOrderRecipeInstanceService` for loading full recipe data
- `MqttService` for publishing state to the UNS
- `AuditService` for recording every state transition

### S88 Alignment

In ISA-88 terms, changeover is an **equipment-level concern** (Physical Model), not a batch-level concern (Procedural Model). The `ChangeoverState` enum is a granular sub-state-machine that maps to the broader `EnumEquipmentOperationalState` values on the Asset model:

| Changeover State | Equipment State |
|-----------------|----------------|
| PRODUCTION | InUse |
| AWAITING_CHANGEOVER | Changeover |
| CIP_IN_PROGRESS | InCIP |
| CIP_COMPLETE | Changeover |
| RECIPE_LOADING | Changeover |
| RECIPE_LOADED | Changeover |
| READY_TO_START | Changeover |

## REST API

Base URL: `/api/changeover`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/:area/state` | Get current changeover state |
| POST | `/:area/request` | Request changeover (starts the flow) |
| POST | `/:area/cip-complete` | Report CIP completion |
| POST | `/:area/recipe-loaded` | Confirm recipe loaded on equipment |
| POST | `/:area/start-production` | Start production (advances queue) |
| GET | `/:area/next-recipe` | Get next recipe data |
| POST | `/:area/reset` | Reset from ERROR state |

All endpoints use RBAC via `nest-access-control` on the `ScheduleOrderQueue` resource.

See the [Ignition Integration Guide](./ignition-changeover-integration.md) for full request/response payloads.

## MQTT Topics

All topics are retained messages published under `whk/whk01/{area}/`:

| Topic | Payload |
|-------|---------|
| `changeover/state` | Full changeover state object |
| `queue/activeOrder` | Active schedule order ID |
| `queue/nextOrder` | Next schedule order ID |
| `queue/state` | Full queue listing |
| `queue/depth` | Queue depth count |
| `recipe/next` | Complete recipe data for next order |
| `recipe/updatedAt` | Recipe last-updated timestamp |

## Data Model

### ChangeoverAreaState (Prisma)

One row per area. Unique on `area`. Stores the current state, linked schedule order IDs, optional asset ID, error message, and metadata.

### EquipmentStateTransition (Prisma)

Audit trail for every equipment operational state change. Created automatically when a changeover transition changes the linked asset's state.

See [Architecture](./architecture.md) for full schema details.

## Implementation Status

- Server-side module: **Complete**
- Unit tests: **35 passing**
- DB persistence: **Complete** (write-through cache)
- Equipment state integration: **Complete**
- MQTT publishing: **Complete**
- Ignition client: **Not started** (see Integration Guide)

---

*For the technical implementation details, see [Architecture](./architecture.md). For the Ignition-facing API reference, see [Integration Guide](./ignition-changeover-integration.md).*
