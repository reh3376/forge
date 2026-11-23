# Changeover Module: Ignition Integration Guide

> **Status**: Implemented (server-side)
> **Last Updated**: 2026-02-20
> **Base URL**: `http://<MES_HOST>:3000/api/changeover`

---

## Overview

The Changeover Module is an **orchestration layer** that manages the transition between schedule orders on production equipment. It provides:

- A **per-area state machine** with 9 states, persisted to PostgreSQL
- **7 REST endpoints** for Ignition to drive the changeover workflow
- **MQTT publishing** of changeover state, queue state, and recipe data (retained messages)
- **Audit logging** of every state transition
- **Optimistic concurrency** for recipe loading (version check via `sourceUpdatedAt`)

The module **delegates** all data operations to existing services (ScheduleOrderService, ScheduleOrderQueueService, ScheduleOrderRecipeInstanceService). It does not own schedule order or queue data directly.

### S88 Context

In ISA-88 terms, changeover is an **equipment-level concern** in the Physical Model, not a batch-level concern in the Procedural Model. The `EnumChangeoverState` is a granular sub-state-machine that will map to the planned `EnumEquipmentOperationalState` values (`Changeover`, `InCIP`, `InUse`, `Available`).

---

## State Machine

### States

| State | Description |
|-------|-------------|
| `PRODUCTION` | Normal production. Active SO is executing. |
| `COOK_COMPLETE` | All cooks for current SO are done. Ready for changeover request. |
| `AWAITING_CHANGEOVER` | Changeover has been requested. Equipment is being shut down / cleaned. |
| `CIP_IN_PROGRESS` | Clean-in-place is running on the equipment. |
| `CIP_COMPLETE` | CIP is done. Next recipe can be loaded. |
| `RECIPE_LOADING` | Next SO recipe has been published; Ignition is loading it to PLCs. |
| `RECIPE_LOADED` | Ignition confirms recipe is loaded on equipment. |
| `READY_TO_START` | Everything is ready. Operator can start production. |
| `ERROR` | Something went wrong. Manual reset required. |

### State Diagram

```
                    +-----------+
                    | PRODUCTION|<──────────────────────────────────┐
                    +-----+-----+                                  |
                          |                                        |
                          v                                        |
                   +------+-------+                                |
                   | COOK_COMPLETE |  (optional entry point)       |
                   +------+-------+                                |
                          |                                        |
             POST /:area/request                                   |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              | AWAITING_CHANGEOVER   |                            |
              +-----------+-----------+                            |
                          |                                        |
                     (CIP runs)                                    |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              |    CIP_IN_PROGRESS    |                            |
              +-----------+-----------+                            |
                          |                                        |
             POST /:area/cip-complete                              |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              |     CIP_COMPLETE      |                            |
              +-----------+-----------+                            |
                          |                                        |
                   (auto-advance)                                  |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              |   RECIPE_LOADING      |                            |
              +-----------+-----------+                            |
                          |                                        |
            POST /:area/recipe-loaded                              |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              |    RECIPE_LOADED      |                            |
              +-----------+-----------+                            |
                          |                                        |
                   (auto-advance)                                  |
                          |                                        |
                          v                                        |
              +-----------+-----------+                            |
              |   READY_TO_START      |                            |
              +-----------+-----------+                            |
                          |                                        |
          POST /:area/start-production                             |
                          |                                        |
                          +────────────────────────────────────────┘

              Any State ──── ERROR ──── POST /:area/reset ──→ AWAITING_CHANGEOVER or CIP_COMPLETE
```

### Auto-Advance Behavior

Two transitions happen automatically (no separate API call needed):

1. **CIP_COMPLETE -> RECIPE_LOADING**: When `cip-complete` is called, the service transitions through CIP_COMPLETE and automatically advances to RECIPE_LOADING. The response shows `currentState: "RECIPE_LOADING"`.

2. **RECIPE_LOADED -> READY_TO_START**: When `recipe-loaded` is called, the service transitions through RECIPE_LOADED and automatically advances to READY_TO_START. The response shows `currentState: "READY_TO_START"`.

### CIP-Skipped Flow

The `cip-complete` endpoint also accepts state `AWAITING_CHANGEOVER` (not just `CIP_IN_PROGRESS`). This allows skipping the CIP step when it is not needed.

### Persistence

