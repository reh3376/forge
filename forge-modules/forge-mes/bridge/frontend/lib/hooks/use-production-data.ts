import { useQuery, useMutation } from '@tanstack/react-query'
import { queryKeys, invalidateQueries, handleQueryError } from '@/lib/api/query-client'
import { restApi, apiUtils } from '@/lib/api/rest-client'
import { useProductionStore } from '@/stores/production-store'
import type { Recipe, ProductionOrder, Batch, EquipmentStatus } from '@/stores/production-store'

// Recipe hooks
export function useRecipes(filter?: { status?: string; customer?: string }) {
  const setRecipes = useProductionStore(state => state.setRecipes)
  const setLoading = useProductionStore(state => state.setLoading)
  const setError = useProductionStore(state => state.setError)

  return useQuery({
    queryKey: filter ? [...queryKeys.recipes, filter] : queryKeys.recipes,
    queryFn: async () => {
      try {
        setLoading('recipes', true)
        const response = await restApi.recipes.getAll()
        const recipes = response.data.data
        setRecipes(recipes)
        setError('recipes', null)
        return recipes
      } catch (error) {
        const apiError = apiUtils.handleError(error)
        setError('recipes', apiError.message)
        handleQueryError(error, 'useRecipes')
        throw error
      } finally {
        setLoading('recipes', false)
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for recipes
  })
}

export function useRecipe(id: string) {
  const selectRecipe = useProductionStore(state => state.selectRecipe)

  return useQuery({
    queryKey: queryKeys.recipe(id),
    queryFn: async () => {
      try {
        const response = await restApi.recipes.getById(id)
        const recipe = response.data.data
        selectRecipe(recipe)
        return recipe
      } catch (error) {
        handleQueryError(error, 'useRecipe')
        throw error
      }
    },
    enabled: !!id,
  })
}

export function useCreateRecipe() {
  const addRecipe = useProductionStore(state => state.addRecipe)

  return useMutation({
    mutationFn: async (recipeData: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => {
      const response = await restApi.recipes.create(recipeData)
      return response.data.data
    },
    onSuccess: (newRecipe) => {
      addRecipe(newRecipe)
      invalidateQueries.allRecipes()
    },
    onError: (error) => {
      handleQueryError(error, 'useCreateRecipe')
    },
  })
}

export function useUpdateRecipe() {
  const updateRecipe = useProductionStore(state => state.updateRecipe)

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Recipe> }) => {
      const response = await restApi.recipes.update(id, updates)
      return response.data.data
    },
    onSuccess: (updatedRecipe) => {
      updateRecipe(updatedRecipe.id, updatedRecipe)
      invalidateQueries.recipe(updatedRecipe.id)
      invalidateQueries.allRecipes()
    },
    onError: (error) => {
      handleQueryError(error, 'useUpdateRecipe')
    },
  })
}

// Production Order hooks
export function useProductionOrders(filter?: { 
  status?: string; 
  startDate?: string; 
  endDate?: string 
}) {
  const setProductionOrders = useProductionStore(state => state.setProductionOrders)
  const setLoading = useProductionStore(state => state.setLoading)
  const setError = useProductionStore(state => state.setError)

  return useQuery({
    queryKey: filter ? [...queryKeys.productionOrders, filter] : queryKeys.productionOrders,
    queryFn: async () => {
      try {
        setLoading('orders', true)
        const response = await restApi.productionOrders.getAll(filter)
        const orders = response.data.data
        setProductionOrders(orders)
        setError('orders', null)
        return orders
      } catch (error) {
        const apiError = apiUtils.handleError(error)
        setError('orders', apiError.message)
        handleQueryError(error, 'useProductionOrders')
        throw error
      } finally {
        setLoading('orders', false)
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes for production orders
  })
}

export function useCreateProductionOrder() {
  const addProductionOrder = useProductionStore(state => state.addProductionOrder)

  return useMutation({
    mutationFn: async (orderData: Omit<ProductionOrder, 'id' | 'createdAt' | 'updatedAt'>) => {
      const response = await restApi.productionOrders.create(orderData)
      return response.data.data
    },
    onSuccess: (newOrder) => {
      addProductionOrder(newOrder)
      invalidateQueries.allProductionOrders()
    },
    onError: (error) => {
      handleQueryError(error, 'useCreateProductionOrder')
    },
  })
}

export function useUpdateProductionOrderStatus() {
  const updateProductionOrder = useProductionStore(state => state.updateProductionOrder)

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await restApi.productionOrders.updateStatus(id, status)
      return response.data.data
    },
    onSuccess: (updatedOrder) => {
      updateProductionOrder(updatedOrder.id, { status: updatedOrder.status })
      invalidateQueries.productionOrder(updatedOrder.id)
      invalidateQueries.allProductionOrders()
    },
    onError: (error) => {
      handleQueryError(error, 'useUpdateProductionOrderStatus')
    },
  })
}

