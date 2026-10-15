# Schedule Order Queue API

This module manages the scheduling and queuing of production orders in the manufacturing system. It provides endpoints for adding production orders to the queue, updating their status, and managing their position in the queue.

## Key Concepts

- **Schedule Order**: Represents a scheduled production activity with timing and resource allocation information
- **Schedule Order Queue**: Manages the priority and sequence of schedule orders
- **Queue Index**: Determines the position of a schedule order in the queue (lower index = higher priority)

## Schedule Order Queue Module

This module handles the queue management for schedule orders.

### Introduction

The Schedule Order Queue module manages the ordering and execution of schedule orders in a production environment. It handles:

- Adding orders to the queue
- Activating orders when they're ready to be processed
- Updating queue positions
- Completing orders when they're finished
- Deactivating orders when they need to be removed from the queue

### Status Flows

#### Schedule Order Status Flow

- **Created** → **Scheduled**
- **Scheduled** → **InProgress**
- **InProgress** → **Complete**

#### Production Order Status Flow

- **Created** → **Committed**
- **Committed** → **InProgress**
- **InProgress** → **Complete**

## Endpoints

### Add Production Order to Queue

```
POST /scheduleOrderQueues/add-production-order-to-queue/:id
```

Creates a new schedule order from a production order and adds it to the queue with comprehensive scheduling information.

#### Path Parameters

- `id`: Production order ID (string, required)

#### Request Body

| Parameter     | Type   | Description                                 |
| ------------- | ------ | ------------------------------------------- |
| startDate     | Date   | Estimated start date for the schedule order |
| endDate       | Date   | Estimated end date for the schedule order   |
| bblPerFerm    | number | Estimated barrels per fermenter             |
| yieldPgPerBsh | number | Estimated proof gallons per bushel yield    |
| pgsPerBbl     | number | Estimated proof gallons per barrel          |

#### Response

Returns a `ScheduleOrderQueue` object containing the newly created schedule order and its position in the queue.

#### Estimation Variables Handling

The endpoint processes the estimation variables as follows:

1. **Production Order Updates**:

   - Sets `scheduled: true`
   - Updates status to `Committed`
   - Directly applies `startDate`, `endDate`, `estimatedBarrelsPerFermenter`, `estimatedPGsPerBushel`, and `estimatedPGsPerBbl` from the parameters

2. **Schedule Order Calculations**:

   - **Phase Timing** (using fixed durations):

     - `estimatedMashingStartTime` = `startDate` (beginning of production)
     - `estimatedMashingDuration` = 8 hours (fixed)
     - `estimatedFermentationStartTime` = mashing start + mashing duration
     - `estimatedFermentationDuration` = 72 hours (fixed)
     - `estimatedDistillationStartTime` = fermentation start + fermentation duration
     - `estimatedDistillationDuration` = 12 hours (fixed)
     - `estimatedBarrelingStartTime` = distillation start + distillation duration
     - `estimatedTotalProductionDuration` = sum of all phase durations

   - **Production Quantity Calculations**:
     - `totalBarrels` = `bblPerFerm` × `plannedFermenters` (from production order)
     - `totalProofGallons` = `pgsPerBbl` × `totalBarrels`

#### What Happens

1. Updates the production order with scheduling parameters
2. Calculates phase timing (mashing, fermentation, distillation)
3. Creates a new schedule order with comprehensive scheduling data
4. Adds the schedule order to the end of the queue
5. Sets appropriate status for both entities
6. Creates a continuous production timeline based on phase durations

### Add to Pending Schedule Order Queue

```
POST /scheduleOrderQueues/add-to-pending-schedule-order-queue
```

Adds an existing schedule order to the end of the queue.

#### Request Body

- `scheduleOrder`: Object containing the ID of an existing schedule order
- `areas`: Optional list of operational areas for this schedule order

#### Response

Returns a `ScheduleOrderQueue` object with the schedule order added to the queue.

### Activate Next Schedule Order Queue

```
PATCH /scheduleOrderQueues/activate-next-schedule-order-queue/:id
```

Sets a schedule order as active by moving it to position 0 in the queue and updating its status to "InProgress".

#### Path Parameters

- `id`: Schedule order queue ID (string, required)

