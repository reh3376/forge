import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { RetryLink } from '@apollo/client/link/retry'
import { getAuthToken } from '../auth-utils'

// GraphQL endpoints configuration
const GRAPHQL_ENDPOINTS = {
  MES: process.env['NEXT_PUBLIC_MES_GRAPHQL_URL'] || '/api/graphql-proxy',
  WMS: process.env['NEXT_PUBLIC_WMS_GRAPHQL_URL'] || 'http://localhost:3020/graphql',
  SCHEDULE: process.env['NEXT_PUBLIC_SCHEDULE_GRAPHQL_URL'] || 'http://localhost:3020/schedule',
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
    
    // Handle authentication errors
    if ('statusCode' in networkError && networkError.statusCode === 401) {
      // Authentication error - let the auth context handle this
      console.error('🔐 Authentication error detected - user may need to re-login')
      // Don't manually clear tokens - let MSAL handle token lifecycle
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

// Create MES GraphQL client
const mesHttpLink = new HttpLink({
  uri: GRAPHQL_ENDPOINTS.MES,
})

export const mesGraphQLClient = new ApolloClient({
  link: from([authLink, errorLink, retryLink, mesHttpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Recipe: {
        keyFields: ['id'],
        fields: {
          parameters: {
            merge: true,
          },
        },
      },
      RecipeBomItem: {
        keyFields: ['id'],
        fields: {
          displayUnits: {
            merge: true,
          },
        },
      },
      Asset: {
        keyFields: ['id'],
        fields: {
          children: {
            merge: true,
          },
        },
      },
      ProductionOrder: {
        fields: {
          items: {
            merge: true,
          },
        },
      },
      Query: {
        fields: {
          // Recipe data should be relatively fresh
          recipes: {
            merge: false,
          },
          // Asset data can be cached longer
          assets: {
            merge: true,
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
})

// Create Schedule GraphQL client
const scheduleHttpLink = new HttpLink({
  uri: GRAPHQL_ENDPOINTS.SCHEDULE,
})

export const scheduleGraphQLClient = new ApolloClient({
  link: from([authLink, errorLink, retryLink, scheduleHttpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      ScheduleItem: {
        keyFields: ['id'],
        fields: {
          dependencies: {
            merge: true,
          },
        },
      },
      ProductionLine: {
        fields: {
          scheduleItems: {
            merge: true,
          },
        },
      },
      Query: {
        fields: {
          // Schedule data should be fresh
          scheduleItems: {
            merge: false,
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
})

// GraphQL queries for MES
export const MES_QUERIES = {
  GET_RECIPES: `
    query GetRecipes {
      recipes {
        id
        name
        version
        status
        description
        parameters {
          name
          value
          unit
          type
        }
      }
    }
  `,

  GET_ASSETS: `
    query GetAssets {
      assets {
        id
        name
        type
        status
        location
        parentId
      }
    }
  `,

  GET_PRODUCTION_ORDERS: `
    query GetProductionOrders($filter: ProductionOrderFilter) {
      productionOrders(filter: $filter) {
        id
        orderNumber
        status
        scheduledStart
        scheduledEnd
        actualStart
        actualEnd
        items {
          productId
          quantity
          unit
        }
      }
    }
  `,
}

// GraphQL queries for Schedule
export const SCHEDULE_QUERIES = {
  GET_SCHEDULE_ITEMS: `
    query GetScheduleItems($filter: ScheduleFilter) {
      scheduleItems(filter: $filter) {
        id
        title
        startTime
        endTime
        status
        productionLineId
        dependencies
      }
    }
  `,

  GET_PRODUCTION_LINES: `
    query GetProductionLines {
      productionLines {
        id
        name
        status
        capacity
        scheduleItems {
          id
          title
          startTime
          endTime
          status
        }
      }
    }
  `,
}

export const MES_MUTATIONS = {
  // Recipe mutations
  CREATE_RECIPE: `
    mutation CreateRecipe($input: CreateRecipeInput!) {
      createRecipe(input: $input) {
        id
        name
        status
        version
        createdAt
      }
    }
  `,

  UPDATE_RECIPE: `
    mutation UpdateRecipe($id: ID!, $input: UpdateRecipeInput!) {
      updateRecipe(id: $id, input: $input) {
        id
        name
        status
        version
        updatedAt
      }
    }
  `,

  // Production order mutations
  CREATE_PRODUCTION_ORDER: `
    mutation CreateProductionOrder($input: CreateProductionOrderInput!) {
      createProductionOrder(input: $input) {
        id
        orderNumber
        status
        createdAt
      }
    }
  `,

  UPDATE_PRODUCTION_ORDER_STATUS: `
    mutation UpdateProductionOrderStatus($id: ID!, $status: ProductionOrderStatus!) {
      updateProductionOrderStatus(id: $id, status: $status) {
        id
        status
        updatedAt
      }
    }
  `,

  // Batch mutations
  CREATE_BATCH: `
    mutation CreateBatch($input: CreateBatchInput!) {
      createBatch(input: $input) {
        id
        batchNumber
        status
        startDate
      }
    }
  `,

  UPDATE_BATCH_STATUS: `
    mutation UpdateBatchStatus($id: ID!, $status: BatchStatus!) {
      updateBatchStatus(id: $id, status: $status) {
        id
        status
        endDate
      }
    }
  `,

  UPDATE_BATCH_METRICS: `
    mutation UpdateBatchMetrics($id: ID!, $metrics: BatchMetricsInput!) {
      updateBatchMetrics(id: $id, metrics: $metrics) {
        id
        qualityMetrics {
          alcoholContent
          phLevel
          temperature
          gravity
        }
      }
    }
  `,

  // Equipment mutations
  UPDATE_EQUIPMENT_STATUS: `
    mutation UpdateEquipmentStatus($id: ID!, $status: EquipmentStatus!, $data: EquipmentDataInput) {
      updateEquipmentStatus(id: $id, status: $status, data: $data) {
        id
        status
        temperature
        pressure
        level
        lastUpdate
      }
    }
  `,
}

// Utility functions for GraphQL operations
export const graphqlUtils = {
  // Handle GraphQL errors
  extractGraphQLError: (error: { graphQLErrors?: Array<{ message: string }>; networkError?: { message: string }; message?: string }) => {
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      return error.graphQLErrors[0]?.message || 'GraphQL error occurred'
    }
    if (error.networkError) {
      return `Network error: ${error.networkError.message}`
    }
    return error.message || 'An unknown error occurred'
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
}

// Export the main client (MES by default)
export const graphqlClient = mesGraphQLClient 