import { FetchPolicy } from '@apollo/client'
import { UnifiedGraphQLClient } from './unified-graphql-client'
import {
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
  type DeleteUnsBrokerConfigurationResult,
} from './graphql/mqtt-brokers'

/**
 * Service class for MQTT Broker Configuration operations using GraphQL
 */
export class MqttBrokerService {
  private client: UnifiedGraphQLClient

  constructor() {
    // Explicitly configure with JWT auth
    this.client = new UnifiedGraphQLClient({
      useJWTAuth: true,
      enableRetry: true,
      retryAttempts: 3
    })
    
    console.log('🔌 MqttBrokerService initialized with UnifiedGraphQLClient:', {
      isAuthenticated: this.client.isAuthenticated(),
      currentUser: this.client.getCurrentUser(),
      backendInfo: this.client.getBackendInfo()
    })
  }

  /**
   * Get all MQTT broker configurations
   */
  async getAllBrokers(maxRetries = 2): Promise<UnsBrokerConfiguration[]> {
    try {
      console.log('🔍 Starting getAllBrokers query...')
      
      // Check authentication before proceeding
      if (!this.isAuthenticated()) {
        console.warn('⚠️ Authentication check failed in MqttBrokerService')
        // Wait a moment to see if authentication state resolves
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Check again
        if (!this.isAuthenticated()) {
          console.error('❌ Still not authenticated after delay')
          throw new Error('Authentication required to fetch MQTT brokers')
        }
      }
      
      const result = await this.client.query<GetUnsBrokerConfigurationsResult>(
        GET_UNS_BROKER_CONFIGURATIONS,
        {
          fetchPolicy: 'network-only' as FetchPolicy, // Force fresh data to avoid stale cache issues
          errorPolicy: 'all',
        }
      )
      
      if (!result) {
        console.warn('No result returned from getAllBrokers query')
        return []
      }
      
      console.log('✅ getAllBrokers query succeeded:', { 
        resultCount: result.unsBrokerConfigurations?.length || 0
      })
      
      return result.unsBrokerConfigurations || []
    } catch (error: unknown) {
      console.error('Failed to fetch MQTT brokers:', error)
      
      // Type-safe error details logging
      if (error && typeof error === 'object') {
        const errorDetails: Record<string, unknown> = {};
        
        if ('name' in error) errorDetails['name'] = error.name;
        if ('message' in error) errorDetails['message'] = error.message;
        if ('stack' in error) errorDetails['stack'] = error.stack;
        if ('networkError' in error) errorDetails['networkError'] = error.networkError;
        if ('graphQLErrors' in error) errorDetails['graphQLErrors'] = error.graphQLErrors;
        
        console.error('Error details:', errorDetails);
        
        // Handle Invariant Violation error specifically (Apollo Client internal error)
        if ('message' in error && 
            typeof error.message === 'string' && 
            error.message.includes('Invariant Violation')) {
          
          console.warn('Detected Apollo Invariant Violation - attempting to resolve...')
          
          // Clear Apollo client cache to reset the client state
          this.client.clearCache()
          
          // If we have retries left, create a new client instance and try again
          if (maxRetries > 0) {
            console.log(`Retrying getAllBrokers with a new client instance (${maxRetries} retries left)`)
            
            // Create a new client instance
            this.client = new UnifiedGraphQLClient({
              useJWTAuth: true,
              enableRetry: true,
              retryAttempts: 3
            })
            
            // Short delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Recursive retry with decremented counter
            return this.getAllBrokers(maxRetries - 1)
          }
        }
      }
      
      throw new Error('Failed to fetch MQTT broker configurations')
    }
  }

