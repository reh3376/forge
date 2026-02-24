# Schedule Order API

This module manages the schedule orders in the manufacturing system. Schedule orders represent planned production activities with timing, resource allocation, and phase information.

## Key Concepts

- **Schedule Order**: Represents a scheduled production activity tied to one or more production orders
- **Production Order**: Represents a manufacturing order for a specific product
- **Recipe Group**: Categorizes recipes and is assigned to schedule orders
- **Phase Timing**: Estimates for different production phases (mashing, fermentation, distillation)

## Endpoints

### Create Schedule Order

```
POST /scheduleOrders
```

Creates a new schedule order.

#### Request Body

Schedule order data including:

- `productionOrders`: Production orders to associate with this schedule order
- `recipeGroup`: Recipe group for this schedule order
- `recipeName`: Name of the recipe
- Timing information (optional)

#### Response

Returns the created `ScheduleOrder` object.

### Update Schedule Order

```
PATCH /scheduleOrders/:id
```

Updates an existing schedule order.

#### Path Parameters

- `id`: Schedule order ID (string, required)

#### Request Body

Any schedule order fields to update, which may include:

- `status`: New status for the schedule order
- `estimatedStart`: Updated start time
- `estimatedEnd`: Updated end time
- Phase timing information
- Resource allocation information

#### Response

Returns the updated `ScheduleOrder` object.

#### What Happens

1. Updates the schedule order with the provided data
2. If scheduling fields were updated, also updates associated production orders
3. Synchronizes status between schedule orders and production orders
4. Emits message to the messaging queue for other systems

### Find Schedule Order

```
GET /scheduleOrders/:id
```

Retrieves a specific schedule order by ID.

#### Path Parameters

- `id`: Schedule order ID (string, required)

#### Response

Returns the requested `ScheduleOrder` object.

### Find Schedule Orders

```
GET /scheduleOrders
```

Retrieves a list of schedule orders, with optional filtering.

#### Query Parameters

Various filter options following REST API conventions.

#### Response

Returns a list of `ScheduleOrder` objects.

### Delete Schedule Order

```
DELETE /scheduleOrders/:id
```

Deletes a schedule order.

#### Path Parameters

- `id`: Schedule order ID (string, required)

#### Response

Returns the deleted `ScheduleOrder` object.

## Data Synchronization

The scheduleOrder module works closely with the scheduleOrderQueue module:

- Schedule orders are added to the queue through the scheduleOrderQueue endpoints
- When schedule order data is updated, production order data is synchronized automatically
- Status changes in schedule orders cascade to associated production orders

## Field Descriptions

| Field                            | Type   | Description                                               |
| -------------------------------- | ------ | --------------------------------------------------------- |
| `id`                             | string | Unique identifier                                         |
| `status`                         | enum   | Current status (Created, Scheduled, InProgress, Complete) |
| `recipeName`                     | string | Name of the recipe being produced                         |
| `recipeGroup`                    | object | Recipe group categorization                               |
| `estimatedStart`                 | Date   | Planned start date of production                          |
| `estimatedEnd`                   | Date   | Planned end date of production                            |
| `estimatedMashingStartTime`      | Date   | Planned start of mashing phase                            |
| `estimatedMashingDuration`       | number | Estimated duration of mashing in hours                    |
| `estimatedFermentationStartTime` | Date   | Planned start of fermentation phase                       |
| `estimatedFermentationDuration`  | number | Estimated duration of fermentation in hours               |
| `estimatedDistillationStartTime` | Date   | Planned start of distillation phase                       |
| `estimatedDistillationDuration`  | number | Estimated duration of distillation in hours               |
| `estimatedBarrelingStartTime`    | Date   | Planned start of barreling phase                          |
| `totalBarrels`                   | number | Estimated total barrels to be produced                    |
| `totalProofGallons`              | number | Estimated total proof gallons to be produced              |
| `productionOrderAllocation`      | Json   | Allocation details for production orders                  |
