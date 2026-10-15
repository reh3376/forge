'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'

// Query client configuration optimized for manufacturing data
const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Manufacturing data changes frequently, so shorter stale time
        staleTime: 1000 * 60 * 2, // 2 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors (client errors)
          if (error instanceof Error && error.message.includes('4')) {
            return false
          }
          // Retry up to 3 times for other errors
          return failureCount < 3
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
        onError: (error) => {
          console.error('Mutation error:', error)
          // Here you could add global error handling like toast notifications
        },
      },
    },
  })
}

interface ReactQueryProviderProps {
  children: ReactNode
}

export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
  // Create a stable query client instance
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Temporarily disabled for demo
      <ReactQueryDevtools 
        initialIsOpen={false} 
        position="bottom"
      />
      */}
    </QueryClientProvider>
  )
}

// Query keys factory for consistent key management
export const queryKeys = {
  // Recipe queries
  recipes: {
    all: ['recipes'] as const,
    lists: () => [...queryKeys.recipes.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.recipes.lists(), { filters }] as const,
    details: () => [...queryKeys.recipes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.recipes.details(), id] as const,
    versions: (id: string) => [...queryKeys.recipes.detail(id), 'versions'] as const,
  },
  
  // Production order queries
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.orders.lists(), { filters }] as const,
    details: () => [...queryKeys.orders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.orders.details(), id] as const,
    status: (id: string) => [...queryKeys.orders.detail(id), 'status'] as const,
  },
  
  // Equipment queries
  equipment: {
    all: ['equipment'] as const,
    lists: () => [...queryKeys.equipment.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.equipment.lists(), { filters }] as const,
    details: () => [...queryKeys.equipment.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.equipment.details(), id] as const,
    status: () => [...queryKeys.equipment.all, 'status'] as const,
  },
  
  // Dashboard queries
  dashboard: {
    all: ['dashboard'] as const,
    kpis: () => [...queryKeys.dashboard.all, 'kpis'] as const,
    widgets: (dashboardId: string) => 
      [...queryKeys.dashboard.all, 'widgets', dashboardId] as const,
    alerts: () => [...queryKeys.dashboard.all, 'alerts'] as const,
  },
  
  // User and auth queries
  auth: {
    all: ['auth'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
    permissions: () => [...queryKeys.auth.all, 'permissions'] as const,
  },
} as const

// Utility function to invalidate related queries
export const invalidateQueries = (queryClient: QueryClient) => ({
  recipes: {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all }),
    detail: (id: string) => 
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.detail(id) }),
  },
  orders: {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
    detail: (id: string) => 
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) }),
  },
  equipment: {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all }),
    status: () => 
      queryClient.invalidateQueries({ queryKey: queryKeys.equipment.status() }),
  },
  dashboard: {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
  },
})

// Export the query client type for use in hooks
export type { QueryClient } 