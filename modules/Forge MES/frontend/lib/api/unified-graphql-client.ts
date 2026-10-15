import { ApolloClient, InMemoryCache, HttpLink, from, DocumentNode, FetchPolicy, ErrorPolicy, OperationVariables } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { RetryLink } from '@apollo/client/link/retry'
import { getCurrentBackendConfig } from '../../config/backend'
import { jwtAuthService } from '../auth/jwt-auth'

// Load Apollo Client dev error messages for better debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  import('@apollo/client/dev').then(({ loadErrorMessages, loadDevMessages }) => {
    loadDevMessages()
    loadErrorMessages()
  }).catch(console.error)
}

// Types for the unified client
export interface GraphQLClientConfig {
  useJWTAuth?: boolean
  enableRetry?: boolean
  retryAttempts?: number
  cacheConfig?: InMemoryCache
}

export interface QueryOptions {
  fetchPolicy?: FetchPolicy
  errorPolicy?: ErrorPolicy
  variables?: OperationVariables
}

export interface MutationOptions {
  errorPolicy?: ErrorPolicy
  variables?: OperationVariables
  refetchQueries?: Array<{ query: DocumentNode; variables?: OperationVariables }>
}

/**
 * Unified GraphQL Client for MES Backend
 * 
 * This class consolidates all GraphQL functionality into a single client
 * with proper JWT and MSAL authentication support.
 */
export class UnifiedGraphQLClient {
  private apolloClient: ApolloClient<unknown>
  private backendConfig = getCurrentBackendConfig()
  private config: GraphQLClientConfig
  private lastQueryFailed = false

  constructor(config: GraphQLClientConfig = {}) {
    this.config = {
      useJWTAuth: true,
      enableRetry: config.enableRetry ?? true,
      retryAttempts: config.retryAttempts ?? 3,
      ...(config.cacheConfig ? { cacheConfig: config.cacheConfig } : {})
    }
    
    console.log('📊 UnifiedGraphQLClient: Initializing with config:', {
      ...this.config,
      backendUrl: this.backendConfig.graphqlUrl,
      jwt: 'Configured to use JWT auth'
    })
    
    this.apolloClient = this.createApolloClient()
  }

  /**
   * Create the Apollo Client with all necessary links and configuration
   */
  private createApolloClient(): ApolloClient<unknown> {
    // Use the Next.js GraphQL proxy endpoint instead of direct backend
    // This ensures all requests go through our authentication proxy
    const graphqlProxyUrl = '/api/graphql'
    
    // Create HTTP link
    const httpLink = new HttpLink({
      uri: graphqlProxyUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Create auth link that adds authorization headers
    const authLink = setContext(async (_, { headers }) => {
      try {
        // Since we're using the proxy, we don't need to add auth headers here
        // The proxy handles authentication automatically
        return {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        }
      } catch (error) {
        console.error('🔥 Error setting headers:', error)
        // Return basic headers if there's an error
        return {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        }
      }
    })

    // Create error link
    const errorLink = onError(({ graphQLErrors, networkError }) => {
      if (graphQLErrors) {
        graphQLErrors.forEach(({ message, locations, path }) => {
          console.error(
            `🔥 GraphQL Error: Message: ${message}, Location: ${locations}, Path: ${path}`
          )
        })
      }

      if (networkError) {
        console.error(`🔥 Network Error:`, networkError)
        console.error(`🔥 Backend Config: ${this.backendConfig.name} (${this.backendConfig.graphqlUrl})`)
        
        // Handle authentication errors
        if ('statusCode' in networkError && networkError.statusCode === 401) {
          console.error('🔐 Authentication error detected - user may need to re-login')
          
          // Clear JWT token if it's invalid
          if (this.config.useJWTAuth) {
            jwtAuthService.logout()
          }
        }
      }
    })

    // Create retry link if enabled
    const links = [authLink, errorLink]
    
    if (this.config.enableRetry) {
      const retryLink = new RetryLink({
        delay: {
          initial: 300,
          max: Infinity,
          jitter: true,
        },
        attempts: {
          max: this.config.retryAttempts || 3,
          retryIf: (error) => !!error,
        },
      })
      links.push(retryLink)
    }

    links.push(httpLink)

    // Create cache configuration
    const cache = this.config.cacheConfig || this.createDefaultCache()

    // Create Apollo Client
    return new ApolloClient({
      link: from(links),
      cache,
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'cache-and-network',
          errorPolicy: 'all',
        },
        query: {
          fetchPolicy: 'network-only',  // Changed from cache-first to force fresh data
          errorPolicy: 'all',
        },
        mutate: {
          errorPolicy: 'all',
        },
      },
    })
  }

