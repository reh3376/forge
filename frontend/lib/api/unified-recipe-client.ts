import { unifiedGraphQLClient } from './unified-graphql-client'
import { RECIPE_QUERIES, RECIPE_MUTATIONS } from './graphql-queries'
import type { Recipe } from '../../types'

// Input types for recipe operations
export interface CreateRecipeInput {
  Recipe: string
  active?: boolean
  whiskeyType?: string
  customerCode?: string
  cooksPerFerm?: number
}

export interface UpdateRecipeInput {
  Recipe?: string
  active?: boolean
  whiskeyType?: string
  customerCode?: string
  cooksPerFerm?: number
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

// Dedicated recipe creation interfaces
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

/**
 * Unified Recipe Client
 * 
 * This class consolidates all recipe-related GraphQL operations
 * using the unified GraphQL client with proper JWT authentication.
 */
export class UnifiedRecipeClient {
  private client = unifiedGraphQLClient

  /**
   * Get recipes with pagination and filtering
   */
  async getRecipes(
    pagination?: PaginationParams,
    filter?: RecipeFilter
  ): Promise<PaginatedRecipesResult> {
    const { skip = 0, take = 10 } = pagination || {}
    
    try {
      // Get recipes and total count in parallel
      const [recipesResult, countResult] = await Promise.all([
        this.client.query<{ recipes: Recipe[] }>(RECIPE_QUERIES.GET_RECIPES, {
          variables: { skip, take, filter },
          fetchPolicy: 'network-only'  // Force fresh data to get displayUnits
        }),
        this.client.query<{ recipes: Recipe[] }>(RECIPE_QUERIES.GET_RECIPES_COUNT, {
          variables: { filter },
          fetchPolicy: 'network-only'  // Force fresh data
        })
      ])

      // DEBUG: Log the raw results to see what we're getting
      console.log('🔍 DEBUG recipesResult:', recipesResult)
      console.log('🔍 DEBUG recipesResult type:', typeof recipesResult)
      console.log('🔍 DEBUG recipesResult keys:', recipesResult ? Object.keys(recipesResult) : 'null')
      console.log('🔍 DEBUG countResult:', countResult)

      const recipes = recipesResult?.recipes || []
      const countRecipes = countResult?.recipes || []

      console.log('🔍 DEBUG recipes array length:', recipes.length)
      console.log('🔍 DEBUG countRecipes array length:', countRecipes.length)

      // DEBUG: Log raw recipe data to check displayUnits
      if (recipes.length > 0) {
        console.log('🔍 RAW RECIPE DATA from GraphQL:', JSON.stringify(recipes[0], null, 2))
        if (recipes[0].recipeBoms && recipes[0].recipeBoms[0]?.recipeBomITem) {
          console.log('🔍 FIRST BOM ITEM from GraphQL:', JSON.stringify(recipes[0].recipeBoms[0].recipeBomITem[0], null, 2))
        }
      } else {
        console.log('🔍 DEBUG: No recipes returned! recipesResult.recipes is:', recipesResult?.recipes)
      }

      // If we got exactly 1000 recipes, there might be more, so this is an estimate
      // Otherwise, we have the exact count
      const totalCount = countRecipes.length === 1000 ? 1000 : countRecipes.length

      console.log('📊 Recipe pagination:', {
        skip,
        take,
        recipesReturned: recipes.length,
        totalCount,
        filter
      })
      
      return {
        recipes,
        totalCount,
        hasNextPage: skip + take < totalCount,
        hasPreviousPage: skip > 0
      }
    } catch (error) {
      console.error('🔥 Error fetching recipes:', error)
      return {
        recipes: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false
      }
    }
  }

  /**
   * Get a single recipe by ID
   */
  async getRecipe(id: string): Promise<Recipe | null> {
    try {
      const result = await this.client.query<{ recipe: Recipe }>(RECIPE_QUERIES.GET_RECIPE, {
        variables: { id }
      })
      return result.recipe || null
    } catch (error) {
      console.error('🔥 Error fetching recipe:', error)
      return null
    }
  }

  /**
   * Get recipes by customer and mash bill pattern
   */
  async getRecipesByCustomerMashBill(customerCode: string, mashBillPattern: string): Promise<Recipe[]> {
    try {
      const result = await this.client.query<{ recipes: Recipe[] }>(
        RECIPE_QUERIES.GET_RECIPES_BY_CUSTOMER_MASHBILL,
        {
          variables: { customerCode, mashBillPattern }
        }
      )
      return result.recipes || []
    } catch (error) {
      console.error('🔥 Error fetching recipes by customer/mashbill:', error)
      return []
    }
  }

