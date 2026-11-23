'use client'

import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient, setupRealtimeRefresh } from './query-client'

interface QueryProviderProps {
  children: React.ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Set up real-time refresh for manufacturing data
  React.useEffect(() => {
    const cleanup = setupRealtimeRefresh()
    return cleanup
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Temporarily disabled for demo
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          position="bottom"
        />
      )}
      */}
    </QueryClientProvider>
  )
}

// Export query client for use in other parts of the app
export { queryClient } from './query-client' 