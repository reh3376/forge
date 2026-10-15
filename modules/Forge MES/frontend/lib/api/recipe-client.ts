import { unifiedGraphQLClient } from './unified-graphql-client'
import { gql } from '@apollo/client'

// Types matching the actual GraphQL schema
export interface Recipe {
  id: string
  Recipe: string // Backend uses capital R for recipe name
  active?: boolean
  whiskeyType?: string
  customerCode?: string
  cooksPerFerm?: number
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
  recipeBoms?: RecipeBom[]
  parameters?: RecipeParameter[]
  customer?: Customer
  revision?: number
  mashingProtocol?: MashingProtocol
}

export interface Customer {
  id: string
  name?: string
  customerCode?: string
}

export interface RecipeBom {
  id: string
  revision?: string
  master?: boolean
  running?: boolean
  createdAt: string
  updatedAt: string
  recipeBomITem: RecipeBomItem[]
}

export interface RecipeBomItem {
  id: string
  quantity?: number
  operation?: string
  item?: Item
  displayUnits?: Units
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
}

export interface Item {
  id: string
  itemName?: string
  itemNumber?: string
  itemDescription?: string
  itemType?: string
  itemClass?: string
  itemGroup?: string
}

export interface Units {
  id: string
  name?: string
  abbreviation?: string
}

export interface RecipeParameter {
  id: string
  recipeParamName: string
  recipeParamDescription?: string
  description?: string
  className: string
  active: boolean
  required?: boolean
  recipeSetpointType?: string
  recipeNumericalSetpoint?: number
  recipeSetpointBooleanValue?: boolean
  recipeSetpointLowerLimit?: number
  recipeSetpointUpperLimit?: number
  units?: Units
  operation?: Operation
  revision?: number
  createdAt: string
  updatedAt?: string
  createdBy: string
  updatedBy?: string
}

export interface Operation {
  id: string
  name?: string
}

export interface MashingProtocol {
  id: string
  name: string
  isTemplate?: boolean
  templateCategory?: string
  templateDescription?: string
  master?: boolean
  running?: boolean
  revision?: string
  steps: MashingProtocolStep[]
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
}

export interface MashingProtocolStep {
  id: string
  index?: number
  stepType?: string
  holdType?: string
  stepTime?: number
  temperatureSetpoint?: number
  temperatureActual?: number
  heatEnabled?: boolean
  heatTempSp?: number
  coolEnabled?: boolean
  coolTempSp?: number
  agitatorEnabled?: boolean
  agitatorSpdSp?: number
  promptMessage?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
  recipeBomItem: RecipeBomItem[]
}

export interface CreateRecipeInput {
  Recipe: string
  active?: boolean
  whiskeyType?: string
  customerCode?: string
  cooksPerFerm?: number
  // Add other fields as needed for creation
}

export interface UpdateRecipeInput {
  Recipe?: string
  active?: boolean
  whiskeyType?: string
  customerCode?: string
  cooksPerFerm?: number
  // Add other fields as needed for updates
}

export interface PaginationParams {
  skip?: number
  take?: number
}

export interface RecipeFilter {
  active?: boolean
  customerCode?: string
  whiskeyType?: string
  Recipe?: {
    contains?: string
    mode?: 'Insensitive'
  }
}

