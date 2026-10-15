import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { RetryLink } from '@apollo/client/link/retry'
import { getAuthToken } from '../auth-utils'
import { getCurrentBackendConfig } from '../../config/backend'

// Get the current backend configuration
const backendConfig = getCurrentBackendConfig()

// GraphQL endpoints configuration based on backend config
const GRAPHQL_ENDPOINTS = {
  MES: backendConfig.graphqlUrl,
  WMS: process.env['NEXT_PUBLIC_WMS_GRAPHQL_URL'] || 'http://localhost:3020/graphql',
}

// Create auth link that adds authorization headers
const authLink = setContext(async (_, { headers }) => {
  // Get token from MSAL or demo mode
  const token = await getAuthToken()
  
  return {
    headers: {
      ...headers,
      ...(token && { authorization: `Bearer ${token}` }),
    },
  }
})

// Error link for handling GraphQL and network errors
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      console.error(
        `GraphQL Error: Message: ${message}, Location: ${locations}, Path: ${path}`
      )
    })
  }

  if (networkError) {
    console.error(`Network Error: ${networkError}`)
    console.error(`Backend Config: ${backendConfig.name} (${backendConfig.graphqlUrl})`)
    
    // Handle authentication errors
    if ('statusCode' in networkError && networkError.statusCode === 401) {
      console.error('🔐 Authentication error detected - user may need to re-login')
    }
  }
})

// Retry link for failed operations
const retryLink = new RetryLink({
  delay: {
    initial: 300,
    max: Infinity,
    jitter: true,
  },
  attempts: {
    max: 3,
    retryIf: (error) => !!error,
  },
})

// Create MES GraphQL client with configurable endpoint
const mesHttpLink = new HttpLink({
  uri: GRAPHQL_ENDPOINTS.MES,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Standard cache configuration
const cacheConfig = new InMemoryCache({
  typePolicies: {
    Recipe: {
      fields: {
        billOfMaterials: {
          merge: true,
        },
        mashingProtocol: {
          merge: true,
        },
      },
    },
    ProductionOrder: {
      fields: {
        assignedEquipment: {
          merge: true,
        },
      },
    },
    Batch: {
      fields: {
        qualityMetrics: {
          merge: true,
        },
        yields: {
          merge: true,
        },
      },
    },
    Equipment: {
      keyFields: ['id'],
      fields: {
        metrics: {
          merge: true,
        },
      },
    },
    Query: {
      fields: {
        equipmentStatus: {
          merge: false,
        },
        liveMetrics: {
          merge: false,
        },
        productionSchedule: {
          merge: true,
        },
      },
    },
  },
})

// Default options for all clients
const defaultOptions = {
  watchQuery: {
    fetchPolicy: 'cache-and-network' as const,
    errorPolicy: 'all' as const,
  },
  query: {
    fetchPolicy: 'cache-first' as const,
    errorPolicy: 'all' as const,
  },
  mutate: {
    errorPolicy: 'all' as const,
  },
}

// Create the configurable MES GraphQL client
export const configurableMesGraphQLClient = new ApolloClient({
  link: from([authLink, errorLink, retryLink, mesHttpLink]),
  cache: cacheConfig,
  defaultOptions,
})

// Create public client (no auth) for non-production use
export const nonProdMesGraphQLClient = new ApolloClient({
  link: from([errorLink, retryLink, mesHttpLink]),
  cache: cacheConfig,
  defaultOptions,
})

// Utility to get the appropriate client based on environment
export function getMesGraphQLClient(useAuth: boolean = true) {
  console.log(`Using GraphQL client: ${backendConfig.name} (${backendConfig.graphqlUrl})`)
  
  if (useAuth) {
    return configurableMesGraphQLClient
  } else {
    return nonProdMesGraphQLClient
  }
}

// Export backend info for debugging
export function getGraphQLClientInfo() {
  return {
    backendConfig,
    endpoints: GRAPHQL_ENDPOINTS,
    isNonProd: backendConfig.name !== 'Production MES Backend',
  }
} 