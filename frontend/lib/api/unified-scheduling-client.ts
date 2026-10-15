import { unifiedGraphQLClient } from './unified-graphql-client'
import { PRODUCTION_ORDER_QUERIES, PRODUCTION_ORDER_MUTATIONS, ITEM_QUERIES, CUSTOMER_QUERIES, RECIPE_QUERIES } from './graphql-queries'
import { gql } from '@apollo/client'

// Types for scheduling operations
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
    Recipe: string
    whiskeyType: string
  }
  customer: {
    id: string
  }
  scheduleOrder: {
    id: string
    status: string
  } | null
}

export interface ScheduleOrderQueue {
  id: string
  queueIndex: number | null
  scheduleOrder: {
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
  } | null
}

export interface Asset {
  id: string
  name: string
  assetType: string
  assetPath: string
  index: number
  scheduleOrderQueues: Array<{
    id: string
    queueIndex: number
    areas: Array<{
      id: string
      name: string
    }>
    scheduleOrder: {
      id: string
      name: string
      recipeName?: string
      status: 'Created' | 'Scheduled' | 'InProgress' | 'Complete'
      estimatedStart: string
      estimatedEnd: string
      actualStart?: string
      actualEnd?: string
      totalBarrels?: number
      totalProofGallons?: number
    }
  }>
}

export interface PaginationParams {
  skip?: number
  take?: number
}

export interface ProductionOrderFilter {
  status?: string
  startDate?: string
  endDate?: string
}

export interface ScheduleOrderQueueFilter {
  status?: string
  queueIndex?: {
    lte?: number
    gte?: number
  }
}

export interface ProductionOrderCreateInput {
  name: string
  quantity: number
  startDate: string
  endDate: string
  status?: string
  totalCooks?: number
  totalFermenters?: number
  upperControlLimit?: number | null
  lowerControlLimit?: number | null
  recipe: {
    connect: { id: string }
  }
  customer: {
    connect: { id: string }
  }
}

export interface ProductionOrderUpdateInput {
  name?: string
  quantity?: number
  startDate?: string
  endDate?: string
  status?: string
  totalCooks?: number
  totalFermenters?: number
  upperControlLimit?: number | null
  lowerControlLimit?: number | null
  completedQuantity?: number | null
}

export interface ContainerItem {
  id: string
  itemName: string
  itemNumber: string
  itemGroup?: string
}

export interface ItemFilter {
  itemGroup?: {
    equals?: string
  }
}

export interface Customer {
  id: string
  name: string
  customerCode: string
}

export interface RecipeBOMItem {
  id: string
  itemCode: string
  itemName: string
  quantity: number
  unit: string
  category: string
  itemGroup: string
  operation: string
  // Formula configuration fields
  calculationMode?: 'STATIC' | 'FORMULA_GRAIN' | 'FORMULA_WATER' | 'ENZYME_NORMALIZED' | 'EXPRESSION'
  formulaType?: 'SIMPLE_RATIO' | 'WATER_PER_BUSHEL' | 'BACKSET_PERCENTAGE' | 'CUSTOM'
  formulaMultiplier?: number
  customExpression?: string
}

export interface RecipeBOM {
  id: string
  revision: number
  master: boolean
  running: boolean
  items: RecipeBOMItem[]
}

// Custom GraphQL queries for scheduling operations
const GET_SCHEDULE_ORDER_QUEUES = gql`
  query GetScheduleOrderQueues($take: Float, $orderBy: [ScheduleOrderQueueOrderByInput!]) { 
    scheduleOrderQueues(take: $take, orderBy: $orderBy) { 
      id
      queueIndex
      scheduleOrder {
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
  }
`

const GET_CELLS_WITH_SCHEDULE_ORDERS = gql`
  query GetCellsWithScheduleOrders {
    assets(
      where: { assetType: Cell }
      orderBy: [{parentId: Asc},{ index: Asc }]
    ) {
      id
      name
      assetType
      assetPath
      index
      scheduleOrderQueues(
        where: { queueIndex: { lte: 0 } }
        orderBy: [{ queueIndex: Desc }]
      ) {
        id
        queueIndex
        areas {
          id
          name
        }
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
        }
      }
    }
  }
`

/**
 * Unified Scheduling Client
 * 
 * This class consolidates all scheduling-related GraphQL operations
 * using the unified GraphQL client with proper JWT authentication.
 */