// Batch hooks
export function useBatches(filter?: { 
  status?: string; 
  recipeId?: string; 
  productionOrderId?: string 
}) {
  const setBatches = useProductionStore(state => state.setBatches)
  const setLoading = useProductionStore(state => state.setLoading)
  const setError = useProductionStore(state => state.setError)

  return useQuery({
    queryKey: filter ? [...queryKeys.batches, filter] : queryKeys.batches,
    queryFn: async () => {
      try {
        setLoading('batches', true)
        const response = await restApi.batches.getAll(filter)
        const batches = response.data.data
        setBatches(batches)
        setError('batches', null)
        return batches
      } catch (error) {
        const apiError = apiUtils.handleError(error)
        setError('batches', apiError.message)
        handleQueryError(error, 'useBatches')
        throw error
      } finally {
        setLoading('batches', false)
      }
    },
    staleTime: 30 * 1000, // 30 seconds for batch data
  })
}

export function useActiveBatches() {
  return useQuery({
    queryKey: queryKeys.activeBatches,
    queryFn: async () => {
      const response = await restApi.batches.getActiveBatches()
      return response.data.data
    },
    staleTime: 30 * 1000, // 30 seconds for active batches
    refetchInterval: 60 * 1000, // Refetch every minute
  })
}

export function useUpdateBatchStatus() {
  const updateBatchStatus = useProductionStore(state => state.updateBatchStatus)

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Batch['status'] }) => {
      const response = await restApi.batches.updateStatus(id, status)
      return response.data.data
    },
    onSuccess: (updatedBatch) => {
      updateBatchStatus(updatedBatch.id, updatedBatch.status)
      invalidateQueries.batch(updatedBatch.id)
      invalidateQueries.allBatches()
    },
    onError: (error) => {
      handleQueryError(error, 'useUpdateBatchStatus')
    },
  })
}

// Equipment hooks
export function useEquipmentStatus() {
  const setEquipment = useProductionStore(state => state.setEquipment)
  const setLoading = useProductionStore(state => state.setLoading)
  const setError = useProductionStore(state => state.setError)

  return useQuery({
    queryKey: queryKeys.allEquipmentStatus,
    queryFn: async () => {
      try {
        setLoading('equipment', true)
        const response = await restApi.equipment.getAllStatus()
        const equipment = response.data.data
        setEquipment(equipment)
        setError('equipment', null)
        return equipment
      } catch (error) {
        const apiError = apiUtils.handleError(error)
        setError('equipment', apiError.message)
        handleQueryError(error, 'useEquipmentStatus')
        throw error
      } finally {
        setLoading('equipment', false)
      }
    },
    staleTime: 10 * 1000, // 10 seconds for equipment status
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  })
}

export function useUpdateEquipmentStatus() {
  const updateEquipmentStatus = useProductionStore(state => state.updateEquipmentStatus)

  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      data 
    }: { 
      id: string; 
      status: EquipmentStatus['status']; 
      data?: Partial<EquipmentStatus> 
    }) => {
      const response = await restApi.equipment.updateStatus(id, status, data)
      return response.data.data
    },
    onSuccess: (updatedEquipment) => {
      updateEquipmentStatus(
        updatedEquipment.id, 
        updatedEquipment.status, 
        updatedEquipment
      )
      invalidateQueries.equipmentStatus(updatedEquipment.id)
      invalidateQueries.allEquipment()
    },
    onError: (error) => {
      handleQueryError(error, 'useUpdateEquipmentStatus')
    },
  })
}

// Real-time data hooks
export function useLiveMetrics() {
  return useQuery({
    queryKey: queryKeys.liveMetrics,
    queryFn: async () => {
      const response = await restApi.realtime.getLiveMetrics()
      return response.data.data
    },
    staleTime: 0, // Always fresh
    refetchInterval: 5 * 1000, // Refetch every 5 seconds
  })
}

export function useEquipmentMetrics(equipmentId: string) {
  return useQuery({
    queryKey: queryKeys.liveEquipmentData(equipmentId),
    queryFn: async () => {
      const response = await restApi.realtime.getEquipmentData(equipmentId)
      return response.data.data
    },
    enabled: !!equipmentId,
    staleTime: 0, // Always fresh
    refetchInterval: 10 * 1000, // Refetch every 10 seconds
  })
} 