  /**
   * Get recipe for basis (detailed recipe with all relationships)
   */
  async getRecipeForBasis(id: string): Promise<Recipe | null> {
    try {
      const result = await this.client.query<{ recipe: Recipe }>(RECIPE_QUERIES.GET_RECIPE_FOR_BASIS, {
        variables: { id }
      })
      return result.recipe || null
    } catch (error) {
      console.error('🔥 Error fetching recipe for basis:', error)
      return null
    }
  }

  /**
   * Get active recipes
   */
  async getActiveRecipes(): Promise<Recipe[]> {
    try {
      const result = await this.client.query<{ getActiveRecipes: Recipe[] }>(
        RECIPE_QUERIES.GET_ACTIVE_RECIPES,
        {
          fetchPolicy: 'cache-first'
        }
      )
      return result.getActiveRecipes || []
    } catch (error) {
      console.error('🔥 Error fetching active recipes:', error)
      return []
    }
  }

  /**
   * Create a new recipe
   */
  async createRecipe(input: CreateRecipeInput): Promise<Recipe | null> {
    try {
      const result = await this.client.mutate<{ createRecipe: Recipe }>(
        RECIPE_MUTATIONS.CREATE_RECIPE,
        {
          variables: { data: input },
          refetchQueries: [{ query: RECIPE_QUERIES.GET_RECIPES }]
        }
      )
      return result.createRecipe || null
    } catch (error) {
      console.error('🔥 Error creating recipe:', error)
      throw error
    }
  }

  /**
   * Update an existing recipe
   */
  async updateRecipe(id: string, input: UpdateRecipeInput): Promise<Recipe | null> {
    try {
      const result = await this.client.mutate<{ updateRecipe: Recipe }>(
        RECIPE_MUTATIONS.UPDATE_RECIPE,
        {
          variables: { 
            where: { id },
            data: input 
          },
          refetchQueries: [
            { query: RECIPE_QUERIES.GET_RECIPES },
            { query: RECIPE_QUERIES.GET_RECIPE, variables: { id } }
          ]
        }
      )
      return result.updateRecipe || null
    } catch (error) {
      console.error('🔥 Error updating recipe:', error)
      throw error
    }
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(id: string): Promise<Recipe | null> {
    try {
      const result = await this.client.mutate<{ deleteRecipe: Recipe }>(
        RECIPE_MUTATIONS.DELETE_RECIPE,
        {
          variables: { where: { id } },
          refetchQueries: [{ query: RECIPE_QUERIES.GET_RECIPES }]
        }
      )
      return result.deleteRecipe || null
    } catch (error) {
      console.error('🔥 Error deleting recipe:', error)
      throw error
    }
  }

  /**
   * Create a new cook
   */
  async createNewCook(input: CreateCookInput): Promise<CreateCookResponse> {
    try {
      const result = await this.client.mutate<{ createNewCook: CreateCookResponse }>(
        RECIPE_MUTATIONS.CREATE_NEW_COOK,
        {
          variables: { input }
        }
      )
      return result.createNewCook || { success: false, message: 'Unknown error' }
    } catch (error) {
      console.error('🔥 Error creating new cook:', error)
      throw error
    }
  }

  /**
   * Generate a recipe
   */
  async generateRecipe(input: GenerateRecipeInput): Promise<GenerateRecipeResponse> {
    try {
      const result = await this.client.mutate<{ generateRecipe: GenerateRecipeResponse }>(
        RECIPE_MUTATIONS.GENERATE_RECIPE,
        {
          variables: { input },
          refetchQueries: [{ query: RECIPE_QUERIES.GET_RECIPES }]
        }
      )
      return result.generateRecipe || { success: false, message: 'Unknown error' }
    } catch (error) {
      console.error('🔥 Error generating recipe:', error)
      throw error
    }
  }

  /**
   * Generate a recipe BOM
   */
  async generateRecipeBom(input: GenerateRecipeBomInput): Promise<GenerateRecipeBomResponse | null> {
    try {
      const result = await this.client.mutate<{ generateRecipeBom: GenerateRecipeBomResponse }>(
        RECIPE_MUTATIONS.GENERATE_RECIPE_BOM,
        {
          variables: { input }
        }
      )
      return result.generateRecipeBom || null
    } catch (error) {
      console.error('🔥 Error generating recipe BOM:', error)
      throw error
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async getRecipesLegacy(filter?: { active?: boolean; customerCode?: string; whiskeyType?: string }): Promise<Recipe[]> {
    const result = await this.getRecipes({ skip: 0, take: 10 }, filter)
    return result.recipes
  }
}

// Export singleton instance
export const unifiedRecipeClient = new UnifiedRecipeClient()

// Export for backward compatibility
export const recipeClient = unifiedRecipeClient 