  /**
   * Create default cache configuration optimized for MES data
   */
  private createDefaultCache(): InMemoryCache {
    return new InMemoryCache({
      typePolicies: {
        Recipe: {
          keyFields: ['id'],
          fields: {
            recipeBoms: {
              merge: false,
            },
            parameters: {
              merge: false,
            },
            mashingProtocol: {
              merge: false,
            },
          },
        },
        ProductionOrder: {
          keyFields: ['id'],
          fields: {
            assignedEquipment: {
              merge: false,
            },
            assignedPersonnel: {
              merge: false,
            },
          },
        },
        Batch: {
          keyFields: ['id'],
          fields: {
            qualityMetrics: {
              merge: false,
            },
            yields: {
              merge: false,
            },
          },
        },
        Equipment: {
          keyFields: ['id'],
          fields: {
            metrics: {
              merge: false,
            },
            maintenanceSchedule: {
              merge: false,
            },
          },
        },
        Customer: {
          keyFields: ['id'],
        },
        Item: {
          keyFields: ['id'],
        },
        RecipeBomItem: {
          keyFields: ['id'],
          fields: {
            displayUnits: {
              merge: false,
            },
          },
        },
        Units: {
          keyFields: ['id'],
        },
        Query: {
          fields: {
            // Equipment status should be refetched frequently
            equipmentStatus: {
              merge: false,
            },
            // Live metrics should always be fresh
            liveMetrics: {
              merge: false,
            },
            // Production schedule can be cached
            productionSchedule: {
              merge: false,
            },
            // Recipes can be cached
            recipes: {
              merge: false,
            },
            // Customers can be cached
            customers: {
              merge: false,
            },
            // Items can be cached
            items: {
              merge: false,
            },
            // Production orders can be cached
            productionOrders: {
              merge: false,
            },
            // Schedule order queues can be cached
            scheduleOrderQueues: {
              merge: false,
            },
          },
        },
      },
    })
  }