export interface PaginatedRecipesResult {
  recipes: Recipe[]
  totalCount: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// New interfaces for dedicated recipe creation endpoints
export interface CreateCookInput {
  scheduleOrderQueueId: string
  username: string
  mashingProtocolData?: Record<string, unknown>
}

export interface CreateCookResponse {
  success: boolean
  message?: string
  data?: Record<string, unknown>
}

export interface GenerateRecipeInput {
  customerCode: string
  mashBill: string
  finalProof: number
  barrelInfo: string
  customerName: string
  orderQty: number
  totalGrainWeight: number
  bblsPerFerm: number
  username: string
  waterQty: number
  backsetQty: number
  bblItemNumbers: string[]
  yeastItemNumbersQtys: { [key: string]: number }
  mashingProtocol: Record<string, unknown>[]
  recipeParameters: { name: string; setpointValue: number }[]
  binAssignments: { [key: string]: string }
}

export interface GenerateRecipeResponse {
  success: boolean
  message: string
}

export interface GenerateRecipeBomInput {
  recipeString: string
  saccharificationEnzymeId: string
  liquifactionEnzymeId: string
  viscosityEnzymeId: string
  yeastItemId: string
  yeastPoundsPerFermenter: number
  username: string
  totalGrainWeight?: number
}

export interface RecipeBomItemResponse {
  itemId: string
  itemNumber: string
  itemName: string
  quantity: number
  operation: string
}

export interface GenerateRecipeBomResponse {
  id: string
  revision: string
  items: RecipeBomItemResponse[]
}

// GraphQL Queries
export const GET_RECIPES = gql`
  query GetRecipes($skip: Float, $take: Float, $filter: RecipeWhereInput) {
    recipes(skip: $skip, take: $take, where: $filter) {
      id
      Recipe
      active
      whiskeyType
      revision
      customerCode
      cooksPerFerm
      createdAt
      updatedAt
      createdBy
      updatedBy
      customer {
        id
        name
        customerCode
      }
      recipeBoms {
        id
        revision
        master
        running
        createdAt
        updatedAt
        recipeBomITem {
          id
          quantity
          operation
          createdAt
          updatedAt
          createdBy
          item {
            id
            itemName
          }
          displayUnits {
            id
            name
            abbreviation
          }
        }
      }
      parameters {
        id
        recipeParamName
        recipeParamDescription
        description
        className
        active
        required
        recipeSetpointType
        recipeNumericalSetpoint
        recipeSetpointBooleanValue
        recipeSetpointLowerLimit
        recipeSetpointUpperLimit
        revision
        createdAt
        updatedAt
        createdBy
        units {
          id
          name
          abbreviation
        }
        operation {
          id
          name
        }
      }
      mashingProtocol {
        id
        name
        isTemplate
        templateCategory
        templateDescription
        master
        running
        revision
        createdAt
        updatedAt
        createdBy
        steps {
          id
          index
          stepType
          holdType
          stepTime
          temperatureSetpoint
          temperatureActual
          heatEnabled
          heatTempSp
          coolEnabled
          coolTempSp
          agitatorEnabled
          agitatorSpdSp
          promptMessage
          createdAt
          updatedAt
          createdBy
          recipeBomItem {
            id
            item {
              id
              itemName
              itemNumber
              itemType
              itemClass
              itemGroup
            }
            quantity
            displayUnits {
              id
              name
            }
            operation
          }
        }
      }
    }
  }
`

// Note: Since recipesAggregate is not available in the schema,
// we'll fetch a larger batch to estimate total count
export const GET_RECIPES_COUNT = gql`
  query GetRecipesCount($filter: RecipeWhereInput) {
    recipes(where: $filter, take: 1000) {
      id
    }
  }
`

export const GET_RECIPE = gql`
  query GetRecipe($id: String!) {
    recipe(where: { id: $id }) {
      id
      Recipe
      active
      whiskeyType
      revision
      customerCode
      cooksPerFerm
      createdAt
      updatedAt
      createdBy
      updatedBy
      customer {
        id
        name
        customerCode
      }
      recipeBoms {
        id
        revision
        master
        running
        createdAt
        updatedAt
        recipeBomITem {
          id
          quantity
          operation
          createdAt
          updatedAt
          createdBy
          item {
            id
            itemName
          }
          displayUnits {
            id
            name
            abbreviation
          }
        }
      }
      parameters {
        id
        recipeParamName
        recipeParamDescription
        description
        className
        active
        required
        recipeSetpointType
        recipeNumericalSetpoint
        recipeSetpointBooleanValue
        recipeSetpointLowerLimit
        recipeSetpointUpperLimit
        revision
        createdAt
        updatedAt
        createdBy
        units {
          id
          name
          abbreviation
        }
        operation {
          id
          name
        }
      }
      mashingProtocol {
        id
        name
        isTemplate
        templateCategory
        templateDescription
        master
        running
        revision
        createdAt
        updatedAt
        createdBy
        steps {
          id
          index
          stepType
          holdType
          stepTime
          temperatureSetpoint
          temperatureActual
          heatEnabled
          heatTempSp
          coolEnabled
          coolTempSp
          agitatorEnabled
          agitatorSpdSp
          promptMessage
          createdAt
          updatedAt
          createdBy
          recipeBomItem {
            id
            item {
              id
              itemName
              itemNumber
              itemType
              itemClass
              itemGroup
            }
            quantity
            displayUnits {
              id
              name
            }
            operation
          }
        }
      }
    }
  }
`

export const CREATE_RECIPE = gql`
  mutation CreateRecipe($data: RecipeCreateInput!) {
    createRecipe(data: $data) {
      id
      Recipe
      active
      whiskeyType
      revision
      createdAt
      createdBy
    }
  }
`

export const UPDATE_RECIPE = gql`
  mutation UpdateRecipe($where: RecipeWhereUniqueInput!, $data: RecipeUpdateInput!) {
    updateRecipe(where: $where, data: $data) {
      id
      Recipe
      active
      whiskeyType
      revision
      updatedAt
      updatedBy
    }
  }
`

export const DELETE_RECIPE = gql`
  mutation DeleteRecipe($where: RecipeWhereUniqueInput!) {
    deleteRecipe(where: $where) {
      id
      Recipe
    }
  }
`

// New dedicated recipe creation mutations
export const CREATE_NEW_COOK = gql`
  mutation CreateNewCook($input: CreateCookInput!) {
    createNewCook(input: $input) {
      success
      message
      data
    }
  }
`

export const GENERATE_RECIPE = gql`
  mutation GenerateRecipe($input: GenerateRecipeInput!) {
    generateRecipe(input: $input) {
      success
      message
    }
  }
`

export const GENERATE_RECIPE_BOM = gql`
  mutation GenerateRecipeBom($input: GenerateRecipeBomInput!) {
    generateRecipeBom(input: $input) {
      id
      revision
      items {
        itemId
        itemNumber
        itemName
        quantity
        operation
      }
    }
  }
`

export const GET_ACTIVE_RECIPES = gql`
  query GetActiveRecipes {
    getActiveRecipes {
      id
      Recipe
      active
      whiskeyType
      customerCode
      cooksPerFerm
      createdAt
      updatedAt
      createdBy
      customer {
        id
        name
        customerCode
      }
    }
  }
`

// Recipe API functions
export class RecipeClient {
  async getRecipes(
    pagination?: PaginationParams,
    filter?: RecipeFilter
  ): Promise<PaginatedRecipesResult> {
    try {
      const skip = pagination?.skip || 0
      const take = pagination?.take || 10

      // Get recipes and total count in parallel
      const [recipesResult, countResult] = await Promise.all([
        unifiedGraphQLClient.query<{ recipes: Recipe[] }>(GET_RECIPES, {
          variables: { skip, take, filter },
          fetchPolicy: 'cache-first'
        }),
        unifiedGraphQLClient.query<{ recipes: Recipe[] }>(GET_RECIPES_COUNT, {
          variables: { filter },
          fetchPolicy: 'cache-first'
        })
      ])

      const recipes = recipesResult.recipes || []
      const totalCount = countResult.recipes?.length || 0

      return {
        recipes,
        totalCount,
        hasNextPage: skip + take < totalCount,
        hasPreviousPage: skip > 0,
      }
    } catch (error) {
      console.error('Error fetching recipes:', error)
      throw error
    }
  }

