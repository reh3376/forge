'use client'

import React from 'react'
import { ApolloProvider } from '@apollo/client'
import { apolloClient } from './unified-graphql-client'

interface UnifiedGraphQLProviderProps {
  children: React.ReactNode
}

/**
 * Unified GraphQL Provider
 * 
 * This provider uses the unified GraphQL client with proper JWT and MSAL authentication.
 * It replaces the previous multiple GraphQL providers with a single, consolidated solution.
 */
export function UnifiedGraphQLProvider({ children }: UnifiedGraphQLProviderProps) {
  return (
    <ApolloProvider client={apolloClient}>
      {children}
    </ApolloProvider>
  )
}

// Export for backward compatibility
export const GraphQLProvider = UnifiedGraphQLProvider 