  /**
   * Get a single MQTT broker configuration by ID
   */
  async getBrokerById(id: string): Promise<UnsBrokerConfiguration | null> {
    try {
      const result = await this.client.query<GetUnsBrokerConfigurationResult>(
        GET_UNS_BROKER_CONFIGURATION,
        {
          variables: { id },
          fetchPolicy: 'network-only' as FetchPolicy, // Force fresh data
          errorPolicy: 'all',
        }
      )
      
      return result?.unsBrokerConfiguration || null
    } catch (error) {
      console.error(`Failed to fetch MQTT broker with ID ${id}:`, error)
      throw new Error(`Failed to fetch MQTT broker with ID ${id}`)
    }
  }

  /**
   * Create a new MQTT broker configuration
   */
  async createBroker(input: UnsBrokerConfigurationCreateInput): Promise<UnsBrokerConfiguration> {
    try {
      const result = await this.client.mutate<CreateUnsBrokerConfigurationResult>(
        CREATE_UNS_BROKER_CONFIGURATION,
        {
          variables: { data: input },
          errorPolicy: 'all',
          refetchQueries: [{ query: GET_UNS_BROKER_CONFIGURATIONS }],
        }
      )
      
      if (!result || !result.createUnsBrokerConfiguration) {
        throw new Error('Failed to create MQTT broker configuration - no data returned')
      }
      
      return result.createUnsBrokerConfiguration
    } catch (error) {
      console.error('Failed to create MQTT broker:', error)
      throw new Error('Failed to create MQTT broker configuration')
    }
  }

  /**
   * Update an existing MQTT broker configuration
   */
  async updateBroker(
    where: UnsBrokerConfigurationWhereUniqueInput,
    data: UnsBrokerConfigurationUpdateInput
  ): Promise<UnsBrokerConfiguration> {
    try {
      const result = await this.client.mutate<UpdateUnsBrokerConfigurationResult>(
        UPDATE_UNS_BROKER_CONFIGURATION,
        {
          variables: { where, data },
          errorPolicy: 'all',
          refetchQueries: [
            { query: GET_UNS_BROKER_CONFIGURATIONS },
            { query: GET_UNS_BROKER_CONFIGURATION, variables: { id: where.id } },
          ],
        }
      )
      
      if (!result || !result.updateUnsBrokerConfiguration) {
        throw new Error('Failed to update MQTT broker configuration - no data returned')
      }
      
      return result.updateUnsBrokerConfiguration
    } catch (error) {
      console.error('Failed to update MQTT broker:', error)
      throw new Error('Failed to update MQTT broker configuration')
    }
  }

  /**
   * Delete an MQTT broker configuration
   */
  async deleteBroker(where: UnsBrokerConfigurationWhereUniqueInput): Promise<string> {
    try {
      const result = await this.client.mutate<DeleteUnsBrokerConfigurationResult>(
        DELETE_UNS_BROKER_CONFIGURATION,
        {
          variables: { where },
          errorPolicy: 'all',
          refetchQueries: [{ query: GET_UNS_BROKER_CONFIGURATIONS }],
        }
      )
      
      if (!result || !result.deleteUnsBrokerConfiguration) {
        throw new Error('Failed to delete MQTT broker configuration - no data returned')
      }
      
      return result.deleteUnsBrokerConfiguration.id
    } catch (error) {
      console.error('Failed to delete MQTT broker:', error)
      throw new Error('Failed to delete MQTT broker configuration')
    }
  }

  /**
   * Get the underlying GraphQL client for advanced operations
   */
  getClient(): UnifiedGraphQLClient {
    return this.client
  }

  /**
   * Clear the cache for MQTT broker data
   */
  clearCache(): void {
    this.client.clearCache()
  }

  /**
   * Check if the client is authenticated
   */
  isAuthenticated(): boolean {
    return this.client.isAuthenticated()
  }

  /**
   * Get the current user from the client
   */
  getCurrentUser(): unknown {
    return this.client.getCurrentUser()
  }

  /**
   * Get the backend info from the client
   */
  getBackendInfo(): unknown {
    return this.client.getBackendInfo()
  }
}

// Export a singleton instance
export const mqttBrokerService = new MqttBrokerService() 