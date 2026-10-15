# Changeover System: Architecture

> **Status**: Implemented
> **Module**: `backend/src/changeover/`
> **Last Updated**: 2026-02-20

---

## Module Structure

```
src/changeover/
├── changeover.module.ts             # NestJS module definition
├── changeover.controller.ts         # 7 REST endpoints
├── changeover.service.ts            # State machine + orchestration + MQTT + equipment state
├── changeover.types.ts              # Enums, interfaces, transition map, topic constants
├── dto/
│   └── changeover.dto.ts            # 5 request DTOs (class-validator + Swagger)
└── __tests__/
    └── changeover.service.spec.ts   # 35 unit tests
```

The module is a standalone NestJS module (no Amplication base classes). It follows the same pattern as other custom modules like `mqttDomainPublisher`, `productionEvent`, and `batchDeviation`.

---

## Dependency Graph

```
ChangeoverModule
├── PrismaModule              (DB access)
├── AuthModule                (forwardRef - RBAC)
├── ScheduleOrderModule       (forwardRef - cook tracking, recipe load, queue advance)
├── ScheduleOrderQueueModule  (forwardRef - order start)
├── ScheduleOrderRecipeInstanceModule  (recipe data loading)
├── MqttModule                (UNS publishing)
└── AuditModule               (audit trail)
```

`forwardRef` is used for `AuthModule`, `ScheduleOrderModule`, and `ScheduleOrderQueueModule` because they already have circular dependency patterns with `AuthModule` in the existing codebase.

### Service Dependencies

`ChangeoverService` injects:

| Dependency | Purpose |
|-----------|---------|
| `PrismaService` | Direct DB queries for changeover state, queue lookups, asset updates |
| `ScheduleOrderService` | `recordRecipeLoadedToPLC()`, `advanceScheduleOrderQueue()` |
| `ScheduleOrderQueueService` | `startOrder()` |
| `ScheduleOrderRecipeInstanceService` | `getWithAllComponents()` for full recipe data |
| `MqttService` | `publish()`, `getConnectedBrokers()` |
| `AuditService` | `logChange()` for every state transition |
| `Logger` (Winston) | Structured logging |

---

## State Machine Design

### State Enum

The state enum exists in two places, kept in sync:

1. **Application-level**: `ChangeoverState` in `changeover.types.ts` (used throughout the module)
2. **Prisma-level**: `EnumChangeoverState` in `schema.prisma` (used for DB storage)

Helper functions `toPrismaState()` and `fromPrismaState()` convert between them. The values are identical strings, making conversion a cast.

### Transition Map

Legal transitions are defined declaratively in `VALID_TRANSITIONS`:

```typescript
VALID_TRANSITIONS: Record<ChangeoverState, ChangeoverState[]> = {
  PRODUCTION:           [AWAITING_CHANGEOVER],
  COOK_COMPLETE:        [AWAITING_CHANGEOVER],
  AWAITING_CHANGEOVER:  [CIP_IN_PROGRESS, CIP_COMPLETE],  // CIP-skipped flow
  CIP_IN_PROGRESS:      [CIP_COMPLETE],
  CIP_COMPLETE:         [RECIPE_LOADING],
  RECIPE_LOADING:       [RECIPE_LOADED],
  RECIPE_LOADED:        [READY_TO_START],
  READY_TO_START:       [PRODUCTION],
  ERROR:                [AWAITING_CHANGEOVER, CIP_COMPLETE],
};
```

The `transitionState()` method validates against this map before every transition. `ERROR` is a special case -- `transitionToError()` bypasses validation because any state can reach ERROR.

### Auto-Advance Pattern

Two endpoint handlers perform double transitions in a single call:

1. **`cipComplete()`**: CIP_IN_PROGRESS -> CIP_COMPLETE -> RECIPE_LOADING
2. **`recipeLoaded()`**: RECIPE_LOADING -> RECIPE_LOADED -> READY_TO_START

Each sub-transition goes through `transitionState()` independently (both are validated and persisted). The final `TransitionResult` returned to the caller shows the end state.

### CIP-Skipped Flow

The `cipComplete()` handler also accepts `AWAITING_CHANGEOVER` as a start state (not just `CIP_IN_PROGRESS`). This enables a shortcut flow where CIP is not needed. The transition map allows `AWAITING_CHANGEOVER -> CIP_COMPLETE` to support this.

