import { useState, useEffect } from 'react'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { gql } from '@apollo/client'

export interface Recipe {
  id: string
  name: string
  whiskeyType: string
  customer: string
  customerCode: string
  revision: number
  active: boolean
  mashBill?: string
  cooksPerFermenter?: number
  description?: string
  version?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}

interface GraphQLCustomer {
  id: string
  name: string
  customerCode: string
}

interface GraphQLRecipe {
  id: string
  Recipe: string
  active: boolean
  whiskeyType: string
  revision: number
  customerCode: string
  cooksPerFerm: number
  createdAt: string
  updatedAt: string
  customer: GraphQLCustomer
}

interface UseRecipesResult {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  searchRecipes: (searchTerm: string) => void
  refetch: () => void
}

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

// Define the GraphQL query
const GET_RECIPES_QUERY = gql`
  query GetRecipesWithFilters(
    $recipeSearch: String
    $customerCodeSearch: String
    $whiskeyType: EnumRecipeWhiskeyType
    $active: Boolean
    $limit: Float
  ) {
    recipes(
      where: {
        Recipe: { contains: $recipeSearch, mode: Insensitive }
        customerCode: { contains: $customerCodeSearch, mode: Insensitive }
        whiskeyType: $whiskeyType
        active: { equals: $active }
      }
      take: $limit
      orderBy: { Recipe: Asc }
    ) {
      id
      Recipe
      active
      whiskeyType
      revision
      customerCode
      cooksPerFerm
      createdAt
      updatedAt
      customer {
        id
        name
        customerCode
      }
    }
  }
`

export function useRecipes(): UseRecipesResult {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecipes = async (searchTerm: string = '') => {
    setLoading(true)
    setError(null)

    try {
      const variables = {
        recipeSearch: searchTerm || undefined,
        customerCodeSearch: undefined,
        whiskeyType: undefined,
        active: true, // Only fetch active recipes by default
        limit: 50
      }

      // Use the authenticated GraphQL client
      const result = await graphqlClient.query<{ recipes: GraphQLRecipe[] }>(
        GET_RECIPES_QUERY,
        {
          variables,
          fetchPolicy: 'cache-first'
        }
      )

      // Transform the data to match our Recipe interface
      const transformedRecipes: Recipe[] = (result.recipes || []).map((recipe: GraphQLRecipe) => ({
        id: recipe.id,
        name: recipe.Recipe,
        whiskeyType: recipe.whiskeyType || 'Unknown',
        customer: recipe.customer?.name || recipe.customerCode || 'Unknown',
        customerCode: recipe.customerCode,
        revision: recipe.revision || 1,
        active: recipe.active ?? true,
        mashBill: recipe.customerCode, // Using customerCode as mashBill for now
        cooksPerFermenter: recipe.cooksPerFerm || 3,
        status: recipe.active ? 'Active' : 'Inactive',
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt
      }))

      setRecipes(transformedRecipes)
    } catch (err) {
      console.error('Error fetching recipes:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch recipes')
      
      // Fallback to mock data if GraphQL fails
      const mockRecipes: Recipe[] = [
        {
          id: '1',
          name: 'BHK-75-21-04-00-R1',
          whiskeyType: 'Straight Bourbon',
          customer: 'BHK',
          customerCode: 'BHK',
          revision: 1,
          active: true,
          mashBill: '75-21-04-00',
          cooksPerFermenter: 3
        },
        {
          id: '2', 
          name: 'PAW-80-16-04-00-R2',
          whiskeyType: 'Wheat Bourbon',
          customer: 'PAW',
          customerCode: 'PAW',
          revision: 2,
          active: true,
          mashBill: '80-16-04-00',
          cooksPerFermenter: 2
        },
        {
          id: '3',
          name: 'HNW-95-05-00-00-R1',
          whiskeyType: 'Straight Rye',
          customer: 'HNW', 
          customerCode: 'HNW',
          revision: 1,
          active: false,
          mashBill: '95-05-00-00',
          cooksPerFermenter: 4
        }
      ]
      
      setRecipes(mockRecipes)
    } finally {
      setLoading(false)
    }
  }

  const searchRecipes = (searchTerm: string) => {
    fetchRecipes(searchTerm)
  }

  const refetch = () => {
    fetchRecipes()
  }

  useEffect(() => {
    fetchRecipes()
  }, [])

  return {
    recipes,
    loading,
    error,
    searchRecipes,
    refetch
  }
} 