  /**
   * Execute a GraphQL query
   */
  async query<T = unknown>(query: DocumentNode, options: QueryOptions = {}): Promise<T> {
    try {
      console.log('📊 Executing GraphQL query:', {
        query: query.loc?.source.body.slice(0, 150) + '...',
        variables: options.variables,
        fetchPolicy: options.fetchPolicy || 'cache-first',
        errorPolicy: options.errorPolicy || 'all',
        authenticated: this.isAuthenticated(),
        currentUser: this.getCurrentUser()
      })

      // Since we're using the /api/graphql proxy which handles authentication automatically,
      // we don't need to check for JWT authentication here. The proxy will authenticate
      // as the service account and handle all authentication concerns.
      
      // Force network-only fetch policy for authentication-related issues
      let actualFetchPolicy = options.fetchPolicy || 'cache-first';
      
      // Use network-only if this might be a recovery from a previous error
      if (this.lastQueryFailed) {
        console.log('📊 Last query failed, using network-only fetch policy')
        actualFetchPolicy = 'network-only';
        this.lastQueryFailed = false;
      }
      
      const actualOptions = {
        ...options,
        fetchPolicy: actualFetchPolicy,
        errorPolicy: options.errorPolicy || 'all',
      }

      // NOTE: Removed apolloClient.stop() call here - it was causing race conditions
      // when multiple queries run in parallel via Promise.all. The stop() would
      // cancel in-flight queries from parallel calls, causing them to return empty.

      const result = await this.apolloClient.query({
        query,
        variables: options.variables || {},
        fetchPolicy: actualOptions.fetchPolicy,
        errorPolicy: actualOptions.errorPolicy,
        // Add additional context to help track this specific query
        context: {
          operationName: this.getOperationName(query) || 'UnknownOperation',
          timestamp: Date.now()
        }
      })

      console.log('📊 GraphQL query result:', {
        success: !!result.data,
        errors: result.errors?.length || 0,
        networkStatus: result.networkStatus
      })

      return result.data
    } catch (error) {
      console.error('🔥 GraphQL Query Error:', error)
      
      // Mark that a query has failed so we can use different settings on retry
      this.lastQueryFailed = true;
      
      // Special handling for Invariant Violation errors (often auth-related)
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message || '');
        if (errorMessage.includes('Invariant Violation')) {
          console.error('Detected Apollo Invariant Violation - this might be an authentication issue or stale observable query')
          
          // Clear Apollo cache and stop all queries to prevent cached errors
          this.clearCache();
          try {
            this.apolloClient.stop();
          } catch (e) {
            console.log('📊 Error stopping Apollo client queries:', e);
          }
          
          // If it appears to be an auth issue, try to handle JWT renewal
          if (this.config.useJWTAuth) {
            // Try to refresh the token
            try {
              await jwtAuthService.refreshToken();
              console.log('Token refresh attempt completed after Invariant Violation');
            } catch (refreshError) {
              console.warn('Token refresh failed after Invariant Violation:', refreshError);
            }
          }
          
          // Create a more helpful error message
          throw new Error('GraphQL query failed: The client may be in an inconsistent state. Please try again or reload the page.');
        }
      }
      
      // Type-safe error details logging
      if (error && typeof error === 'object') {
        const errorObj: Record<string, unknown> = {
          name: 'name' in error ? error.name : undefined,
          message: 'message' in error ? error.message : undefined,
          networkError: 'networkError' in error ? error.networkError : undefined,
          graphQLErrors: 'graphQLErrors' in error ? error.graphQLErrors : undefined,
        }
        
        if (query.loc?.source.body) {
          errorObj['operation'] = query.loc.source.body.slice(0, 150) + '...'
        }
        
        console.error('Error details:', errorObj)
      }
   
