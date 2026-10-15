import { gql } from '@apollo/client'

/**
 * Query to fetch all production orders with their basic details
 */
export const GET_PRODUCTION_ORDERS = gql`
  query GetProductionOrders($orderBy: [ProductionOrderOrderByInput!]) {
    productionOrders(orderBy: $orderBy) {
      id
      name
      status
      quantity
      startDate
      endDate
      completedQuantity
      upperControlLimit
      lowerControlLimit
      finalProof
      containerType
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
      scheduleOrder {
        id
        status
        totalCooks
        totalFermenters
        estimatedBarrelsPerFermenter
        estimatedPGsPerBbl
        estimatedPGsPerBushel
        totalGrainWeight
      }
    }
  }
`

/**
 * Query to fetch unscheduled production orders (no scheduleOrderId)
 * Used in UnscheduledOrdersPanel for adding orders to schedule
 */
export const GET_UNSCHEDULED_ORDERS = gql`
  query GetUnscheduledProductionOrders(
    $where: ProductionOrderWhereInput
    $orderBy: [ProductionOrderOrderByInput!]
  ) {
    productionOrders(where: $where, orderBy: $orderBy) {
      id
      name
      status
      quantity
      finalProof
      containerType
      createdAt
      startDate
      endDate
      scheduled
      scheduleOrder {
        id
        status
      }
      customer {
        id
        name
        customerCode
      }
      recipe {
        id
        Recipe
        whiskeyType
        customerCode
        recipeGroup {
          id
          recipe
        }
      }
    }
  }
`

/**
 * Mutation to update a production order
 */
export const UPDATE_PRODUCTION_ORDER = gql`
  mutation UpdateProductionOrder($where: ProductionOrderWhereUniqueInput!, $data: ProductionOrderUpdateInput!) {
    updateProductionOrder(where: $where, data: $data) {
      id
      name
      status
      quantity
      startDate
      endDate
      completedQuantity
      upperControlLimit
      lowerControlLimit
      finalProof
      containerType
      createdAt
      updatedAt
      createdBy
      updatedBy
    }
  }
`