---

## Persistence Architecture

### Write-Through Cache Pattern

```
┌──────────────────────────────────────────────────┐
│                 ChangeoverService                 │
│                                                   │
│   ┌──────────────────────────────┐               │
│   │   In-Memory Map<Area, State> │  ← fast reads │
│   └──────────────┬───────────────┘               │
│                  │ refresh on assertState()       │
│                  │ update on transitionState()    │
│   ┌──────────────▼───────────────┐               │
│   │  PostgreSQL (authoritative)  │  ← all writes │
│   │  ChangeoverAreaState table   │               │
│   └──────────────────────────────┘               │
└──────────────────────────────────────────────────┘
```

**Writes**: Every state transition writes to PostgreSQL first (via `prisma.changeoverAreaState.update`), then updates the in-memory `Map<ChangeoverArea, AreaChangeoverState>`.

**Reads**: `getAreaState()` returns from the in-memory cache for fast response. `assertState()` reads from DB first (`getStateFromDb()`) to prevent acting on stale cache, then refreshes the cache.

**Startup**: `onModuleInit()` upserts all three area rows (creates with `PRODUCTION` default if missing, loads existing rows otherwise) and populates the in-memory cache.

**Recovery**: On server restart, state is restored from DB. No data loss.

### Database Schema

```prisma
enum EnumChangeoverState {
  PRODUCTION
  COOK_COMPLETE
  AWAITING_CHANGEOVER
  CIP_IN_PROGRESS
  CIP_COMPLETE
  RECIPE_LOADING
  RECIPE_LOADED
  READY_TO_START
  ERROR
}

model ChangeoverAreaState {
  id            String               @id @default(cuid())
  area          String               @unique        // "cooker" | "fermentation" | "barreling"
  state         EnumChangeoverState  @default(PRODUCTION)
  activeSOId    String?              // ID of schedule order at queueIndex=0
  nextSOId      String?              // ID of schedule order at queueIndex=1
  assetId       String?              // Optional: linked asset for equipment state tracking
  error         String?              // Error message when state is ERROR
  metadata      Json                 @default("{}")
  enteredAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  createdAt     DateTime             @default(now())
}
```

Design choices:
- **`area` as unique key** (not `id`): Only 3 rows ever exist. Lookups are always by area name.
- **`activeSOId`/`nextSOId` as plain strings**: Not foreign keys. The changeover module reads queue data via Prisma queries; it doesn't need referential integrity constraints on these fields.
- **`metadata` as JSON**: Flexible storage for per-transition context (requestedBy, cipDuration, recipeInstanceId, etc.) without schema changes.

---

## Equipment State Integration

### S88 Context

ISA-88 separates equipment state (Physical Model) from batch state (Procedural Model). The changeover module manages equipment-level state transitions. The `EnumEquipmentOperationalState` enum on the Asset model tracks the broader equipment lifecycle:

```
Available -> Allocated -> InUse -> Changeover -> InCIP -> Changeover -> InUse -> ...
                                       ^                                  |
                                       |                                  |
                                       +---- InMaintenance <--------------+
                                       |
                                       +---- OutOfService
```

### Automatic State Sync

When an area has a linked `assetId`, every changeover transition automatically updates the asset's `operationalState`:

```
transitionState()
  └── updateEquipmentOperationalState()
        ├── Read current asset state from DB
        ├── Map changeover state -> equipment state (via CHANGEOVER_TO_EQUIPMENT_STATE)
        ├── Skip if already in target state
        ├── Update asset.operationalState
        └── Create EquipmentStateTransition audit record
```

The mapping is defined in `changeover.types.ts`:

| Changeover State | Equipment Operational State |
|-----------------|---------------------------|
| PRODUCTION | InUse |
| AWAITING_CHANGEOVER | Changeover |
| CIP_IN_PROGRESS | InCIP |
| CIP_COMPLETE | Changeover |
| RECIPE_LOADING | Changeover |
| RECIPE_LOADED | Changeover |
| READY_TO_START | Changeover |

### Graceful Degradation

Equipment state updates are wrapped in try/catch. If the asset doesn't exist, the DB call fails, or no asset is linked, the changeover transition still completes successfully. This ensures the core changeover workflow is never blocked by equipment state issues.

### Asset Linking

