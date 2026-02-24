import { GraphQLClient } from 'graphql-request'

// Use the Next.js GraphQL proxy which handles authentication automatically via service account
// The proxy is located at /api/graphql and manages JWT tokens for the MES backend
const endpoint = typeof window !== 'undefined' 
  ? `${window.location.origin}/api/graphql`
  : 'http://localhost:4000/api/graphql'

export const mesClient = new GraphQLClient(endpoint, {
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types based on actual MES GraphQL schema
export interface ProductionOrder {
  id: string
  name: string | null
  status: 'Complete' | 'Initiated' | 'InProgress' | 'Planned' | 'Committed'
  startDate: string
  endDate: string
  quantity: number
  completedQuantity: number | null
  totalCooks: number | null
  totalFermenters: number | null
  upperControlLimit: number | null
  lowerControlLimit: number | null
  recipe: {
    id: string
    whiskeyType: string
  }
  customer: {
    id: string
  }
  scheduleOrder: {
    id: string
    status: string
  }
}

export interface ScheduleOrder {
  id: string
  name: string
  status: 'Complete' | 'Created' | 'InProgress' | 'Scheduled'
  estimatedStart: string
  estimatedEnd: string
  actualStart: string | null
  actualEnd: string | null
  totalBarrels: number | null
  totalProofGallons: number | null
  productionOrders: Array<{
    id: string
    name: string | null
    status: string
  }>
}

export interface Recipe {
  id: string
  whiskeyType: string
}

export interface Customer {
  id: string
}

// GraphQL Queries
export const GET_PRODUCTION_ORDERS = `
  query GetProductionOrders($take: Float, $skip: Float, $orderBy: [ProductionOrderOrderByInput!], $where: ProductionOrderWhereInput) {
    productionOrders(take: $take, skip: $skip, orderBy: $orderBy, where: $where) {
      id
      name
      status
      startDate
      endDate
      quantity
      completedQuantity
      upperControlLimit
      lowerControlLimit
      recipe {
        id
        whiskeyType
      }
      customer {
        id
      }
      scheduleOrder {
        id
        status
        totalCooks
        totalFermenters
      }
    }
  }
`

export const GET_SCHEDULE_ORDERS = `
  query GetScheduleOrders($take: Float, $skip: Float, $orderBy: [ScheduleOrderOrderByInput!], $where: ScheduleOrderWhereInput) {
    scheduleOrders(take: $take, skip: $skip, orderBy: $orderBy, where: $where) {
      id
      name
      status
      estimatedStart
      estimatedEnd
      actualStart
      actualEnd
      totalBarrels
      totalProofGallons
      productionOrders {
        id
        name
        status
      }
    }
  }
`

export const GET_RECIPES = `
  query GetRecipes($take: Float, $skip: Float) {
    recipes(take: $take, skip: $skip) {
      id
      whiskeyType
    }
  }
`

export const GET_CUSTOMERS = `
  query GetCustomers($take: Float, $skip: Float) {
    customers(take: $take, skip: $skip) {
      id
    }
  }
`

export const CREATE_PRODUCTION_ORDER = `
  mutation CreateProductionOrder($data: ProductionOrderCreateInput!) {
    createProductionOrder(data: $data) {
      id
      name
      status
      startDate
      endDate
      quantity
      upperControlLimit
      lowerControlLimit
      recipe {
        id
        whiskeyType
      }
      customer {
        id
      }
    }
  }
`

export const UPDATE_PRODUCTION_ORDER = `
  mutation UpdateProductionOrder($where: ProductionOrderWhereUniqueInput!, $data: ProductionOrderUpdateInput!) {
    updateProductionOrder(where: $where, data: $data) {
      id
      name
      status
      startDate
      endDate
      quantity
      completedQuantity
      upperControlLimit
      lowerControlLimit
    }
  }
`

export const CREATE_SCHEDULE_ORDER = `
  mutation CreateScheduleOrder($data: ScheduleOrderCreateInput!) {
    createScheduleOrder(data: $data) {
      id
      name
      status
      estimatedStart
      estimatedEnd
      totalBarrels
      totalProofGallons
    }
  }
`

export const UPDATE_SCHEDULE_ORDER = `
  mutation UpdateScheduleOrder($where: ScheduleOrderWhereUniqueInput!, $data: ScheduleOrderUpdateInput!) {
    updateScheduleOrder(where: $where, data: $data) {
      id
      name
      status
      estimatedStart
      estimatedEnd
      actualStart
      actualEnd
      totalBarrels
      totalProofGallons
    }
  }
`

// API Functions
export async function getProductionOrders(variables?: {
  take?: number
  skip?: number
  orderBy?: Record<string, string>[]
  where?: Record<string, unknown>
}): Promise<ProductionOrder[]> {
  try {
    const data = await mesClient.request<{ productionOrders: ProductionOrder[] }>(GET_PRODUCTION_ORDERS, variables)
    return data.productionOrders
  } catch (error) {
    console.error('Error in getProductionOrders:', error)
    throw error
  }
}

export async function getScheduleOrders(variables?: {
  take?: number
  skip?: number
  orderBy?: Record<string, string>[]
  where?: Record<string, unknown>
}): Promise<ScheduleOrder[]> {
  try {
    const data = await mesClient.request<{ scheduleOrders: ScheduleOrder[] }>(GET_SCHEDULE_ORDERS, variables)
    return data.scheduleOrders
  } catch (error) {
    console.error('Error in getScheduleOrders:', error)
    throw error
  }
}

export async function getRecipes(variables?: {
  take?: number
  skip?: number
}): Promise<Recipe[]> {
  const data = await mesClient.request<{ recipes: Recipe[] }>(GET_RECIPES, variables)
  return data.recipes
}

export async function getCustomers(variables?: {
  take?: number
  skip?: number
}): Promise<Customer[]> {
  const data = await mesClient.request<{ customers: Customer[] }>(GET_CUSTOMERS, variables)
  return data.customers
}

export async function createProductionOrder(data: Record<string, unknown>): Promise<ProductionOrder> {
  const result = await mesClient.request<{ createProductionOrder: ProductionOrder }>(CREATE_PRODUCTION_ORDER, { data })
  return result.createProductionOrder
}

export async function updateProductionOrder(where: Record<string, unknown>, data: Record<string, unknown>): Promise<ProductionOrder> {
  const result = await mesClient.request<{ updateProductionOrder: ProductionOrder }>(UPDATE_PRODUCTION_ORDER, { where, data })
  return result.updateProductionOrder
}

export async function createScheduleOrder(data: Record<string, unknown>): Promise<ScheduleOrder> {
  const result = await mesClient.request<{ createScheduleOrder: ScheduleOrder }>(CREATE_SCHEDULE_ORDER, { data })
  return result.createScheduleOrder
}

export async function updateScheduleOrder(where: Record<string, unknown>, data: Record<string, unknown>): Promise<ScheduleOrder> {
  const result = await mesClient.request<{ updateScheduleOrder: ScheduleOrder }>(UPDATE_SCHEDULE_ORDER, { where, data })
  return result.updateScheduleOrder
} 