      throw this.formatError(error)
    }
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate<T = unknown>(mutation: DocumentNode, options: MutationOptions = {}): Promise<T> {
    try {
      // Debug: Check if the mutation is a valid GraphQL document
      console.log('🔍 Debug: Mutation type:', typeof mutation);
      console.log('🔍 Debug: Mutation kind:', mutation?.kind);
      console.log('🔍 Debug: Mutation definitions:', mutation?.definitions?.length);
      
      // Validate that we have a proper GraphQL document
      if (!mutation || typeof mutation !== 'object') {
        throw new Error('Invalid GraphQL document: mutation is not an object');
      }
      
      if (mutation.kind !== 'Document') {
        throw new Error(`Invalid GraphQL document: expected kind 'Document', got '${mutation.kind}'`);
      }
      
      if (!mutation.definitions || mutation.definitions.length === 0) {
        throw new Error('Invalid GraphQL document: no definitions found');
      }
      
      // Check if any definition is a mutation
      const hasMutation = mutation.definitions.some(def => 
        def.kind === 'OperationDefinition' && def.operation === 'mutation'
      );
      
      if (!hasMutation) {
        throw new Error('Invalid GraphQL document: no mutation operation found');
      }
      
      console.log('✅ GraphQL document validation passed');
      
      const result = await this.apolloClient.mutate({
        mutation,
        variables: options.variables || {},
        errorPolicy: options.errorPolicy || 'all',
        refetchQueries: options.refetchQueries || [],
      })

      return result.data
    } catch (error) {
      console.error('🔥 GraphQL Mutation Error:', error)
      
      // Add specific handling for document parsing errors
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message || '');
        if (errorMessage.includes('parsed GraphQL document')) {
          console.error('🚨 GraphQL Document Parsing Error detected');
          console.error('🔍 Mutation object:', mutation);
          console.error('🔍 Variables:', options.variables);
        }
      }
      
      throw this.formatError(error)
    }
  }

  /**
   * Watch a GraphQL query for real-time updates
   */
  watchQuery(query: DocumentNode, options: QueryOptions = {}) {
    return this.apolloClient.watchQuery({
      query,
      variables: options.variables || {},
      fetchPolicy: options.fetchPolicy || 'cache-and-network',
      errorPolicy: options.errorPolicy || 'all',
    })
  }

  /**
   * Clear the Apollo cache
   */
  clearCache(): void {
    this.apolloClient.clearStore()
  }

  /**
   * Reset the Apollo store
   */
  resetStore(): void {
    this.apolloClient.resetStore()
  }

  /**
   * Get the underlying Apollo Client instance
   */
  getApolloClient(): ApolloClient<unknown> {
    return this.apolloClient
  }

  /**
   * Get backend configuration info
   */
  getBackendInfo() {
    return {
      config: this.backendConfig,
      clientConfig: this.config,
    }
  }

  /**
   * Format GraphQL errors for consistent error handling
   */
  private formatError(error: unknown): Error {
    if (error && typeof error === 'object' && 'graphQLErrors' in error) {
      const graphQLError = (error as { graphQLErrors: Array<{ message: string }> }).graphQLErrors[0]
      if (graphQLError) {
        return new Error(`GraphQL Error: ${graphQLError.message}`)
      }
    }
    
    if (error && typeof error === 'object' && 'networkError' in error) {
      const networkError = (error as { networkError: { message: string } }).networkError
      return new Error(`Network Error: ${networkError.message}`)
    }
    
    return error instanceof Error ? error : new Error('Unknown GraphQL error')
  }

  /**
   * Check if the client is authenticated
   */
  isAuthenticated(): boolean {
    return jwtAuthService.isAuthenticated()
  }

  /**
   * Get current user information
   */
  getCurrentUser() {
    return jwtAuthService.getUser()
  }

  /**
   * Extract operation name from a GraphQL query document
   */
  private getOperationName(query: DocumentNode): string | null {
    if (!query.definitions || query.definitions.length === 0) {
      return null;
    }
    
    for (const def of query.definitions) {
      if (def.kind === 'OperationDefinition' && def.name) {
        return def.name.value;
      }
    }
    
    return null;
  }
}

// Create and export singleton instance
export const unifiedGraphQLClient = new UnifiedGraphQLClient()

// Export the Apollo Client for React components that need it
export const apolloClient = unifiedGraphQLClient.getApolloClient()

// Utility functions for common GraphQL operations
export const graphqlUtils = {
  // Handle GraphQL errors
  extractError: (error: unknown): string => {
    if (error && typeof error === 'object' && 'graphQLErrors' in error) {
      const graphQLErrors = (error as { graphQLErrors: Array<{ message?: string }> }).graphQLErrors
      return graphQLErrors[0]?.message || 'GraphQL error occurred'
    }
    if (error && typeof error === 'object' && 'networkError' in error) {
      const networkError = (error as { networkError: { message: string } }).networkError
      return `Network error: ${networkError.message}`
    }
    if (error instanceof Error) {
      return error.message
    }
    return 'An unknown error occurred'
  },

  // Format variables for queries
  formatDateRange: (startDate?: Date, endDate?: Date) => ({
    startDate: startDate?.toISOString().split('T')[0],
    endDate: endDate?.toISOString().split('T')[0],
  }),

  // Format filter objects
  formatFilter: (filter: Record<string, unknown>) => {
    // Remove undefined values
    return Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined)
    )
  },

  // Create pagination variables
  createPaginationVars: (page: number = 1, limit: number = 10) => ({
    skip: (page - 1) * limit,
    take: limit,
  }),
} 