import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { 
  unifiedRecipeClient, 
  type CreateRecipeInput, 
  type UpdateRecipeInput,
  type CreateCookInput,
  type GenerateRecipeInput,
  type GenerateRecipeBomInput,
  type RecipeFilter
} from '../api/unified-recipe-client'

// Query keys for React Query
export const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: (filter?: RecipeFilter) => 
    [...recipeKeys.lists(), filter] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: string) => [...recipeKeys.details(), id] as const,
}

// Hook to get all recipes with optional filtering
export function useRecipes(filter?: RecipeFilter) {
  return useQuery({
    queryKey: recipeKeys.list(filter),
    queryFn: async () => {
      const result = await unifiedRecipeClient.getRecipes(undefined, filter)
      return result.recipes
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook to get a single recipe by ID
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => unifiedRecipeClient.getRecipe(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook to create a new recipe
export function useCreateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateRecipeInput) => unifiedRecipeClient.createRecipe(input),
    onSuccess: (newRecipe) => {
      if (newRecipe) {
        // Invalidate and refetch recipes list
        queryClient.invalidateQueries({ queryKey: recipeKeys.lists() })
        
        // Add the new recipe to the cache
        queryClient.setQueryData(recipeKeys.detail(newRecipe.id), newRecipe)
        
        toast.success('Recipe created successfully!')
      }
    },
    onError: (error) => {
      console.error('Error creating recipe:', error)
      toast.error('Failed to create recipe. Please try again.')
    },
  })
}

// Hook to update an existing recipe
export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecipeInput }) => 
      unifiedRecipeClient.updateRecipe(id, input),
    onSuccess: (updatedRecipe, { id }) => {
      if (updatedRecipe) {
        // Invalidate and refetch recipes list
        queryClient.invalidateQueries({ queryKey: recipeKeys.lists() })
        
        // Update the specific recipe in cache
        queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) })
        
        toast.success('Recipe updated successfully!')
      }
    },
    onError: (error) => {
      console.error('Error updating recipe:', error)
      toast.error('Failed to update recipe. Please try again.')
    },
  })
}

// Hook to delete a recipe
export function useDeleteRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => unifiedRecipeClient.deleteRecipe(id),
    onSuccess: (deletedRecipe, id) => {
      if (deletedRecipe) {
        // Remove from recipes list cache
        queryClient.invalidateQueries({ queryKey: recipeKeys.lists() })
        
        // Remove the specific recipe from cache
        queryClient.removeQueries({ queryKey: recipeKeys.detail(id) })
        
        toast.success(`Recipe "${deletedRecipe.Recipe}" deleted successfully!`)
      }
    },
    onError: (error) => {
      console.error('Error deleting recipe:', error)
      toast.error('Failed to delete recipe. Please try again.')
    },
  })
}

// Hook to get recipes by active status
export function useRecipesByStatus(active: boolean) {
  return useRecipes({ active })
}

// Hook to get recipes by customer
export function useRecipesByCustomer(customerCode: string) {
  return useRecipes({ customerCode })
}

// Hook to get recipes by whiskey type
export function useRecipesByWhiskeyType(whiskeyType: string) {
  return useRecipes({ whiskeyType })
}

// New hooks for dedicated recipe creation endpoints
export function useCreateNewCook() {
  return useMutation({
    mutationFn: (input: CreateCookInput) => unifiedRecipeClient.createNewCook(input),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(response.message || 'Cook created successfully!')
      } else {
        toast.error(response.message || 'Failed to create cook')
      }
    },
    onError: (error) => {
      console.error('Error creating cook:', error)
      toast.error('Failed to create cook. Please try again.')
    },
  })
}

export function useGenerateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: GenerateRecipeInput) => unifiedRecipeClient.generateRecipe(input),
    onSuccess: (response) => {
      if (response.success) {
        // Invalidate recipes list to show the new generated recipe
        queryClient.invalidateQueries({ queryKey: recipeKeys.lists() })
        toast.success(response.message || 'Recipe generated successfully!')
      } else {
        toast.error(response.message || 'Failed to generate recipe')
      }
    },
    onError: (error) => {
      console.error('Error generating recipe:', error)
      toast.error('Failed to generate recipe. Please try again.')
    },
  })
}

export function useGenerateRecipeBom() {
  return useMutation({
    mutationFn: (input: GenerateRecipeBomInput) => unifiedRecipeClient.generateRecipeBom(input),
    onSuccess: (response) => {
      if (response) {
        toast.success(`Recipe BOM generated successfully! Revision: ${response.revision}`)
      }
    },
    onError: (error) => {
      console.error('Error generating recipe BOM:', error)
      toast.error('Failed to generate recipe BOM. Please try again.')
    },
  })
}

export function useActiveRecipes() {
  return useQuery({
    queryKey: ['recipes', 'active'],
    queryFn: () => unifiedRecipeClient.getActiveRecipes(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 