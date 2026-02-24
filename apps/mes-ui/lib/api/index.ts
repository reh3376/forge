// Unified GraphQL Client - Main Export
export { 
  unifiedGraphQLClient,
  apolloClient,
  graphqlUtils,
  type GraphQLClientConfig,
  type QueryOptions,
  type MutationOptions
} from './unified-graphql-client'

// Unified Recipe Client
export {
  unifiedRecipeClient,
  recipeClient, // Backward compatibility
  type CreateRecipeInput,
  type UpdateRecipeInput,
  type PaginationParams,
  type RecipeFilter,
  type PaginatedRecipesResult,
  type CreateCookInput,
  type CreateCookResponse,
  type GenerateRecipeInput,
  type GenerateRecipeResponse,
  type GenerateRecipeBomInput,
  type GenerateRecipeBomResponse,
  type RecipeBomItemResponse
} from './unified-recipe-client'

// Unified Scheduling Client
export {
  unifiedSchedulingClient,
  schedulingClient, // Backward compatibility
  type ProductionOrder,
  type ScheduleOrderQueue,
  type Asset,
  type ProductionOrderFilter,
  type ScheduleOrderQueueFilter
} from './unified-scheduling-client'

// GraphQL Queries and Mutations
export {
  RECIPE_QUERIES,
  RECIPE_MUTATIONS,
  PRODUCTION_ORDER_QUERIES,
  PRODUCTION_ORDER_MUTATIONS,
  CUSTOMER_QUERIES,
  EQUIPMENT_QUERIES,
  EQUIPMENT_MUTATIONS,
  BATCH_QUERIES,
  BATCH_MUTATIONS,
  SCHEDULING_QUERIES,
  ALL_QUERIES,
  ALL_MUTATIONS
} from './graphql-queries'

// New modular GraphQL queries and mutations (Phase 3 refactor)
export {
  GET_PRODUCTION_ORDERS,
  GET_UNSCHEDULED_ORDERS,
  UPDATE_PRODUCTION_ORDER
} from './production-order-queries'

export {
  GET_SCHEDULE_ORDER_QUEUES,
  UPDATE_SCHEDULE_ORDER,
  DELETE_SCHEDULE_ORDER
} from './schedule-order-queries'

export {
  CREATE_SCHEDULE_FROM_ORDERS,
  ADD_ORDERS_TO_SCHEDULE,
  REMOVE_ORDERS_FROM_SCHEDULE
} from './schedule-grouping-mutations'

// Unified Apollo Provider
export {
  UnifiedGraphQLProvider,
  GraphQLProvider // Backward compatibility
} from './unified-apollo-provider'

// REST API Client (unchanged)
export {
  apiClient,
  restApi,
  apiUtils,
  type ApiResponse,
  type ApiError
} from './rest-client'

// Service classes
export { MqttBrokerService, mqttBrokerService } from './mqtt-broker-service'
export { RunningRecipeService, runningRecipeService } from './running-recipe-service'

// Running Recipe GraphQL Operations
export {
  GET_RUNNING_RECIPE_BY_ORDER_QUEUE,
  GET_RUNNING_RECIPE,
  GET_RUNNING_RECIPES,
  CREATE_RUNNING_RECIPE,
  UPDATE_RUNNING_RECIPE,
  DELETE_RUNNING_RECIPE,
  CREATE_RUNNING_RECIPE_FROM_MASTER,
  UPDATE_MASTER_RECIPE_FROM_RUNNING,
  type RunningRecipe,
  type RunningRecipeIngredient,
  type RunningRecipeParameter,
  type RunningMashingStep,
  type RunningRecipeCreateInput,
  type RunningRecipeUpdateInput,
  type GetRunningRecipeByOrderQueueResult,
  type GetRunningRecipeResult,
  type GetRunningRecipesResult,
  type CreateRunningRecipeResult,
  type UpdateRunningRecipeResult,
  type DeleteRunningRecipeResult,
  type CreateRunningRecipeFromMasterResult,
  type UpdateMasterRecipeFromRunningResult
} from './graphql/running-recipes'

// MQTT Broker GraphQL Operations
export {
  GET_UNS_BROKER_CONFIGURATIONS,
  GET_UNS_BROKER_CONFIGURATION,
  CREATE_UNS_BROKER_CONFIGURATION,
  UPDATE_UNS_BROKER_CONFIGURATION,
  DELETE_UNS_BROKER_CONFIGURATION,
  type UnsBrokerConfiguration,
  type UnsBrokerConfigurationCreateInput,
  type UnsBrokerConfigurationUpdateInput,
  type UnsBrokerConfigurationWhereUniqueInput,
  type GetUnsBrokerConfigurationsResult,
  type GetUnsBrokerConfigurationResult,
  type CreateUnsBrokerConfigurationResult,
  type UpdateUnsBrokerConfigurationResult,
  type DeleteUnsBrokerConfigurationResult
} from './graphql/mqtt-brokers'

// Legacy exports for backward compatibility
// These will be deprecated in future versions

// @deprecated Use unifiedGraphQLClient instead
export { mesGraphQLClient } from './graphql-client'

// @deprecated Use unifiedGraphQLClient instead  
export { configurableMesGraphQLClient, getMesGraphQLClient } from './graphql-client-config'

// @deprecated Use unified GraphQL queries instead
export { mesClient } from './mes-client'

// @deprecated Use unified GraphQL client instead
export { GraphQLClient, graphqlClient } from '../api'

/**
 * Migration Guide:
 * 
 * OLD WAY:
 * ```typescript
 * import { mesGraphQLClient } from '@/lib/api/graphql-client'
 * import { recipeClient } from '@/lib/api/recipe-client'
 * import { GraphQLProvider } from '@/lib/api/apollo-provider'
 * ```
 * 
 * NEW WAY:
 * ```typescript
 * import { 
 *   unifiedGraphQLClient, 
 *   unifiedRecipeClient,
 *   unifiedSchedulingClient,
 *   UnifiedGraphQLProvider 
 * } from '@/lib/api'
 * ```
 * 
 * The unified clients provide:
 * - Single authentication flow (JWT + MSAL fallback)
 * - Consistent error handling
 * - Optimized caching
 * - Better TypeScript support
 * - Consolidated configuration
 */ 