State is persisted to PostgreSQL in the `ChangeoverAreaState` table. On server restart, state is loaded from DB. The in-memory cache is kept in sync with every DB write (write-through pattern). Every `assertState()` check reads from DB to prevent stale cache issues.

---

## Valid Areas

| Area | Description |
|------|-------------|
| `cooker` | Mashing/cooking area |
| `fermentation` | Fermentation area |
| `barreling` | Barreling/packaging area |

Any other area value returns HTTP 400.

---

## Endpoints

### 1. GET `/:area/state` - Get Current State

Returns the current changeover state for an area.

**Request:**
```
GET /api/changeover/cooker/state
```

**Response (200):**
```json
{
  "state": "PRODUCTION",
  "area": "cooker",
  "activeSOId": "clxyz123...",
  "nextSOId": "clxyz456...",
  "error": null,
  "enteredAt": "2026-02-20T10:00:00.000Z",
  "updatedAt": "2026-02-20T10:00:00.000Z",
  "metadata": {}
}
```

**Error (400):** Invalid area.

---

### 2. POST `/:area/request` - Request Changeover

Initiates a changeover for an area. Validates that the current SO has completed all cooks (unless `force: true`).

**Allowed from states:** `PRODUCTION`, `COOK_COMPLETE`

**Request:**
```
POST /api/changeover/cooker/request
Content-Type: application/json

{
  "requestedBy": "operator-1",
  "force": false,
  "reason": "All cooks complete, switching to SO-2026-043",
  "notes": "Bourbon to rye changeover"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requestedBy` | string | Yes | User or system ID requesting the changeover |
| `force` | boolean | No | Skip cook completion check (default: false) |
| `reason` | string | No | Reason for changeover |
| `notes` | string | No | Additional notes |

**Response (201):**
```json
{
  "success": true,
  "previousState": "PRODUCTION",
  "currentState": "AWAITING_CHANGEOVER",
  "area": "cooker",
  "message": "Transitioned from PRODUCTION to AWAITING_CHANGEOVER",
  "auditLogId": "claudit123..."
}
```

**Errors:**
- `400` - Invalid state (not in PRODUCTION or COOK_COMPLETE)
- `400` - No active SO at queue index 0
- `400` - No next SO at queue index 1
- `400` - Cooks not complete (use `force: true` to override)

**Side effects:**
- Persists state to DB
- Publishes changeover state to MQTT
- Creates audit log entry

---

### 3. POST `/:area/cip-complete` - Report CIP Completion

Reports that CIP (Clean-in-Place) has completed. Loads the next recipe and auto-advances to RECIPE_LOADING.

**Allowed from states:** `CIP_IN_PROGRESS`, `AWAITING_CHANGEOVER` (CIP-skipped flow)

**Request:**
```
POST /api/changeover/cooker/cip-complete
Content-Type: application/json

{
  "cipStartTime": "2026-02-20T10:30:00.000Z",
  "cipEndTime": "2026-02-20T11:00:00.000Z",
  "cipDurationSeconds": 1800,
  "reportedBy": "cip-system"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cipStartTime` | string (ISO-8601) | Yes | When CIP started |
| `cipEndTime` | string (ISO-8601) | Yes | When CIP ended |
| `cipDurationSeconds` | number | No | Duration in seconds |
| `reportedBy` | string | No | Who reported (defaults to "system") |

**Response (201):**
```json
{
  "success": true,
  "previousState": "CIP_IN_PROGRESS",
  "currentState": "RECIPE_LOADING",
  "area": "cooker",
  "message": "Transitioned from CIP_IN_PROGRESS to RECIPE_LOADING",
  "auditLogId": "claudit456..."
}
```

**Side effects:**
- Loads next SO recipe via `getWithAllComponents()`
- Publishes recipe data to MQTT (`recipe/next`, `recipe/updatedAt`)
- Auto-advances: CIP_COMPLETE -> RECIPE_LOADING
- Publishes changeover state to MQTT
- Creates audit log entry

---

### 4. POST `/:area/recipe-loaded` - Confirm Recipe Loaded

Confirms that Ignition has loaded the recipe onto equipment PLCs. Includes optimistic concurrency via `sourceUpdatedAt`.

**Allowed from states:** `RECIPE_LOADING`, `CIP_COMPLETE`

