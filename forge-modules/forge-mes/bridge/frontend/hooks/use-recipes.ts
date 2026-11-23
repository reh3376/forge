'use client'

import { useState, useCallback, useEffect } from 'react'
import { 
  unifiedRecipeClient,
  type PaginationParams, 
  type RecipeFilter,
  type PaginatedRecipesResult
} from '@/lib/api/unified-recipe-client'
import type { Recipe } from '@/types'

export function useRecipes() {
  const [data, setData] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await unifiedRecipeClient.getRecipes()
      setData(result.recipes)
    } catch (err) {
      console.error('Error fetching recipes:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch recipes'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  return {
    recipes: data,
    loading,
    error,
    refetch: fetchRecipes,
  }
}

export function usePaginatedRecipes(
  initialPagination: PaginationParams = { skip: 0, take: 10 },
  initialFilter?: RecipeFilter
) {
  const [pagination, setPagination] = useState<PaginationParams>(initialPagination)
  const [filter, setFilter] = useState<RecipeFilter | undefined>(initialFilter)
  const [data, setData] = useState<PaginatedRecipesResult>({
    recipes: [],
    totalCount: 0,
    hasNextPage: false,
    hasPreviousPage: false
  })
  const [loading, setLoading] = useState(true) // Start with loading true
  const [error, setError] = useState<Error | null>(null)

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('🔄 Fetching recipes with unified client:', { pagination, filter })
      const result = await unifiedRecipeClient.getRecipes(pagination, filter)
      console.log('✅ Unified client recipes fetch result:', result)
      setData(result)
    } catch (err) {
      console.error('🔥 Error in fetchRecipes with unified client:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch recipes'))
    } finally {
      setLoading(false)
    }
  }, [pagination.skip, pagination.take, JSON.stringify(filter)])

  // Auto-fetch when pagination or filter changes
  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  const goToPage = useCallback((page: number) => {
    setPagination(prev => {
      const { take = 10 } = prev
      return {
        ...prev,
        skip: page * take
      }
    })
  }, [])

  const nextPage = useCallback(() => {
    setPagination(prev => {
      const { skip = 0, take = 10 } = prev
      return {
        ...prev,
        skip: skip + take
      }
    })
  }, [])

  const previousPage = useCallback(() => {
    setPagination(prev => {
      const { skip = 0, take = 10 } = prev
      return {
        ...prev,
        skip: Math.max(0, skip - take)
      }
    })
  }, [])

  const updateFilter = useCallback((newFilter: RecipeFilter | undefined) => {
    setFilter(newFilter)
    setPagination(prev => ({ ...prev, skip: 0 })) // Reset to first page when filtering
  }, [])

  const updatePageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({
      ...prev,
      take: pageSize,
      skip: 0 // Reset to first page when changing page size
    }))
  }, [])

  // Calculate current page
  const currentPage = Math.floor((pagination.skip || 0) / (pagination.take || 10))
  const totalPages = Math.ceil(data.totalCount / (pagination.take || 10))

  return {
    ...data,
    loading,
    error,
    pagination,
    currentPage,
    totalPages,
    fetchRecipes,
    goToPage,
    nextPage,
    previousPage,
    updateFilter,
    updatePageSize,
    refetch: fetchRecipes
  }
}

export function useRecipe(id: string) {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchRecipe = useCallback(async () => {
    if (!id) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await unifiedRecipeClient.getRecipe(id)
      setRecipe(result)
    } catch (err) {
      console.error('Error fetching recipe:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch recipe'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchRecipe()
  }, [fetchRecipe])

  return {
    recipe,
    loading,
    error,
    refetch: fetchRecipe,
  }
}

// Helper function to format recipe display name
export function formatRecipeDisplayName(recipe: Recipe): string {
  return recipe.Recipe || `Recipe ${recipe.id.slice(-8)}`
}

// Helper function to get recipe status display
export function getRecipeStatusDisplay(recipe: Recipe): {
  label: string
  color: 'green' | 'yellow' | 'red' | 'gray'
} {
  if (recipe.active) {
    return { label: 'Active', color: 'green' }
  }
  return { label: 'Inactive', color: 'gray' }
}

// Helper function to format whiskey type for display
export function formatWhiskeyType(whiskeyType?: string): string {
  if (!whiskeyType) return 'Unknown'
  
  // Convert enum values to readable format
  const typeMap: Record<string, string> = {
    'RyeBourbon': 'Rye Bourbon',
    'RyeWhiskey': 'Rye Whiskey',
    'WheatBourbon': 'Wheat Bourbon',
    'Bourbon': 'Bourbon',
    'Whiskey': 'Whiskey',
  }
  
  return typeMap[whiskeyType] || whiskeyType
} 