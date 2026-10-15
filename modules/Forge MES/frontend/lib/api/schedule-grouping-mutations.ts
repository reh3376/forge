import { gql } from '@apollo/client'

/**
 * Mutation to create a ScheduleOrder from multiple ProductionOrders
 * This is the "grouping" operation that creates a production run
 *
 * The backend service:
 * 1. Creates the ScheduleOrder
 * 2. Links all ProductionOrders to it
 * 3. Adds it to the ScheduleOrderQueue
 * 4. Calculates production parameters (barrels, proof gallons, grain weight, etc.)
 */
export const CREATE_SCHEDULE_FROM_ORDERS = gql`
  mutation CreateScheduleOrderFromProductionOrders(
    $productionOrderIds: [String!]!
    $data: CreateScheduleOrderInput!
  ) {
    createScheduleOrderFromProductionOrders(
      productionOrderIds: $productionOrderIds
      data: $data
    ) {
      id
      name
      recipeName
      status
      estimatedStart
      estimatedEnd
      totalCooks
      totalFermenters
      totalBarrels
      totalProofGallons
      estimatedBarrelsPerFermenter
      estimatedPGsPerBbl
      estimatedPGsPerBushel
      totalGrainWeight
      productionOrderAllocation
      productionOrders {
        id
        name
        quantity
      }
      scheduleOrderQueues {
        id
        queueIndex
      }
    }
  }
`

/**
 * Mutation to add ProductionOrders to an existing ScheduleOrder
 * Used when you want to add more barrels/orders to an existing run
 */
export const ADD_ORDERS_TO_SCHEDULE = gql`
  mutation AddProductionOrdersToSchedule(
    $scheduleOrderId: String!
    $productionOrderIds: [String!]!
  ) {
    addProductionOrdersToSchedule(
      scheduleOrderId: $scheduleOrderId
      productionOrderIds: $productionOrderIds
    ) {
      id
      name
      totalBarrels
      totalProofGallons
      productionOrders {
        id
        name
        quantity
      }
    }
  }
`

/**
 * Mutation to remove ProductionOrders from a ScheduleOrder
 * Used when unscheduling orders or adjusting allocations
 */
export const REMOVE_ORDERS_FROM_SCHEDULE = gql`
  mutation RemoveProductionOrdersFromSchedule(
    $scheduleOrderId: String!
    $productionOrderIds: [String!]!
  ) {
    removeProductionOrdersFromSchedule(
      scheduleOrderId: $scheduleOrderId
      productionOrderIds: $productionOrderIds
    ) {
      id
      name
      totalBarrels
      totalProofGallons
      productionOrders {
        id
        name
        quantity
      }
    }
  }
`