export class UnifiedSchedulingClient {
  private client = unifiedGraphQLClient

  /**
   * Get production orders with pagination and filtering
   */
  async getProductionOrders(
    pagination?: PaginationParams,
    filter?: ProductionOrderFilter
  ): Promise<ProductionOrder[]> {
    const { skip = 0, take = 100 } = pagination || {}
    
    try {
      console.log('🔄 Fetching production orders with unified client...', { skip, take, filter })
      
      const result = await this.client.query<{ productionOrders: ProductionOrder[] }>(
        PRODUCTION_ORDER_QUERIES.GET_PRODUCTION_ORDERS,
        {
          variables: { skip, take, where: filter },
          fetchPolicy: 'cache-first'
        }
      )

      const orders = result.productionOrders || []
      console.log('✅ Successfully fetched production orders:', orders.length)
      
      return orders
    } catch (error) {
      console.error('🔥 Error fetching production orders with unified client:', error)
      throw error
    }
  }

  /**
   * Get schedule order queues with pagination and filtering
   */
  async getScheduleOrderQueues(
    pagination?: PaginationParams,
    orderBy?: Array<{ queueIndex?: 'Asc' | 'Desc' }>
  ): Promise<ScheduleOrderQueue[]> {
    const { skip = 0, take = 50 } = pagination || {}
    const defaultOrderBy = orderBy || [{ queueIndex: 'Asc' }]
    
    try {
      console.log('🔄 Fetching schedule order queues with unified client...', { skip, take, orderBy: defaultOrderBy })
      
      const result = await this.client.query<{ scheduleOrderQueues: ScheduleOrderQueue[] }>(
        GET_SCHEDULE_ORDER_QUEUES,
        {
          variables: { take, orderBy: defaultOrderBy },
          fetchPolicy: 'cache-first'
        }
      )

      const queues = result.scheduleOrderQueues || []
      console.log('✅ Successfully fetched schedule order queues:', queues.length)
      
      return queues
    } catch (error) {
      console.error('🔥 Error fetching schedule order queues with unified client:', error)
      throw error
    }
  }

  /**
   * Get cells with schedule orders for the schedule view
   */
  async getCellsWithScheduleOrders(): Promise<Asset[]> {
    try {
      console.log('🔄 Fetching cells with schedule orders using unified client...')
      
      const result = await this.client.query<{ assets: Asset[] }>(
        GET_CELLS_WITH_SCHEDULE_ORDERS,
        {
          fetchPolicy: 'cache-first'
        }
      )

      const assets = result.assets || []
      console.log('✅ Successfully fetched cells with schedule orders:', assets.length)
      
      return assets
    } catch (error) {
      console.error('🔥 Error fetching cells with schedule orders:', error)
      throw error
    }
  }

  /**
   * Get backend configuration info
   */
  getBackendInfo() {
    return this.client.getBackendInfo()
  }

