import { FetchPolicy } from '@apollo/client'
import {
  GET_RUNNING_RECIPE_BY_SCHEDULE_ORDER_QUEUE,
  GET_SCHEDULE_ORDER_QUEUES,
  UPDATE_PRODUCTION_ORDER_RECIPE_INSTANCE,
  UPDATE_MASHING_PROTOCOL_STEP,
  UPDATE_RECIPE_BOM_ITEM,
  UPDATE_RECIPE_PARAMETER,
  type GetRunningRecipeByScheduleOrderQueueResult,
  type GetScheduleOrderQueuesResult,
  type RunningRecipe,
  type RunningRecipeIngredient,
  type RunningRecipeParameter,
  type RunningMashingStep,
} from './graphql/running-recipes'
import { unifiedGraphQLClient } from './unified-graphql-client'

// Type for the unified client
type GraphQLClient = {
  query: (options: { query: unknown; variables?: unknown; fetchPolicy?: FetchPolicy }) => Promise<unknown>
  mutate: (options: { mutation: unknown; variables?: unknown }) => Promise<unknown>
}

// Type for production order from GraphQL
interface ProductionOrder {
  id: string
  name: string
  status: string
  recipe: {
    id: string
    Recipe: string
    whiskeyType: string
    parameters?: Array<{
      id: string
      recipeParamName: string
      recipeParamDescription: string
      recipeSetpointType: string
      recipeNumericalSetpoint?: number
      recipeSetpointBooleanValue?: boolean
      units?: {
        id: string
        name: string
        abbreviation: string
      }
    }>
    recipeBoms?: Array<{
      id: string
      recipeBomITem?: Array<{
        id: string
        quantity: number
        operation: string
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
        }
      }>
    }>
    mashingProtocol?: {
      id: string
      name: string
      steps?: Array<{
        id: string
        stepType: string
        holdType?: string
        index: number
        temperatureSetpoint?: number
        stepTime?: number
        heatEnabled?: boolean
        coolEnabled?: boolean
        heatTempSp?: number
        coolTempSp?: number
        agitatorEnabled?: boolean
        agitatorSpdSp?: number
        promptMessage?: string
      }>
    }
  }
  productionOrderRecipeInstances?: Array<{
    id: string
    recipe: {
      id: string
      Recipe: string
    }
    mashingProtocol?: {
      id: string
      name: string
      running: boolean
      steps?: Array<{
        id: string
        stepType: string
        holdType?: string
        index: number
        temperatureSetpoint?: number
        stepTime?: number
        heatEnabled?: boolean
        coolEnabled?: boolean
        heatTempSp?: number
        coolTempSp?: number
        agitatorEnabled?: boolean
        agitatorSpdSp?: number
        promptMessage?: string
      }>
    }
    recipeBom?: {
      id: string
      running: boolean
      recipeBomITem?: Array<{
        id: string
        quantity: number
        operation: string
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
        }
      }>
    }
  }>
}

