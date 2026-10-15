'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { JWTLoginForm } from '@/components/auth/JWTLoginForm'
import { useJWTAuth } from '@/hooks/useJWTAuth'
import { apiClient, graphqlClient } from '@/lib/api'
import { getCurrentBackendConfig } from '@/config/backend'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Server, 
  Database, 
  Key, 
  Activity,
  LogOut,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'

interface TestResult {
  name: string
  status: 'pending' | 'success' | 'error'
  response?: unknown
  error?: string
  duration?: number
  endpoint?: string
}

export default function ApiClientTestPage() {
  const { isAuthenticated, user, logout, getToken } = useJWTAuth()
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [backendConfig] = useState(getCurrentBackendConfig())

  // Test configurations
  const restTests = [
    {
      key: 'health',
      name: 'Health Check',
      endpoint: '/_health',
      method: 'GET' as const,
      description: 'Test basic health endpoint'
    },
    {
      key: 'users_me',
      name: 'Current User',
      endpoint: '/users/me',
      method: 'GET' as const,
      description: 'Get current user info (requires auth)'
    },
    {
      key: 'recipes',
      name: 'Recipes List',
      endpoint: '/recipes',
      method: 'GET' as const,
      description: 'Get all recipes'
    },
    {
      key: 'equipment',
      name: 'Equipment List',
      endpoint: '/equipment',
      method: 'GET' as const,
      description: 'Get all equipment'
    },
    {
      key: 'mqtt_brokers',
      name: 'MQTT Brokers',
      endpoint: '/unsBrokerConfigurations',
      method: 'GET' as const,
      description: 'Get MQTT broker configurations'
    }
  ]

  const graphqlTests = [
    {
      key: 'introspection',
      name: 'Schema Introspection',
      query: `
        query IntrospectionQuery {
          __schema {
            types {
              name
              kind
            }
          }
        }
      `,
      description: 'Test GraphQL schema introspection'
    },
    {
      key: 'recipes_gql',
      name: 'Recipes Query',
      query: `
        query GetRecipes {
          recipes {
            id
            name
            version
            status
          }
        }
      `,
      description: 'Get recipes via GraphQL'
    },
    {
      key: 'equipment_gql',
      name: 'Equipment Query',
      query: `
        query GetEquipment {
          equipment {
            id
            name
            type
            status
          }
        }
      `,
      description: 'Get equipment via GraphQL'
    }
  ]

  const runRestTest = async (test: typeof restTests[0]) => {
    const startTime = Date.now()
    
    setTestResults(prev => ({
      ...prev,
      [test.key]: { ...prev[test.key], status: 'pending', name: test.name, endpoint: test.endpoint }
    }))

    try {
      let response
      switch (test.method) {
        case 'GET':
          response = await apiClient.get(test.endpoint)
          break
        default:
          throw new Error(`Unsupported method: ${test.method}`)
      }

      const duration = Date.now() - startTime
      
      setTestResults(prev => ({
        ...prev,
        [test.key]: {
          name: test.name,
          status: 'success',
          response,
          duration,
          endpoint: test.endpoint
        }
      }))
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      setTestResults(prev => ({
        ...prev,
        [test.key]: {
          name: test.name,
          status: 'error',
          error: errorMessage,
          duration,
          endpoint: test.endpoint
        }
      }))
    }
  }

  const runGraphQLTest = async (test: typeof graphqlTests[0]) => {
    const startTime = Date.now()
    
    setTestResults(prev => ({
      ...prev,
      [test.key]: { ...prev[test.key], status: 'pending', name: test.name }
    }))

    try {
      const response = await graphqlClient.query(test.query)
      const duration = Date.now() - startTime
      
      setTestResults(prev => ({
        ...prev,
        [test.key]: {
          name: test.name,
          status: 'success',
          response,
          duration
        }
      }))
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      setTestResults(prev => ({
        ...prev,
        [test.key]: {
          name: test.name,
          status: 'error',
          error: errorMessage,
          duration
        }
      }))
    }
  }

  const runAllTests = async () => {
    setIsRunningTests(true)
    setTestResults({})

    // Run REST tests
    for (const test of restTests) {
      await runRestTest(test)
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Run GraphQL tests
    for (const test of graphqlTests) {
      await runGraphQLTest(test)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setIsRunningTests(false)
  }

  const getStatusIcon = (status?: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status?: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'pending':
        return <Badge variant="secondary">Running...</Badge>
      default:
        return <Badge variant="outline">Not Run</Badge>
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Server className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">API Client Test</h1>
            <p className="text-gray-600">Login to test the new JWT-based API client</p>
          </div>
          
          <JWTLoginForm />
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Backend: <span className="font-mono">{backendConfig.name}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {backendConfig.apiUrl}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">API Client Test Suite</h1>
              <p className="text-gray-600">Test the new JWT-based API client with real backend</p>
            </div>
            <Button onClick={logout} variant="outline" className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* User & Backend Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Authentication Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">User:</span>
                  <span className="font-mono text-sm">{user?.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Roles:</span>
                  <div className="flex gap-1">
                    {user?.roles.map(role => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Token:</span>
                  <span className="font-mono text-xs text-green-600">
                    {getToken() ? `${getToken()?.substring(0, 20)}...` : 'None'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Backend Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Name:</span>
                  <span className="font-mono text-sm">{backendConfig.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">API URL:</span>
                  <span className="font-mono text-xs">{backendConfig.apiUrl}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">GraphQL URL:</span>
                  <span className="font-mono text-xs">{backendConfig.graphqlUrl}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Controls */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Test Controls
            </CardTitle>
            <CardDescription>
              Run tests to verify the API client is working with JWT authentication
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button 
                onClick={runAllTests} 
                disabled={isRunningTests}
                className="flex items-center gap-2"
              >
                {isRunningTests ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                {isRunningTests ? 'Running Tests...' : 'Run All Tests'}
              </Button>
              
              <Button 
                onClick={() => setTestResults({})} 
                variant="outline"
                disabled={isRunningTests}
              >
                Clear Results
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Tabs defaultValue="rest" className="space-y-4">
          <TabsList>
            <TabsTrigger value="rest">REST API Tests</TabsTrigger>
            <TabsTrigger value="graphql">GraphQL Tests</TabsTrigger>
          </TabsList>

          <TabsContent value="rest" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  REST API Endpoints
                </CardTitle>
                <CardDescription>
                  Testing REST endpoints with JWT Bearer token authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {restTests.map(test => {
                    const result = testResults[test.key]
                    return (
                      <div key={test.key} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(result?.status)}
                            <div>
                              <h4 className="font-medium">{test.name}</h4>
                              <p className="text-sm text-gray-600">{test.description}</p>
                              <p className="text-xs font-mono text-gray-500">{test.endpoint}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {result?.duration && (
                              <span className="text-xs text-gray-500">{result.duration}ms</span>
                            )}
                            {getStatusBadge(result?.status)}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runRestTest(test)}
                              disabled={isRunningTests}
                            >
                              Test
                            </Button>
                          </div>
                        </div>
                        
                        {result?.error && (
                          <Alert className="mt-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="font-mono text-sm">
                              {result.error}
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {result?.response && (
                          <details className="mt-2">
                            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                              View Response
                            </summary>
                            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                              {String(JSON.stringify(result.response, null, 2))}
                            </pre>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="graphql" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  GraphQL Queries
                </CardTitle>
                <CardDescription>
                  Testing GraphQL queries with JWT Bearer token authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {graphqlTests.map(test => {
                    const result = testResults[test.key]
                    return (
                      <div key={test.key} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(result?.status)}
                            <div>
                              <h4 className="font-medium">{test.name}</h4>
                              <p className="text-sm text-gray-600">{test.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {result?.duration && (
                              <span className="text-xs text-gray-500">{result.duration}ms</span>
                            )}
                            {getStatusBadge(result?.status)}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runGraphQLTest(test)}
                              disabled={isRunningTests}
                            >
                              Test
                            </Button>
                          </div>
                        </div>
                        
                        <details className="mt-2">
                          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                            View Query
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto">
                            {test.query.trim()}
                          </pre>
                        </details>
                        
                        {result?.error && (
                          <Alert className="mt-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="font-mono text-sm">
                              {result.error}
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {result?.response && (
                          <details className="mt-2">
                            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                              View Response
                            </summary>
                            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                              {String(JSON.stringify(result.response, null, 2))}
                            </pre>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
} 