  /**
   * Test authentication by making a simple query
   */
  async testAuthentication(): Promise<{ success: boolean; message: string; authType?: string }> {
    try {
      console.log('🧪 Testing authentication with unified client...')
      
      // Try a simple query to test authentication
      const result = await this.client.query<{ customers: unknown[] }>(
        CUSTOMER_QUERIES.GET_CUSTOMERS,
        {
          variables: { take: 1 },
          fetchPolicy: 'network-only'
        }
      )

      console.log('✅ Authentication test successful, received data:', !!result)
      return {
        success: true,
        message: 'Authentication successful',
        authType: 'unified'
      }
    } catch (error) {
      console.error('🔥 Authentication test failed:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  }

  /**
   * Create a new production order
   */
  async createProductionOrder(input: ProductionOrderCreateInput): Promise<ProductionOrder> {
    try {
      console.log('🔄 Creating production order with unified client...', input)
      
      const result = await this.client.mutate<{ createProductionOrder: ProductionOrder }>(
        PRODUCTION_ORDER_MUTATIONS.CREATE_PRODUCTION_ORDER,
        {
          variables: { data: input },
          refetchQueries: [
            {
              query: PRODUCTION_ORDER_QUERIES.GET_PRODUCTION_ORDERS,
              variables: { take: 100 }
            }
          ]
        }
      )

      const createdOrder = result.createProductionOrder
      if (!createdOrder) {
        throw new Error('Failed to create production order - no data returned')
      }

      console.log('✅ Successfully created production order:', createdOrder.id)
      return createdOrder
    } catch (error) {
      console.error('🔥 Error creating production order with unified client:', error)
      throw error
    }
  }

  /**
   * Update an existing production order
   */
  async updateProductionOrder(id: string, input: ProductionOrderUpdateInput): Promise<ProductionOrder> {
    try {
      console.log('🔄 Updating production order with unified client...', { id, input })
      
      const result = await this.client.mutate<{ updateProductionOrder: ProductionOrder }>(
        PRODUCTION_ORDER_MUTATIONS.UPDATE_PRODUCTION_ORDER,
        {
          variables: { 
            where: { id },
            data: input 
          },
          refetchQueries: [
            {
              query: PRODUCTION_ORDER_QUERIES.GET_PRODUCTION_ORDERS,
              variables: { take: 100 }
            }
          ]
        }
      )

      const updatedOrder = result.updateProductionOrder
      if (!updatedOrder) {
        throw new Error('Failed to update production order - no data returned')
      }

      console.log('✅ Successfully updated production order:', updatedOrder.id)
      return updatedOrder
    } catch (error) {
      console.error('🔥 Error updating production order with unified client:', error)
      throw error
    }
  }

  /**
   * Get container items for production order wizard
   */
  async getContainerItems(): Promise<ContainerItem[]> {
    try {
      console.log('🔄 Fetching container items with unified client...')
      
      const result = await this.client.query<{ items: ContainerItem[] }>(
        ITEM_QUERIES.GET_CONTAINER_ITEMS,
        {
          fetchPolicy: 'cache-first'
        }
      )

      // The unified client returns the data directly, so result is { items: [...] }
      const items = result.items || []
      console.log('✅ Successfully fetched container items:', items.length)
      
      return items
    } catch (error) {
      console.error('🔥 Error fetching container items with unified client:', error)
      throw error
    }
  }

  /**
   * Get container items filtered by container type
   */
  async getContainerItemsByType(containerType: string): Promise<ContainerItem[]> {
    try {
      console.log(`🔄 Fetching container items for type: ${containerType}`)
      
      // First get all container items
      const allItems = await this.getContainerItems()
      
      // Filter based on container type
      const filteredItems = allItems.filter(item => {
        const itemGroupName = item.itemGroup?.toLowerCase() || ''
        
        switch (containerType) {
          case 'LargeBarrel':
            return itemGroupName.includes('barrel') && itemGroupName.includes('53')
          case 'SmallBarrel':
            return itemGroupName.includes('barrel') && itemGroupName.includes('30')
          default:
            return false
        }
      })
      
      console.log(`✅ Found ${filteredItems.length} container items for ${containerType}`)
      return filteredItems
    } catch (error) {
      console.error(`🔥 Error fetching container items for type ${containerType}:`, error)
      throw error
    }
  }

  /**
   * Generate a unique production order name based on today's date and existing orders
   */
  async generateProductionOrderName(): Promise<string> {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD format
    
    try {
      console.log('🔄 Generating production order name with unified client...')
      
      // Query existing orders for today to get the count
      const result = await this.client.query<{ productionOrders: ProductionOrder[] }>(
        gql`
          query GetTodaysOrderCount($startDate: DateTime!, $endDate: DateTime!) {
            productionOrders(
              where: {
                createdAt: {
                  gte: $startDate
                  lt: $endDate
                }
              }
            ) {
              id
            }
          }
        `,
        {
          variables: {
            startDate: `${today.toISOString().slice(0, 10)}T00:00:00.000Z`,
            endDate: `${today.toISOString().slice(0, 10)}T23:59:59.999Z`
          },
          fetchPolicy: 'network-only' // Always get fresh count
        }
      )

      const todaysOrderCount = result.productionOrders?.length || 0
      const nextIndex = todaysOrderCount + 1
      
      // Format: PRO-YYYYMMDD### (pad index to 3 digits)
      const generatedName = `PRO-${dateStr}${nextIndex.toString().padStart(3, '0')}`
      console.log('✅ Generated production order name:', generatedName)
      
      return generatedName
      
    } catch (error) {
      console.error('🔥 Error generating production order name:', error)
      // Fallback to timestamp-based naming if query fails
      const timestamp = Date.now().toString().slice(-3)
      const fallbackName = `PRO-${dateStr}${timestamp}`
      console.log('⚠️ Using fallback production order name:', fallbackName)
      return fallbackName
    }
  }

  /**
   * Get customers for dropdowns and selection
   */
  async getCustomers(pagination?: PaginationParams): Promise<Customer[]> {
    const { skip = 0, take = 100 } = pagination || {}
    
    try {
      console.log('🔄 Fetching customers with unified client...', { skip, take })
      
      const result = await this.client.query<{ customers: Customer[] }>(
        CUSTOMER_QUERIES.GET_CUSTOMERS,
        {
          variables: { skip, take },
          fetchPolicy: 'cache-first'
        }
      )

      const customers = result.customers || []
      console.log('✅ Successfully fetched customers:', customers.length)
      
      return customers
    } catch (error) {
      console.error('🔥 Error fetching customers with unified client:', error)
      throw error
    }
  }

  /**
   * Get Recipe BOM by recipe ID
   */
  async getRecipeBOM(recipeId: string): Promise<RecipeBOMItem[]> {
    try {
      console.log('🔄 Fetching recipe BOM with unified client...', { recipeId })
      
      interface RecipeBomItem {
        id: string
        quantity: number
        operation: string
        calculationMode?: string
        formulaType?: string
        formulaMultiplier?: number
        customExpression?: string
        item: {
          id: string
          itemNumber: string
          itemName: string
          itemType: string
          itemGroup: string
        }
        displayUnits?: {
          id: string
          name: string
          abbreviation: string
          perOperation: boolean
        }
      }

      interface RecipeBom {
        id: string
        revision: number
        master: boolean
        running: boolean
        recipeBomITem: RecipeBomItem[]
      }

      interface RecipeResponse {
        recipe: {
          id: string
          Recipe: string
          recipeBoms: RecipeBom[]
        }
      }
      
      const data = await this.client.query<RecipeResponse>(
        RECIPE_QUERIES.GET_RECIPE_BOM,
        {
          variables: { recipeId },
          fetchPolicy: 'cache-first'
        }
      )

      console.log('📊 Recipe BOM response:', data)
      console.log('📊 Raw BOM items:', data?.recipe?.recipeBoms?.[0]?.recipeBomITem?.slice(0, 3))

      if (!data?.recipe?.recipeBoms) {
        console.warn('⚠️ No recipe BOMs found for recipe:', recipeId)
        return []
      }

      // Get the master BOM or the first available BOM
      const masterBom = data.recipe.recipeBoms.find((bom: RecipeBom) => bom.master) || data.recipe.recipeBoms[0]
      
      if (!masterBom?.recipeBomITem) {
        console.warn('⚠️ No BOM items found in recipe BOM')
        return []
      }

      // Transform the BOM items to our expected format
      const bomItems: RecipeBOMItem[] = masterBom.recipeBomITem.map((bomItem: RecipeBomItem) => {
        const item: RecipeBOMItem = {
          id: bomItem.id,
          itemCode: bomItem.item.itemNumber,
          itemName: bomItem.item.itemName?.trim() || bomItem.item.itemNumber,
          quantity: bomItem.quantity,
          unit: bomItem.displayUnits?.abbreviation || bomItem.displayUnits?.name || '',
          category: bomItem.item.itemType || 'Material',
          itemGroup: bomItem.item.itemGroup || 'General',
          operation: bomItem.operation,
        }
        // Include formula configuration fields only if defined
        if (bomItem.calculationMode && bomItem.calculationMode !== undefined) {
          item.calculationMode = bomItem.calculationMode as NonNullable<RecipeBOMItem['calculationMode']>
        }
        if (bomItem.formulaType && bomItem.formulaType !== undefined) {
          item.formulaType = bomItem.formulaType as NonNullable<RecipeBOMItem['formulaType']>
        }
        if (bomItem.formulaMultiplier !== undefined && bomItem.formulaMultiplier !== null) {
          item.formulaMultiplier = bomItem.formulaMultiplier
        }
        if (bomItem.customExpression) {
          item.customExpression = bomItem.customExpression
        }
        return item
      })

      console.log('✅ Transformed BOM items:', bomItems)
      return bomItems

    } catch (error) {
      console.error('❌ Error fetching recipe BOM:', error)
      throw new Error(`Failed to fetch recipe BOM: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

// Export singleton instance
export const unifiedSchedulingClient = new UnifiedSchedulingClient()

// Export for backward compatibility
export const schedulingClient = unifiedSchedulingClient 