export class RunningRecipeService {
  /**
   * Get running recipe data for a specific schedule order queue
   */
  async getRunningRecipeByScheduleOrderQueue(
    scheduleOrderQueueId: string,
    fetchPolicy: FetchPolicy = 'cache-first'
  ): Promise<RunningRecipe | null> {
    try {
      const data = await unifiedGraphQLClient.query<GetRunningRecipeByScheduleOrderQueueResult>(
        GET_RUNNING_RECIPE_BY_SCHEDULE_ORDER_QUEUE,
        {
          variables: { scheduleOrderQueueId },
          fetchPolicy,
        }
      )

      if (!data.scheduleOrderQueue?.scheduleOrder?.productionOrders?.length) {
        return null
      }

      // Get the first production order and its recipe instance
      const productionOrder = data.scheduleOrderQueue.scheduleOrder.productionOrders[0]
      if (!productionOrder) {
        return null
      }
      
      const recipeInstance = productionOrder.productionOrderRecipeInstances?.[0]
      
      if (!recipeInstance) {
        // If no recipe instance exists, create one from the master recipe
        return this.createRunningRecipeFromMaster(productionOrder)
      }

      // Convert the GraphQL data to our RunningRecipe format
      return this.convertToRunningRecipe(data.scheduleOrderQueue, productionOrder, recipeInstance)
    } catch (error) {
      console.error('Error fetching running recipe:', error)
      throw new Error(`Failed to fetch running recipe: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get all schedule order queues for the scheduling view
   */
  async getScheduleOrderQueues(
    where?: unknown,
    orderBy?: unknown,
    fetchPolicy: FetchPolicy = 'cache-first'
  ): Promise<GetScheduleOrderQueuesResult['scheduleOrderQueues']> {
    try {
      const data = await unifiedGraphQLClient.query<GetScheduleOrderQueuesResult>(
        GET_SCHEDULE_ORDER_QUEUES,
        {
          variables: { where, orderBy },
          fetchPolicy,
        }
      )

      return data.scheduleOrderQueues
    } catch (error) {
      console.error('Error fetching schedule order queues:', error)
      throw new Error(`Failed to fetch schedule order queues: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a recipe parameter
   */
  async updateRecipeParameter(
    parameterId: string,
    updates: {
      recipeNumericalSetpoint?: number
      recipeSetpointBooleanValue?: boolean
    }
  ): Promise<void> {
    try {
      await unifiedGraphQLClient.mutate({
        mutation: UPDATE_RECIPE_PARAMETER,
        variables: {
          where: { id: parameterId },
          data: updates,
        },
      })
    } catch (error) {
      console.error('Error updating recipe parameter:', error)
      throw new Error(`Failed to update recipe parameter: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a recipe BOM item
   */
  async updateRecipeBomItem(
    bomItemId: string,
    updates: {
      quantity?: number
      operation?: string
    }
  ): Promise<void> {
    try {
      await unifiedGraphQLClient.mutate({
        mutation: UPDATE_RECIPE_BOM_ITEM,
        variables: {
          where: { id: bomItemId },
          data: updates,
        },
      })
    } catch (error) {
      console.error('Error updating recipe BOM item:', error)
      throw new Error(`Failed to update recipe BOM item: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a mashing protocol step
   */
  async updateMashingProtocolStep(
    stepId: string,
    updates: {
      temperatureSetpoint?: number
      stepTime?: number
      heatEnabled?: boolean
      coolEnabled?: boolean
      heatTempSp?: number
      coolTempSp?: number
      agitatorEnabled?: boolean
      agitatorSpdSp?: number
      promptMessage?: string
    }
  ): Promise<void> {
    try {
      await unifiedGraphQLClient.mutate({
        mutation: UPDATE_MASHING_PROTOCOL_STEP,
        variables: {
          where: { id: stepId },
          data: updates,
        },
      })
    } catch (error) {
      console.error('Error updating mashing protocol step:', error)
      throw new Error(`Failed to update mashing protocol step: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a running recipe from master recipe (when no recipe instance exists)
   */
  private createRunningRecipeFromMaster(productionOrder: ProductionOrder): RunningRecipe {
    const recipe = productionOrder.recipe
    
    // Convert master recipe to running recipe format
    const ingredients: RunningRecipeIngredient[] = recipe.recipeBoms?.flatMap((bom) =>
      bom.recipeBomITem?.map((item) => ({
        id: item.id,
        itemCode: item.item.itemNumber,
        name: item.item.itemName,
        quantity: item.quantity,
        unit: item.displayUnits?.abbreviation || 'lbs',
        category: this.mapItemTypeToCategory(item.item.itemType),
        operation: item.operation,
      })) || []
    ) || []

    const parameters: RunningRecipeParameter[] = recipe.parameters?.map((param) => ({
      id: param.id,
      name: param.recipeParamName,
      description: param.recipeParamDescription,
      type: param.recipeSetpointType,
      value: param.recipeNumericalSetpoint ?? param.recipeSetpointBooleanValue ?? '',
      unit: param.units?.abbreviation,
    })) || []

    const mashingSteps: RunningMashingStep[] = recipe.mashingProtocol?.steps?.map((step) => ({
      id: step.id,
      stepType: step.stepType,
      holdType: step.holdType,
      included: true, // Default to included
      notes: step.promptMessage,
      heatTempSp: step.heatTempSp,
      timeDuration: step.stepTime,
      index: step.index,
      temperatureSetpoint: step.temperatureSetpoint,
      heatEnabled: step.heatEnabled,
      coolEnabled: step.coolEnabled,
      coolTempSp: step.coolTempSp,
      agitatorEnabled: step.agitatorEnabled,
      agitatorSpdSp: step.agitatorSpdSp,
      promptMessage: step.promptMessage,
    })) || []

    return {
      id: `master-${recipe.id}`,
      name: recipe.Recipe,
      ingredients,
      parameters,
      mashingSteps,
      originalRecipeId: recipe.id,
      status: 'Active',
    }
  }

  /**
   * Convert GraphQL data to RunningRecipe format
   */
  private convertToRunningRecipe(
    scheduleOrderQueue: unknown,
    productionOrder: ProductionOrder,
    recipeInstance: NonNullable<ProductionOrder['productionOrderRecipeInstances']>[0]
  ): RunningRecipe {
    const recipe = productionOrder.recipe
    const runningMashingProtocol = recipeInstance.mashingProtocol
    const runningRecipeBom = recipeInstance.recipeBom

    // Use running data if available, otherwise fall back to master recipe
    const ingredients: RunningRecipeIngredient[] = runningRecipeBom?.recipeBomITem?.map((item) => ({
      id: item.id,
      itemCode: item.item.itemNumber,
      name: item.item.itemName,
      quantity: item.quantity,
      unit: item.displayUnits?.abbreviation || 'lbs',
      category: this.mapItemTypeToCategory(item.item.itemType),
      operation: item.operation,
    })) || recipe.recipeBoms?.flatMap((bom) =>
      bom.recipeBomITem?.map((item) => ({
        id: item.id,
        itemCode: item.item.itemNumber,
        name: item.item.itemName,
        quantity: item.quantity,
        unit: item.displayUnits?.abbreviation || 'lbs',
        category: this.mapItemTypeToCategory(item.item.itemType),
        operation: item.operation,
      })) || []
    ) || []

    const parameters: RunningRecipeParameter[] = recipe.parameters?.map((param) => ({
      id: param.id,
      name: param.recipeParamName,
      description: param.recipeParamDescription,
      type: param.recipeSetpointType,
      value: param.recipeNumericalSetpoint ?? param.recipeSetpointBooleanValue ?? '',
      unit: param.units?.abbreviation,
    })) || []

    const mashingSteps: RunningMashingStep[] = runningMashingProtocol?.steps?.map((step) => ({
      id: step.id,
      stepType: step.stepType,
      holdType: step.holdType,
      included: true, // Default to included for running steps
      notes: step.promptMessage,
      heatTempSp: step.heatTempSp,
      timeDuration: step.stepTime,
      index: step.index,
      temperatureSetpoint: step.temperatureSetpoint,
      heatEnabled: step.heatEnabled,
      coolEnabled: step.coolEnabled,
      coolTempSp: step.coolTempSp,
      agitatorEnabled: step.agitatorEnabled,
      agitatorSpdSp: step.agitatorSpdSp,
      promptMessage: step.promptMessage,
    })) || recipe.mashingProtocol?.steps?.map((step) => ({
      id: step.id,
      stepType: step.stepType,
      holdType: step.holdType,
      included: true,
      notes: step.promptMessage,
      heatTempSp: step.heatTempSp,
      timeDuration: step.stepTime,
      index: step.index,
      temperatureSetpoint: step.temperatureSetpoint,
      heatEnabled: step.heatEnabled,
      coolEnabled: step.coolEnabled,
      coolTempSp: step.coolTempSp,
      agitatorEnabled: step.agitatorEnabled,
      agitatorSpdSp: step.agitatorSpdSp,
      promptMessage: step.promptMessage,
    })) || []

    return {
      id: recipeInstance.id,
      name: recipe.Recipe,
      ingredients,
      parameters,
      mashingSteps,
      originalRecipeId: recipe.id,
      status: runningMashingProtocol?.running || runningRecipeBom?.running ? 'Active' : 'Modified',
    }
  }

  /**
   * Map item type to ingredient category
   */
  private mapItemTypeToCategory(itemType: string): string {
    const typeMap: Record<string, string> = {
      'Water': 'water',
      'Grain': 'grains',
      'Malt': 'grains',
      'Corn': 'grains',
      'Rye': 'grains',
      'Wheat': 'grains',
      'Yeast': 'yeast',
      'Enzyme': 'enzymes',
      'Additive': 'other',
    }
    
    return typeMap[itemType] || 'other'
  }
}

// Export singleton instance
export const runningRecipeService = new RunningRecipeService() 