  // Legacy method for backward compatibility
  async getRecipesLegacy(filter?: { active?: boolean; customerCode?: string; whiskeyType?: string }) {
    const { recipes } = await this.getRecipes({ skip: 0, take: 1000 }, filter)
    return recipes
  }

  async getRecipe(id: string) {
    const data = await unifiedGraphQLClient.query<{ recipe: Recipe }>(GET_RECIPE, {
      variables: { id }
    })
    return data.recipe
  }

  async createRecipe(input: CreateRecipeInput) {
    const data = await unifiedGraphQLClient.mutate<{ createRecipe: Recipe }>(CREATE_RECIPE, {
      variables: { data: input },
      refetchQueries: [{ query: GET_RECIPES, variables: {} }]
    })
    return data.createRecipe
  }

  async updateRecipe(id: string, input: UpdateRecipeInput) {
    const data = await unifiedGraphQLClient.mutate<{ updateRecipe: Recipe }>(UPDATE_RECIPE, {
      variables: { 
        where: { id },
        data: input 
      },
      refetchQueries: [{ query: GET_RECIPES, variables: {} }, { query: GET_RECIPE, variables: { id } }]
    })
    return data.updateRecipe
  }

  async deleteRecipe(id: string) {
    const data = await unifiedGraphQLClient.mutate<{ deleteRecipe: Recipe }>(DELETE_RECIPE, {
      variables: { where: { id } },
      refetchQueries: [{ query: GET_RECIPES, variables: {} }]
    })
    return data.deleteRecipe
  }

  // New dedicated recipe creation methods
  async createNewCook(input: CreateCookInput): Promise<CreateCookResponse> {
    const data = await unifiedGraphQLClient.mutate<{ createNewCook: CreateCookResponse }>(CREATE_NEW_COOK, {
      variables: { input }
    })
    return data.createNewCook
  }

  async generateRecipe(input: GenerateRecipeInput): Promise<GenerateRecipeResponse> {
    const data = await unifiedGraphQLClient.mutate<{ generateRecipe: GenerateRecipeResponse }>(GENERATE_RECIPE, {
      variables: { input },
      refetchQueries: [{ query: GET_RECIPES, variables: {} }]
    })
    return data.generateRecipe
  }

  async generateRecipeBom(input: GenerateRecipeBomInput): Promise<GenerateRecipeBomResponse> {
    const data = await unifiedGraphQLClient.mutate<{ generateRecipeBom: GenerateRecipeBomResponse }>(GENERATE_RECIPE_BOM, {
      variables: { input }
    })
    return data.generateRecipeBom
  }

  async getActiveRecipes(): Promise<Recipe[]> {
    const data = await unifiedGraphQLClient.query<{ recipes: Recipe[] }>(GET_ACTIVE_RECIPES, {
      fetchPolicy: 'cache-first'
    })
    return data.recipes || []
  }
}

export const recipeClient = new RecipeClient() 