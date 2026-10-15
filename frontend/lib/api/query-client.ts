import { QueryClient } from '@tanstack/react-query'

// Create QueryClient with manufacturing-appropriate configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Manufacturing data should be fresh for safety
      staleTime: 30 * 1000, // 30 seconds
      refetchInterval: 60 * 1000, // Refetch every minute for real-time monitoring
      refetchOnWindowFocus: true, // Always refetch when operators return to window
      retry: 3, // Retry failed requests 3 times (important for factory floor networks)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 2, // Retry mutations twice for critical production operations
      retryDelay: 1000,
    },
  },
})

// Query keys for manufacturing data
export const queryKeys = {
  // Production data
  recipes: ['recipes'] as const,
  recipe: (id: string) => ['recipes', id] as const,
  recipeVersions: (id: string) => ['recipes', id, 'versions'] as const,
  
  // Production orders
  productionOrders: ['production-orders'] as const,
  productionOrder: (id: string) => ['production-orders', id] as const,
  productionOrdersByStatus: (status: string) => ['production-orders', 'status', status] as const,
  
  // Batches and production
  batches: ['batches'] as const,
  batch: (id: string) => ['batches', id] as const,
  batchesByStatus: (status: string) => ['batches', 'status', status] as const,
  activeBatches: ['batches', 'active'] as const,
  
  // Equipment and monitoring
  equipment: ['equipment'] as const,
  equipmentStatus: (id: string) => ['equipment', id, 'status'] as const,
  equipmentMetrics: (id: string) => ['equipment', id, 'metrics'] as const,
  allEquipmentStatus: ['equipment', 'status', 'all'] as const,
  
  // Quality control
  qualityMetrics: ['quality-metrics'] as const,
  qualityMetric: (batchId: string) => ['quality-metrics', 'batch', batchId] as const,
  qualityTests: (batchId: string) => ['quality-tests', 'batch', batchId] as const,
  
  // Scheduling
  productionSchedule: ['production-schedule'] as const,
  scheduleByDateRange: (startDate: string, endDate: string) => 
    ['production-schedule', 'range', startDate, endDate] as const,
  equipmentSchedule: (equipmentId: string) => 
    ['production-schedule', 'equipment', equipmentId] as const,
  
  // Bill of Materials
  billOfMaterials: ['bill-of-materials'] as const,
  bomForRecipe: (recipeId: string) => ['bill-of-materials', 'recipe', recipeId] as const,
  
  // Customers and orders
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  
  // Real-time monitoring
  liveMetrics: ['live-metrics'] as const,
  liveEquipmentData: (equipmentId: string) => ['live-metrics', 'equipment', equipmentId] as const,
  liveBatchData: (batchId: string) => ['live-metrics', 'batch', batchId] as const,
  
  // Reports and analytics
  productionReports: ['production-reports'] as const,
  productionReport: (reportId: string) => ['production-reports', reportId] as const,
  performanceMetrics: (dateRange: string) => ['performance-metrics', dateRange] as const,
  
  // User and permissions
  currentUser: ['current-user'] as const,
  userPermissions: ['user-permissions'] as const,
} as const

// Invalidation helpers
export const invalidateQueries = {
  allRecipes: () => queryClient.invalidateQueries({ queryKey: queryKeys.recipes }),
  recipe: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.recipe(id) }),
  
  allProductionOrders: () => queryClient.invalidateQueries({ queryKey: queryKeys.productionOrders }),
  productionOrder: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.productionOrder(id) }),
  
  allBatches: () => queryClient.invalidateQueries({ queryKey: queryKeys.batches }),
  batch: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.batch(id) }),
  
  allEquipment: () => queryClient.invalidateQueries({ queryKey: queryKeys.equipment }),
  equipmentStatus: (id?: string) => 
    id 
      ? queryClient.invalidateQueries({ queryKey: queryKeys.equipmentStatus(id) })
      : queryClient.invalidateQueries({ queryKey: queryKeys.allEquipmentStatus }),
  
  productionSchedule: () => queryClient.invalidateQueries({ queryKey: queryKeys.productionSchedule }),
  
  // Invalidate all real-time data
  allLiveMetrics: () => queryClient.invalidateQueries({ queryKey: queryKeys.liveMetrics }),
}

// Data prefetching helpers for common workflows
export const prefetchData = {
  // Prefetch data for production dashboard
  productionDashboard: async () => {
    await Promise.all([
      queryClient.prefetchQuery({ queryKey: queryKeys.activeBatches, staleTime: 30000 }),
      queryClient.prefetchQuery({ queryKey: queryKeys.allEquipmentStatus, staleTime: 30000 }),
      queryClient.prefetchQuery({ queryKey: queryKeys.productionOrders, staleTime: 60000 }),
    ])
  },
  
  // Prefetch data for recipe management
  recipeManagement: async () => {
    await Promise.all([
      queryClient.prefetchQuery({ queryKey: queryKeys.recipes, staleTime: 300000 }), // 5 minutes
      queryClient.prefetchQuery({ queryKey: queryKeys.customers, staleTime: 600000 }), // 10 minutes
    ])
  },
  
  // Prefetch data for production scheduling
  productionScheduling: async () => {
    const today = new Date().toISOString().split('T')[0]!
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    
    await Promise.all([
      queryClient.prefetchQuery({ 
        queryKey: queryKeys.scheduleByDateRange(today, nextWeek), 
        staleTime: 60000 
      }),
      queryClient.prefetchQuery({ queryKey: queryKeys.recipes, staleTime: 300000 }),
      queryClient.prefetchQuery({ queryKey: queryKeys.equipment, staleTime: 300000 }),
    ])
  },
}

// Error handling utilities
export const handleQueryError = (error: unknown, context: string) => {
  console.error(`Query error in ${context}:`, error)
  
  // TODO: Integrate with error reporting service
  // reportError(error, { context })
  
  // For now, just log the error
  if (error instanceof Error) {
    console.error(`Error message: ${error.message}`)
    console.error(`Error stack: ${error.stack}`)
  }
}

// Real-time data refresh utilities
export const setupRealtimeRefresh = () => {
  // Refresh live metrics every 5 seconds
  const liveMetricsInterval = setInterval(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.liveMetrics })
  }, 5000)
  
  // Refresh equipment status every 10 seconds
  const equipmentStatusInterval = setInterval(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allEquipmentStatus })
  }, 10000)
  
  // Return cleanup function
  return () => {
    clearInterval(liveMetricsInterval)
    clearInterval(equipmentStatusInterval)
  }
}

// New data freshness constants
export const dataFreshness = {
  // Production and quality data
  production: 30 * 1000, // 30 seconds
  quality: 60 * 1000, // 1 minute
  
  // Recipe and configuration data
  recipes: 5 * 60 * 1000, // 5 minutes
  configuration: 10 * 60 * 1000, // 10 minutes
  
  // User and authentication data
  user: 15 * 60 * 1000, // 15 minutes
  auth: 5 * 60 * 1000, // 5 minutes
} 