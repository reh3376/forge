import { gql } from '@apollo/client'

// Types based on the actual GraphQL schema
export interface RunningRecipeIngredient {
  id: string
  itemCode: string
  name: string
  quantity: number
  unit: string
  category: string
  operation: string
}

export interface RunningRecipeParameter {
  id: string
  name: string
  description: string
  type: string
  value: number | string | boolean
  unit?: string
}

export interface RunningMashingStep {
  id: string
  stepType: string
  holdType?: string
  included: boolean
  notes?: string
  heatTempSp?: number
  timeDuration?: number
  index: number
  temperatureSetpoint?: number
  heatEnabled?: boolean
  coolEnabled?: boolean
  coolTempSp?: number
  agitatorEnabled?: boolean
  agitatorSpdSp?: number
  promptMessage?: string
}

export interface RunningRecipe {
  id: string
  name: string
  ingredients: RunningRecipeIngredient[]
  parameters: RunningRecipeParameter[]
  mashingSteps: RunningMashingStep[]
  originalRecipeId?: string
  status: string
}

// GraphQL query to get running recipe data from ScheduleOrderQueue
export const GET_RUNNING_RECIPE_BY_SCHEDULE_ORDER_QUEUE = gql`
  query GetRunningRecipeByScheduleOrderQueue($scheduleOrderQueueId: String!) {
    scheduleOrderQueue(where: { id: $scheduleOrderQueueId }) {
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
        productionOrders {
          id
          name
          status
          recipe {
            id
            Recipe
            whiskeyType
            parameters {
              id
              recipeParamName
              recipeParamDescription
              recipeSetpointType
              recipeNumericalSetpoint
              recipeSetpointBooleanValue
              units {
                id
                name
                abbreviation
              }
            }
            recipeBoms {
              id
              recipeBomITem {
                id
                quantity
                operation
                item {
                  id
                  itemNumber
                  itemName
                  itemType
                  itemGroup
                }
                displayUnits {
                  id
                  name
                  abbreviation
                }
              }
            }
            mashingProtocol {
              id
              name
              steps {
                id
                stepType
                holdType
                index
                temperatureSetpoint
                stepTime
                heatEnabled
                coolEnabled
                heatTempSp
                coolTempSp
                agitatorEnabled
                agitatorSpdSp
                promptMessage
              }
            }
          }
          productionOrderRecipeInstances {
            id
            recipe {
              id
              Recipe
            }
            mashingProtocol {
              id
              name
              running
              steps {
                id
                stepType
                holdType
                index
                temperatureSetpoint
                stepTime
                heatEnabled
                coolEnabled
                heatTempSp
                coolTempSp
                agitatorEnabled
                agitatorSpdSp
                promptMessage
              }
            }
            recipeBom {
              id
              running
              recipeBomITem {
                id
                quantity
                operation
                item {
                  id
                  itemNumber
                  itemName
                  itemType
                  itemGroup
                }
                displayUnits {
                  id
                  name
                  abbreviation
                }
              }
            }
          }
        }
      }
    }
  }
`

// Query to get all schedule order queues for the scheduling view
export const GET_SCHEDULE_ORDER_QUEUES = gql`
  query GetScheduleOrderQueues($where: ScheduleOrderQueueWhereInput, $orderBy: [ScheduleOrderQueueOrderByInput!]) {
    scheduleOrderQueues(where: $where, orderBy: $orderBy) {
      id
      queueIndex
      areas {
        id
        name
        assetType
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
        productionOrders {
          id
          name
          status
          quantity
          recipe {
            id
            Recipe
            whiskeyType
          }
        }
      }
    }
  }
`

// Mutation to update production order recipe instance (running recipe)
export const UPDATE_PRODUCTION_ORDER_RECIPE_INSTANCE = gql`
  mutation UpdateProductionOrderRecipeInstance(
    $where: ProductionOrderRecipeInstanceWhereUniqueInput!
    $data: ProductionOrderRecipeInstanceUpdateInput!
  ) {
    updateProductionOrderRecipeInstance(where: $where, data: $data) {
      id
      recipe {
        id
        Recipe
      }
      mashingProtocol {
        id
        name
        running
      }
      recipeBom {
        id
        running
      }
    }
  }
`

// Mutation to update mashing protocol steps
export const UPDATE_MASHING_PROTOCOL_STEP = gql`
  mutation UpdateMashingProtocolStep(
    $where: MashingProtocolStepWhereUniqueInput!
    $data: MashingProtocolStepUpdateInput!
  ) {
    updateMashingProtocolStep(where: $where, data: $data) {
      id
      stepType
      holdType
      index
      temperatureSetpoint
      stepTime
      heatEnabled
      coolEnabled
      heatTempSp
      coolTempSp
      agitatorEnabled
      agitatorSpdSp
      promptMessage
    }
  }
`

// Mutation to update recipe BOM item
export const UPDATE_RECIPE_BOM_ITEM = gql`
  mutation UpdateRecipeBomItem(
    $where: RecipeBomItemWhereUniqueInput!
    $data: RecipeBomItemUpdateInput!
  ) {
    updateRecipeBomItem(where: $where, data: $data) {
      id
      quantity
      operation
      item {
        id
        itemNumber
        itemName
      }
      displayUnits {
        id
        name
        abbreviation
      }
    }
  }
`

// Mutation to update recipe parameter
export const UPDATE_RECIPE_PARAMETER = gql`
  mutation UpdateRecipeParameter(
    $where: RecipeParameterWhereUniqueInput!
    $data: RecipeParameterUpdateInput!
  ) {
    updateRecipeParameter(where: $where, data: $data) {
      id
      recipeParamName
      recipeParamDescription
      recipeSetpointType
      recipeNumericalSetpoint
      recipeSetpointBooleanValue
      units {
        id
        name
        abbreviation
      }
    }
  }
`

// Types for the query results
export interface GetRunningRecipeByScheduleOrderQueueResult {
  scheduleOrderQueue: {
    id: string
    queueIndex: number
    scheduleOrder: {
      id: string
      name: string
      recipeName: string
      status: string
      estimatedStart: string
      estimatedEnd: string
      actualStart?: string
      actualEnd?: string
      totalBarrels?: number
      totalProofGallons?: number
      productionOrders: Array<{
        id: string
        name: string
        status: string
        recipe: {
          id: string
          Recipe: string
          whiskeyType: string
          parameters: Array<{
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
          recipeBoms: Array<{
            id: string
            recipeBomITem: Array<{
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
            steps: Array<{
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
        productionOrderRecipeInstances: Array<{
          id: string
          recipe: {
            id: string
            Recipe: string
          }
          mashingProtocol?: {
            id: string
            name: string
            running: boolean
            steps: Array<{
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
            recipeBomITem: Array<{
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
      }>
    }
  }
}

export interface GetScheduleOrderQueuesResult {
  scheduleOrderQueues: Array<{
    id: string
    queueIndex: number
    areas: Array<{
      id: string
      name: string
      assetType: string
    }>
    scheduleOrder: {
      id: string
      name: string
      recipeName: string
      status: string
      estimatedStart: string
      estimatedEnd: string
      actualStart?: string
      actualEnd?: string
      totalBarrels?: number
      totalProofGallons?: number
      productionOrders: Array<{
        id: string
        name: string
        status: string
        quantity?: number
        recipe: {
          id: string
          Recipe: string
          whiskeyType: string
        }
      }>
    }
  }>
} 