Assets are linked to areas via `setAreaAsset(area, assetId)`. This is a programmatic API (not an endpoint yet). Once linked, all subsequent transitions automatically update the asset.

### Audit Model

```prisma
model EquipmentStateTransition {
  id               String                          @id @default(cuid())
  createdAt        DateTime                        @default(now())
  asset            Asset                           @relation(...)
  assetId          String
  fromState        EnumEquipmentOperationalState
  toState          EnumEquipmentOperationalState
  triggerType      EnumStateTransitionTrigger       @default(Manual)
  triggeredBy      String
  batchId          String?
  changeoverArea   String?
  notes            String?
  transitionedAt   DateTime                         @default(now())

  @@index([assetId])
  @@index([assetId, transitionedAt])
}
```

Every equipment state change creates an immutable audit record with:
- From/to state
- Trigger type (`SystemAction` for changeover-driven, `Manual` for operator-driven)
- Who triggered it
- Which changeover area caused it
- Free-text notes describing the changeover transition

---

## MQTT Publishing Strategy

### Topic Structure

All changeover MQTT topics follow the UNS pattern:

```
whk/whk01/{area}/{subtopic}
```

Built by `buildTopicPath(area, subtopic)`.

### Published Topics

| Constant | Topic Path | When Published |
|----------|-----------|----------------|
| `CHANGEOVER_TOPICS.STATE` | `whk/whk01/{area}/changeover/state` | Every state transition |
| `CHANGEOVER_TOPICS.ACTIVE_ORDER` | `whk/whk01/{area}/queue/activeOrder` | On startProduction |
| `CHANGEOVER_TOPICS.NEXT_ORDER` | `whk/whk01/{area}/queue/nextOrder` | On startProduction |
| `CHANGEOVER_TOPICS.QUEUE_STATE` | `whk/whk01/{area}/queue/state` | On startProduction |
| `CHANGEOVER_TOPICS.QUEUE_DEPTH` | `whk/whk01/{area}/queue/depth` | On startProduction |
| `RECIPE_TOPICS.NEXT` | `whk/whk01/{area}/recipe/next` | On cipComplete |
| `RECIPE_TOPICS.UPDATED_AT` | `whk/whk01/{area}/recipe/updatedAt` | On cipComplete |

### Retained Messages

All messages are published with `retain: true`. This means Ignition receives the last known state when it connects or subscribes, without waiting for the next transition.

### Broker Selection

`getFirstConnectedBrokerId()` picks the first connected MQTT broker. If no brokers are connected, publishing is silently skipped (no error thrown).

### Error Handling

All MQTT publish calls are wrapped in try/catch. Publishing failures are logged as warnings but never block the changeover workflow.

---

## Controller Design

### Route Structure

```
@Controller("api/changeover")
├── GET    /:area/state            → getAreaState()
├── POST   /:area/request          → requestChangeover()
├── POST   /:area/cip-complete     → cipComplete()
├── POST   /:area/recipe-loaded    → recipeLoaded()
├── POST   /:area/start-production → startProduction()
├── GET    /:area/next-recipe      → getNextRecipe()
└── POST   /:area/reset            → resetError()
```

### Area Validation

Every endpoint calls `validateArea()` which checks the `:area` param against `VALID_AREAS`. Invalid areas return HTTP 400 before reaching the service.

### RBAC

All endpoints use `@UseRoles` with the `ScheduleOrderQueue` resource:
- GET endpoints: `action: "read"`
- POST endpoints: `action: "update"`

This reuses existing RBAC resources rather than creating changeover-specific ones.

### Swagger

All endpoints are tagged with `@ApiTags("changeover")` and have operation summaries, response descriptions, and body type declarations for auto-generated API documentation.

---

## Request DTOs

All DTOs use `class-validator` decorators for runtime validation and `@nestjs/swagger` decorators for API documentation.

| DTO | Required Fields | Optional Fields |
|-----|----------------|-----------------|
| `ChangeoverRequestDto` | `requestedBy` | `force`, `reason`, `notes` |
| `CipCompleteDto` | `cipStartTime`, `cipEndTime` | `cipDurationSeconds`, `reportedBy` |
| `RecipeLoadedDto` | `scheduleOrderRecipeInstanceId`, `sourceUpdatedAt`, `cookerNumber` | `loadedBy` |
| `StartProductionDto` | `startedBy` | `notes` |
| `ResetErrorDto` | `targetState`, `resetBy` | `reason` |