**Request:**
```
POST /api/changeover/cooker/recipe-loaded
Content-Type: application/json

{
  "scheduleOrderRecipeInstanceId": "clsori789...",
  "sourceUpdatedAt": "2026-02-20T10:00:00.000Z",
  "cookerNumber": "CK-01",
  "loadedBy": "ignition-gateway"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scheduleOrderRecipeInstanceId` | string | Yes | The SORI ID for the next SO's recipe |
| `sourceUpdatedAt` | string (ISO-8601) | Yes | The `updatedAt` timestamp of the SORI at time of read (for version check) |
| `cookerNumber` | string | Yes | Equipment identifier where recipe was loaded |
| `loadedBy` | string | No | Who loaded it (defaults to "system") |

**Response (201):**
```json
{
  "success": true,
  "previousState": "RECIPE_LOADING",
  "currentState": "READY_TO_START",
  "area": "cooker",
  "message": "Transitioned from RECIPE_LOADING to READY_TO_START",
  "auditLogId": "claudit789..."
}
```

**Errors:**
- `400` - Invalid state
- `400` - No next SO at queue index 1
- `409` - Version mismatch (recipe was updated after Ignition read it). **Ignition should re-fetch the recipe and retry.**

**Side effects:**
- Calls `scheduleOrderService.recordRecipeLoadedToPLC()` (records the load event)
- Auto-advances: RECIPE_LOADED -> READY_TO_START
- Publishes changeover state to MQTT
- Creates audit log entry

---

### 5. POST `/:area/start-production` - Start Production

Starts production with the new schedule order. Advances the queue (completes current SO, shifts next SO to active).

**Allowed from states:** `READY_TO_START`

**Request:**
```
POST /api/changeover/cooker/start-production
Content-Type: application/json

{
  "startedBy": "operator-1",
  "notes": "Starting rye production run"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startedBy` | string | Yes | User starting production |
| `notes` | string | No | Additional notes |

**Response (201):**
```json
{
  "success": true,
  "previousState": "READY_TO_START",
  "currentState": "PRODUCTION",
  "area": "cooker",
  "message": "Transitioned from READY_TO_START to PRODUCTION",
  "auditLogId": "claudit012..."
}
```

**Side effects:**
- Calls `scheduleOrderService.advanceScheduleOrderQueue()` (completes current SO, shifts queue)
- Updates `activeSOId` and `nextSOId` on the changeover state
- Publishes changeover state to MQTT
- Publishes full queue state to MQTT (activeOrder, nextOrder, queueState, queueDepth)
- Creates audit log entry

---

### 6. GET `/:area/next-recipe` - Get Next Recipe

Returns the full recipe for the next schedule order in queue (index 1). This is a read-only endpoint - no state transition.

**Request:**
```
GET /api/changeover/cooker/next-recipe
```

**Response (200):**
```json
{
  "scheduleOrderId": "clso456...",
  "scheduleOrderName": "SO-2026-043",
  "recipeInstanceId": "clsori789...",
  "updatedAt": "2026-02-20T10:00:00.000Z",
  "recipe": {
    "id": "clrecipe123...",
    "name": "WHK-RB-001 Bourbon Mash",
    "revision": "v3"
  },
  "recipeBoms": [
    {
      "id": "clbom123...",
      "items": [
        {
          "id": "clbomitem1...",
          "itemId": "clitem1...",
          "itemName": "Corn #2 Yellow",
          "quantity": 8500,
          "units": "lbs"
        },
        {
          "id": "clbomitem2...",
          "itemId": "clitem2...",
          "itemName": "Rye Malt",
          "quantity": 1200,
          "units": "lbs"
        }
      ]
    }
  ],
  "mashingProtocols": [
    {
      "id": "clproto1...",
      "steps": [
        {
          "id": "clstep1...",
          "index": 0,
          "itemName": "City Water",
          "quantity": 2400
        },
        {
          "id": "clstep2...",
          "index": 1,
          "itemName": "Corn #2 Yellow",
          "quantity": 8500
        }
      ]
    }
  ],
  "recipeParameters": [
    {
      "id": "clparam1...",
      "name": "Cooker Temperature",
      "value": "180",
      "units": "degF"
    }
  ]
}
```

**When no next SO exists:**
```json
{
  "message": "No next schedule order in queue",
  "recipe": null
}
```

---

### 7. POST `/:area/reset` - Reset Error State

Resets an area from ERROR state to a safe recovery point.

**Allowed from states:** `ERROR` only

