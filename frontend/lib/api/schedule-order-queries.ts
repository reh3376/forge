import { gql } from '@apollo/client'

/**
 * Query to fetch schedule order queues with full ScheduleOrder details
 * Includes ScheduleOrder-native relationships: recipeGroup, scheduleOrderRecipe, customers
 * Also includes linked ProductionOrders for allocation tracking
 */
export const GET_SCHEDULE_ORDER_QUEUES = gql`
  query GetScheduleOrderQueues($take: Float, $orderBy: [ScheduleOrderQueueOrderByInput!]) {
    scheduleOrderQueues(take: $take, orderBy: $orderBy) {
      id
      queueIndex
      scheduleOrder {
        id
        name
        recipeName
        status
        estimatedStart
        estimatedEnd
        actualStart
        actualEnd
        totalBarrels
        totalProofGallons
        duration
        durationUnits
        estimatedMashingDuration
        estimatedMashingStartTime
        estimatedFermentationDuration
        estimatedFermentationStartTime
        estimatedDistillationDuration
        estimatedDistillationStartTime
        estimatedBarrelingStartTime
        estimatedProcessingStartTime
        estimatedTotalProductionDuration
        totalCooks
        totalFermenters
        completedCooks
        completedFermenters
        executedCooks
        executedFermenters
        estimatedBarrelsPerFermenter
        estimatedPGsPerBbl
        estimatedPGsPerBushel
        totalGrainWeight
        totalWaterVolume
        loadsLastUpdatedAt
        loadsLastUpdatedBy
        recipeGroup {
          id
          recipe
          revision
        }
        scheduleOrderRecipe {
          id
          Recipe
          whiskeyType
          customerCode
        }
        customers {
          id
          name
          customerCode
        }
        productionOrders {
          id
          name
          status
          quantity
          containerType
          finalProof
          recipe {
            id
            Recipe
            whiskeyType
            customerCode
          }
          customer {
            id
            name
            customerCode
          }
        }
      }
    }
  }
`

/**
 * Mutation to update a schedule order
 */
export const UPDATE_SCHEDULE_ORDER = gql`
  mutation UpdateScheduleOrder($where: ScheduleOrderWhereUniqueInput!, $data: ScheduleOrderUpdateInput!) {
    updateScheduleOrder(where: $where, data: $data) {
      id
      name
      recipeName
      status
      estimatedStart
      estimatedEnd
      actualStart
      actualEnd
      totalBarrels
      totalProofGallons
      duration
      durationUnits
      estimatedMashingDuration
      estimatedMashingStartTime
      estimatedFermentationDuration
      estimatedFermentationStartTime
      estimatedDistillationDuration
      estimatedDistillationStartTime
      estimatedBarrelingStartTime
      estimatedProcessingStartTime
      totalCooks
      totalFermenters
      completedCooks
      completedFermenters
      executedCooks
      executedFermenters
      estimatedBarrelsPerFermenter
      estimatedPGsPerBbl
      estimatedPGsPerBushel
      totalGrainWeight
      createdAt
      updatedAt
      createdBy
      updatedBy
    }
  }
`

/**
 * Mutation to delete a schedule order
 */
export const DELETE_SCHEDULE_ORDER = gql`
  mutation DeleteScheduleOrder($where: ScheduleOrderWhereUniqueInput!) {
    deleteScheduleOrder(where: $where) {
      id
    }
  }
`

/**
 * Mutation to update grain and water loads for a schedule order
 * This triggers automatic BOM quantity recalculation
 */
export const UPDATE_SCHEDULE_ORDER_LOADS = gql`
  mutation UpdateScheduleOrderLoads(
    $scheduleOrderId: String!
    $data: UpdateScheduleOrderLoadsInput!
    $userId: String!
  ) {
    updateScheduleOrderLoads(
      scheduleOrderId: $scheduleOrderId
      data: $data
      userId: $userId
    ) {
      id
      totalGrainWeight
      totalWaterVolume
      loadsLastUpdatedAt
      loadsLastUpdatedBy
    }
  }
`
