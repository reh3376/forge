# Production Order Recipe Instance Creation

This document explains how to create production order recipe instances when a schedule order queue becomes active at mashing.

## Overview

When a schedule order queue reaches index 0 (active at mashing), the system automatically creates a production order recipe instance that includes:

- Production Order Recipe Instance record
- Recipe Parameter instances (copied from master recipe)
- Recipe BOM instances with items (linked to master BOM)
- Mashing Protocol instances with steps (linked to master protocol)

## Automatic Integration

**The system now automatically creates production order recipe instances when a schedule order queue becomes active at mashing.** This happens when:

1. The `PATCH /scheduleOrderQueues/activate-next-schedule-order-queue/:id` endpoint is called
2. The `setActiveScheduleOrderQueue` method is invoked in the `ScheduleOrderQueueService`
3. A schedule order queue is moved to index 0 (active at mashing position)

The automatic creation:

- ✅ **Runs automatically** - No manual intervention required
- ✅ **Handles errors gracefully** - Won't break the main scheduling flow if recipe instance creation fails
- ✅ **Logs all operations** - Success and failure cases are logged for monitoring
- ✅ **Validates prerequisites** - Only creates instances when production orders exist
- ✅ **Uses system user** - Automatically sets `createdBy` to "System" for audit trail

## Prerequisites

- Schedule order queue must be at index 0 (active at mashing)
- Schedule order queue must have an associated production order
- Production order must have an associated recipe
- Recipe must have associated parameters, BOMs, and mashing protocols

## Manual Usage (Optional)

You can also manually create production order recipe instances using the API endpoints:

### REST API

```http
POST /api/productionOrderRecipeInstances/create-from-schedule-queue/{scheduleOrderQueueId}
Content-Type: application/json

{
  "createdBy": "username"
}
```

### GraphQL

```graphql
mutation CreateProductionOrderRecipeInstanceFromScheduleQueue(
  $scheduleOrderQueueId: String!
  $createdBy: String!
) {
  createProductionOrderRecipeInstanceFromScheduleQueue(
    scheduleOrderQueueId: $scheduleOrderQueueId
    createdBy: $createdBy
  ) {
    id
    productionOrder {
      id
      name
    }
    recipe {
      id
      Recipe
    }
    recipeParameters {
      id
      recipeParamName
      recipeNumericalSetpoint
    }
    recipeBoms {
      id
      recipeBomITem {
        id
        quantity
        item {
          id
          name
        }
      }
    }
    mashingProtocols {
      id
      mashingProtocolSteps {
        id
        stepType
        temperatureSetpoint
        stepTime
      }
    }
  }
}
```

## Error Handling

The automatic integration includes comprehensive error handling:

- **Missing Production Orders**: Logs a warning and continues without creating instances
- **Recipe Not Found**: Logs an error but doesn't break the scheduling flow
- **Database Errors**: Logs detailed error information for debugging
- **Validation Failures**: Provides clear error messages about what went wrong

## Monitoring and Logging

The system logs the following events:

- **Success**: `Automatically created production order recipe instance {instanceId} for schedule order queue {queueId}`
- **No Production Orders**: `No production orders found for schedule order {scheduleOrderId}, skipping production order recipe instance creation`
- **Errors**: `Failed to automatically create production order recipe instance for schedule order queue {queueId}: {errorMessage}`

## Data Structure

The created production order recipe instance includes:

### Recipe Parameters

- Copied from master recipe parameters
- Set as instances (`isClassDefinition: false`)
- Linked to the production order recipe instance
- Maintains all original setpoints and configurations

### Recipe BOMs

- Copied from master recipe BOMs
- Set as running instances (`running: true`)
- Includes all BOM items with quantities and operations
- Linked to display units and items

### Mashing Protocols

- Copied from master mashing protocols
- Includes all protocol steps with timing and temperature settings
- Maintains step types, hold types, and heat settings
- Linked to the production order recipe instance

## Integration Points

This functionality integrates with:

- **Schedule Order Queue Management**: Automatic triggering when queues become active
- **Production Order Workflow**: Links recipe instances to production orders
- **Recipe Management**: Uses master recipes as templates
- **Manufacturing Execution**: Provides instances for production tracking

## Testing

Comprehensive tests verify:

- ✅ Automatic creation when schedule order queue becomes active
- ✅ Proper handling when no production orders exist
- ✅ Graceful error handling without breaking main workflow
- ✅ Correct logging of all scenarios
- ✅ Proper data structure creation with all relationships