**Request:**
```
POST /api/changeover/cooker/reset
Content-Type: application/json

{
  "targetState": "AWAITING_CHANGEOVER",
  "resetBy": "supervisor-1",
  "reason": "Resolved CIP sensor fault"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetState` | string | Yes | Must be `AWAITING_CHANGEOVER` or `CIP_COMPLETE` |
| `resetBy` | string | Yes | User performing the reset |
| `reason` | string | No | Reason for reset |

**Response (201):**
```json
{
  "success": true,
  "previousState": "ERROR",
  "currentState": "AWAITING_CHANGEOVER",
  "area": "cooker",
  "message": "Transitioned from ERROR to AWAITING_CHANGEOVER",
  "auditLogId": "claudit345..."
}
```

**Errors:**
- `400` - Not in ERROR state
- `400` - Invalid target state (only AWAITING_CHANGEOVER or CIP_COMPLETE allowed)

---

## MQTT Topics

All topics are published with `retain: true` so Ignition receives the latest state on connection/subscription.

### Topic Structure

```
whk/whk01/{area}/{subtopic}
```

### Changeover State

**Topic:** `whk/whk01/{area}/changeover/state`

Published on every state transition.

```json
{
  "state": "AWAITING_CHANGEOVER",
  "area": "cooker",
  "activeSOId": "clxyz123...",
  "nextSOId": "clxyz456...",
  "error": null,
  "enteredAt": "2026-02-20T10:30:00.000Z",
  "updatedAt": "2026-02-20T10:30:00.000Z"
}
```

### Queue State

Published on `start-production` (after queue advance):

| Topic | Payload |
|-------|---------|
| `whk/whk01/{area}/queue/activeOrder` | `{ "scheduleOrderId": "clxyz..." }` |
| `whk/whk01/{area}/queue/nextOrder` | `{ "scheduleOrderId": "clabc..." }` |
| `whk/whk01/{area}/queue/state` | Array of `{ queueIndex, scheduleOrderId, scheduleOrderName }` |
| `whk/whk01/{area}/queue/depth` | `{ "depth": 5 }` |

### Recipe Data

Published on `cip-complete` (when next recipe is loaded):

| Topic | Payload |
|-------|---------|
| `whk/whk01/{area}/recipe/next` | Full recipe JSON (same as `getWithAllComponents` output) |
| `whk/whk01/{area}/recipe/updatedAt` | `{ "updatedAt": "2026-02-20T10:00:00.000Z" }` |

---

## Happy Path Sequence

```
Ignition                           MES Backend                          MQTT
────────                           ───────────                          ────
                                   (area state: PRODUCTION)

1. Cooks complete for current SO
   POST /cooker/request ────────→  Validate cooks complete
                                   Transition → AWAITING_CHANGEOVER
                          ←─────── { currentState: "AWAITING_CHANGEOVER" }
                                                                        → changeover/state

2. CIP runs on equipment
   (Ignition manages CIP locally)

3. CIP finishes
   POST /cooker/cip-complete ───→  Transition → CIP_COMPLETE
                                   Load next recipe (getWithAllComponents)
                                   Auto-advance → RECIPE_LOADING
                          ←─────── { currentState: "RECIPE_LOADING" }
                                                                        → changeover/state
                                                                        → recipe/next
                                                                        → recipe/updatedAt

4. Read recipe from MQTT or REST
   GET /cooker/next-recipe ─────→  Return full recipe JSON
                          ←─────── { scheduleOrderId, recipe, ... }

5. Load recipe to PLCs
   (Ignition loads recipe to equipment UDTs)

6. Confirm recipe loaded
   POST /cooker/recipe-loaded ──→  recordRecipeLoadedToPLC()
                                   Transition → RECIPE_LOADED
                                   Auto-advance → READY_TO_START
                          ←─────── { currentState: "READY_TO_START" }
                                                                        → changeover/state

7. Operator presses START
   POST /cooker/start-production → advanceScheduleOrderQueue()
                                   Transition → PRODUCTION
                          ←─────── { currentState: "PRODUCTION" }
                                                                        → changeover/state
                                                                        → queue/activeOrder
                                                                        → queue/nextOrder
                                                                        → queue/state
                                                                        → queue/depth
```

---

## Error Recovery

### Version Mismatch (409 Conflict)

If the recipe was updated between when Ignition read it and when `recipe-loaded` is called:

```
Ignition                            MES Backend
────────                            ───────────
POST /cooker/recipe-loaded
  { sourceUpdatedAt: "old-ts" } ──→ Compare with current SORI.updatedAt
                                    MISMATCH
                           ←─────── 409 Conflict: "version mismatch"

GET /cooker/next-recipe ──────────→ Return fresh recipe
                           ←─────── { updatedAt: "new-ts", ... }

(Re-load recipe to PLCs)

POST /cooker/recipe-loaded
  { sourceUpdatedAt: "new-ts" } ──→ Match confirmed
                           ←─────── 201: { currentState: "READY_TO_START" }
```

### Error State and Reset

Any state can transition to ERROR (via internal `transitionToError()` or future MQTT fault subscriptions). Recovery uses the reset endpoint:

```
Ignition                            MES Backend
────────                            ───────────
                                    (ERROR detected - e.g., CIP fault)
                                    Transition → ERROR
                                                                    → changeover/state (error msg)

GET /cooker/state ───────────────→  { state: "ERROR", error: "CIP sensor fault" }

(Operator resolves the issue)

POST /cooker/reset
  { targetState: "AWAITING_CHANGEOVER",
    resetBy: "supervisor-1",
    reason: "Sensor recalibrated" } → Transition → AWAITING_CHANGEOVER
                           ←─────── { currentState: "AWAITING_CHANGEOVER" }
                                                                    → changeover/state
```

### Force Changeover

If cooks are not yet complete but changeover is needed (e.g., equipment issue):

```
POST /cooker/request
{ "requestedBy": "operator-1", "force": true, "reason": "Equipment issue - switching early" }
```

---

## Queue Model Reference

The changeover module reads from the `ScheduleOrderQueue` table:

| Queue Index | Meaning |
|-------------|---------|
| `0` | **Active SO** - currently in production |
| `1` | **Next SO** - will become active after changeover |
| `2+` | Future SOs in queue |

On `start-production`, the queue advances:
- Index 0 SO is completed
- Index 1 SO becomes index 0 (active)
- Index 2 SO becomes index 1 (next)
- etc.

---

## Authentication

All endpoints require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

RBAC uses the `ScheduleOrderQueue` resource:
- **Read endpoints** (GET): `{ resource: "ScheduleOrderQueue", action: "read", possession: "any" }`
- **Write endpoints** (POST): `{ resource: "ScheduleOrderQueue", action: "update", possession: "any" }`

---

## Swagger

All endpoints are documented in Swagger under the `changeover` tag. Access at:

```
http://<MES_HOST>:3000/api
```

---

## Implementation Notes for Ignition Development

1. **Poll vs Subscribe**: Use MQTT subscriptions for real-time state changes (`changeover/state`). Use REST endpoints to drive transitions.

2. **Recipe Loading**: After `cip-complete`, the recipe is available both via MQTT (`recipe/next` retained message) and REST (`GET /:area/next-recipe`). Use whichever is more convenient for your UDT structure.

3. **Version Check**: Always capture the `updatedAt` from the recipe response and pass it as `sourceUpdatedAt` in the `recipe-loaded` call. This prevents loading a stale recipe.

4. **Idempotency**: State transition calls are NOT idempotent. Calling `request` twice will fail on the second call because the state has already changed. Always check state first if unsure.

5. **Error Handling**: If any call returns a 400/409/500, check `GET /:area/state` to understand the current state before retrying.

6. **CIP Integration**: The module does NOT manage CIP execution. Ignition owns the CIP process. The module only records when CIP is complete. The transition from `AWAITING_CHANGEOVER` to `CIP_IN_PROGRESS` can be triggered by a future MQTT subscription (not yet implemented) or by the operator in MES.

7. **State Persistence**: State survives server restarts. If the MES backend restarts during a changeover, it will resume from the last persisted state.

8. **Equipment Operational State**: If an asset ID is linked to an area (via `setAreaAsset()`), the changeover service automatically updates the `Asset.operationalState` field on transitions:

   | Changeover State | Equipment State |
   |-----------------|----------------|
   | `PRODUCTION` | `InUse` |
   | `AWAITING_CHANGEOVER` | `Changeover` |
   | `CIP_IN_PROGRESS` | `InCIP` |
   | `CIP_COMPLETE` | `Changeover` |
   | `RECIPE_LOADING` | `Changeover` |
   | `RECIPE_LOADED` | `Changeover` |
   | `READY_TO_START` | `Changeover` |

   Every equipment state change is recorded in the `EquipmentStateTransition` audit table with the triggering changeover area, user, and timestamp.