#### Response

Returns the activated `ScheduleOrderQueue` object.

### Complete Schedule Order Queue

```
PATCH /scheduleOrderQueues/complete-schedule-order-queue/:id
```

Marks a schedule order as completed and removes it from the queue.

#### Path Parameters

- `id`: Schedule order queue ID (string, required)

#### Response

Returns the completed `ScheduleOrderQueue` object.

### Deactivate Schedule Order Queue

```
PATCH /scheduleOrderQueues/deactivate-schedule-order-queue/:id
```

Deactivates a schedule order (sets to "Created" status) and removes it from the queue.

#### Path Parameters

- `id`: Schedule order queue ID (string, required)

#### Response

Returns the deactivated `ScheduleOrderQueue` object.

### Update Schedule Order Queue Index

```
PATCH /scheduleOrderQueues/update-schedule-order-queue-index/:id
```

Changes the position of a schedule order in the queue by updating its queue index.

#### Path Parameters

- `id`: Schedule order queue ID (string, required)

#### Request Body

- `newIndex`: New queue position (number, required)

#### Response

Returns the updated `ScheduleOrderQueue` object.

### Update Schedule Order Queue Unit Procedure

```
PATCH /:id/update-schedule-order-queue-unit-procedure
```

Updates the areas associated with a schedule order queue.

#### Path Parameters

- `id`: Schedule order queue ID (string, required)

#### Request Body

- `areas`: List of operational areas to associate with this queue item

#### Response

Returns the updated `ScheduleOrderQueue` object.

## Data Synchronization

When schedule order timing or status information is updated, the associated production orders are automatically updated to maintain data consistency. This includes:

- Updating production order start/end dates when schedule order dates change
- Synchronizing status changes between schedule orders and production orders
- Propagating scheduling parameter changes

## Available Endpoints

### Schedule Order Queue Endpoints

#### POST /scheduleOrderQueues/addToPendingScheduleOrderQueue

Adds a schedule order to the pending queue.

#### PATCH /scheduleOrderQueues/activate-schedule-order-queue/:id

Activates a schedule order in the queue.

#### PATCH /scheduleOrderQueues/update-schedule-order-queue-areas/:id

Updates the areas (unit procedures) for a schedule order queue.

#### PATCH /scheduleOrderQueues/activate-next-schedule-order-queue/:id

Activates the next schedule order in the queue.

#### PATCH /scheduleOrderQueues/complete-schedule-order-queue/:id

Completes a schedule order queue item.

#### PATCH /scheduleOrderQueues/deactivate-schedule-order-queue/:id

Deactivates a schedule order queue item.

#### PATCH /scheduleOrderQueues/update-schedule-order-queue-index/:id

Updates the queue index position of a schedule order.

#### POST /scheduleOrderQueues/add-production-order-to-queue/:id

Creates a schedule order from a production order and adds it to the queue.

**Important Note:** When making requests to this endpoint, make sure to format your request body correctly. The body should be a JSON object with the properties directly at the root level, not nested under a `data` property.

Correct format:

```json
{
  "startDate": "2024-11-05T18:41:46Z",
  "endDate": "2024-11-08T18:41:46Z",
  "bblPerFerm": 69,
  "pgsPerBbl": 58,
  "yieldPgPerBsh": 7
}
```

Incorrect format (will not work):

```json
{
  "data": {
    "startDate": "2024-11-05T18:41:46Z",
    "endDate": "2024-11-08T18:41:46Z",
    "bblPerFerm": 69,
    "pgsPerBbl": 58,
    "yieldPgPerBsh": 7
  }
}
```

### Troubleshooting

If you're experiencing issues with parameters not being passed correctly:

1. **Client Request Format**: Ensure your request follows the format above with properties at the root level.

2. **API Gateway/Proxy Issues**: If you're using an API gateway or proxy, it might be modifying your request body. Check if any middleware is wrapping your parameters in a data object.

3. **Content-Type Header**: Make sure your request includes the proper `Content-Type: application/json` header.

4. **For Data Wrapped in 'data' property**: If you can't modify the client request format and it's sending data wrapped in a 'data' property, you may need to modify the controller to handle this format. Update the controller method to extract data from the body.data object if present.