### Optimistic Concurrency

`RecipeLoadedDto` includes `sourceUpdatedAt` -- the `updatedAt` timestamp of the recipe instance at the time Ignition read it. The service passes this to `ScheduleOrderService.recordRecipeLoadedToPLC()`, which compares it against the current DB value. If they differ (recipe was modified between read and write), the service throws, and the controller returns HTTP 409 Conflict.

---

## Audit Trail

Every state transition creates an audit record via `AuditService.logChange()`:

```typescript
{
  entityType: "Changeover",
  entityId: `${area}-changeover`,   // e.g., "cooker-changeover"
  action: AuditAction.UPDATE,
  oldValues: { state: previousState },
  newValues: { state: currentState, ...contextFields },
  userId: triggeredBy,
}
```

The `auditLogId` is included in the `TransitionResult` returned to the caller.

Equipment state changes create separate `EquipmentStateTransition` records (see above).

---

## Error Handling Patterns

### State Validation Errors (400)

`assertState()` reads current state from DB and throws `BadRequestException` if the current state is not in the expected set for that operation.

### Business Rule Errors (400)

- No active/next schedule order in queue
- Active queue entry has no linked schedule order
- Cooks not complete (without `force: true`)
- Queue advance failed
- Invalid reset target state

### Version Mismatch (409)

`recipeLoaded()` catches errors from `recordRecipeLoadedToPLC()` containing "not found" or "mismatch" and rethrows as `ConflictException`.

### Equipment State Errors (silent)

Equipment state updates failing never block the changeover. Errors are logged as warnings.

### MQTT Publishing Errors (silent)

MQTT failures are logged as warnings but never block state transitions.

---

## Testing Strategy

### Test Structure

All 35 tests are in `__tests__/changeover.service.spec.ts`. All dependencies are mocked.

### Test Categories

| Category | Count | Description |
|----------|-------|-------------|
| Full changeover cycle | 1 | PRODUCTION -> ... -> PRODUCTION happy path |
| requestChangeover | 3 | Valid state, invalid state, force override |
| cipComplete | 2 | Valid state, auto-advance to RECIPE_LOADING |
| recipeLoaded | 3 | Valid state, auto-advance, version mismatch 409 |
| startProduction | 2 | Valid state, queue advance |
| getNextRecipe | 2 | With recipe, without next SO |
| resetError | 3 | Valid reset, invalid source state, invalid target |
| getAreaState | 1 | Returns cached state |
| transitionToError | 2 | Any state -> ERROR |
| Equipment state | 3 | Asset update, no asset skip, already-in-state skip |
| setAreaAsset | 2 | Set and clear asset ID |
| State persistence | 3 | DB upsert on init, assertState reads from DB |
| MQTT publishing | 3 | State publish, queue publish, broker unavailable |

### Mock Pattern

```typescript
const mockPrisma = {
  changeoverAreaState: {
    upsert: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  scheduleOrderQueue: { findFirst: jest.fn(), findMany: jest.fn() },
  scheduleOrder: { findUnique: jest.fn() },
  asset: { findUnique: jest.fn(), update: jest.fn() },
  equipmentStateTransition: { create: jest.fn() },
};
```

The `findUnique` mock for `changeoverAreaState` dynamically reads from the service's in-memory state to keep mocks and cache in sync (prevents stale cache test failures).

---

## Future Considerations

### Not Yet Implemented

1. **MQTT Subscriptions**: Auto-detect CIP start/complete from equipment tags (e.g., `cipState`, `faultActive`, `mode`). Currently all transitions are driven by REST calls from Ignition.

2. **Redis Cache Layer**: The in-memory cache could be backed by Redis for multi-instance deployments. The write-through pattern makes this straightforward to add.

3. **Historical Changeover Records**: A separate `ChangeoverHistory` model could store completed changeover cycles for analytics (duration tracking, frequency, etc.).

4. **REST Endpoint for setAreaAsset**: Currently a programmatic API only. An admin endpoint would allow configuring area-to-asset mappings via the UI or Ignition.

5. **Changeover Duration Metrics**: Track time spent in each state for operational reporting.

6. **Multi-Equipment Areas**: Currently one asset per area. Some areas may have multiple pieces of equipment (e.g., multiple fermenters) requiring independent changeover tracking.
