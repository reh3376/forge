// Backend Configuration
// This file helps manage different backend endpoints for development and production

export interface BackendConfig {
  name: string
  description: string
  apiUrl: string
  graphqlUrl: string
  websocketUrl: string
  healthEndpoints: string[]
}

// Available backend configurations
export const BACKEND_CONFIGS: Record<string, BackendConfig> = {
  // Next.js internal APIs (current default)
  nextjs: {
    name: 'Next.js Internal',
    description: 'Use Next.js API routes for all functionality',
    apiUrl: 'http://localhost:4000/api',
    graphqlUrl: 'http://localhost:4000/api/graphql',
    websocketUrl: 'http://localhost:3001',
    healthEndpoints: ['/api/_health', '/api/_health/db', '/api/_health/api', '/api/_health/live', '/api/_health/ready']
  },

  // Local MES Backend (when running separately)
  local_mes: {
    name: 'Local MES Backend',
    description: 'Connect to locally running MES backend service',
    apiUrl: 'http://localhost:3000/api',
    graphqlUrl: 'http://localhost:3000/graphql',
    websocketUrl: 'http://localhost:3000',
    healthEndpoints: ['/health', '/api/health', '/status', '/api/status', '/_health']
  },

  // Development MES Backend
  dev_mes: {
    name: 'Development MES Backend',
    description: 'Connect to development MES backend server',
    apiUrl: 'http://dev-mes.whiskeyhouse.local:8000/api',
    graphqlUrl: 'http://dev-mes.whiskeyhouse.local:8000/graphql',
    websocketUrl: 'http://dev-mes.whiskeyhouse.local:8001',
    healthEndpoints: ['/health', '/api/health', '/status', '/api/status']
  },

  // Production MES Backend
  prod_mes: {
    name: 'Production MES Backend',
    description: 'Connect to production MES backend server',
    apiUrl: 'https://mes-api.whiskeyhouse.com/api',
    graphqlUrl: 'https://mes-api.whiskeyhouse.com/graphql',
    websocketUrl: 'wss://mes-ws.whiskeyhouse.com',
    healthEndpoints: ['/health', '/api/health', '/status']
  },

  // Railway Backend (Staging/Production)
  railway: {
    name: 'Railway Production Backend',
    description: 'Connect to Railway-deployed MES backend',
    apiUrl: 'https://whk-mes-production.up.railway.app/api',
    graphqlUrl: 'https://whk-mes-production.up.railway.app/graphql',
    websocketUrl: 'https://whk-mes-production.up.railway.app',
    healthEndpoints: ['/health', '/api/health', '/status', '/api/status', '/_health']
  }
}

// Get current backend configuration based on environment variables
export function getCurrentBackendConfig(): BackendConfig {
  const configName = process.env['NEXT_PUBLIC_BACKEND_CONFIG'] || 'local_mes'
  
  // Allow custom configuration via environment variables
  if (configName === 'custom') {
    return {
      name: 'Custom Backend',
      description: 'Custom backend configuration from environment variables',
      apiUrl: process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api',
      graphqlUrl: process.env['NEXT_PUBLIC_MES_GRAPHQL_URL'] || 'http://localhost:3000/graphql',
      websocketUrl: process.env['NEXT_PUBLIC_SOCKET_URL'] || 'http://localhost:3001',
      healthEndpoints: ['/health', '/api/health', '/status', '/api/status', '/_health']
    }
  }
  
  const config = BACKEND_CONFIGS[configName]
  return config || BACKEND_CONFIGS['nextjs']!
}

// Helper to check if we're using an external backend
export function isExternalBackend(): boolean {
  const config = getCurrentBackendConfig()
  return !config.apiUrl.includes('localhost:3000') && !config.apiUrl.includes('localhost:4000')
}

// Helper to get health check endpoints for the current backend
export function getHealthEndpoints(): string[] {
  const config = getCurrentBackendConfig()
  return config.healthEndpoints.map(endpoint => `${config.apiUrl}${endpoint}`)
}

// Helper to get backend info for debugging
export function getBackendInfo() {
  const config = getCurrentBackendConfig()
  return {
    config,
    isExternal: isExternalBackend(),
    healthEndpoints: getHealthEndpoints(),
    environment: process.env.NODE_ENV || 'development'
  }
} 