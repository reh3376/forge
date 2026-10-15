'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { unifiedSchedulingClient } from '@/lib/api/unified-scheduling-client'
import { unifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { useJWTAuth } from '@/hooks/useJWTAuth'

interface TestResult {
  name: string
  status: 'pending' | 'success' | 'error'
  message: string
  data?: unknown
  duration?: number
}

export default function UnifiedClientTestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const { isAuthenticated, user, login, logout } = useJWTAuth()

  const updateTestResult = (name: string, result: Omit<TestResult, 'name'>) => {
    setTestResults(prev => {
      const existing = prev.find(r => r.name === name)
      if (existing) {
        return prev.map(r => r.name === name ? { ...r, ...result } : r)
      }
      return [...prev, { name, ...result }]
    })
  }

  const runTest = async (name: string, testFn: () => Promise<unknown>) => {
    const startTime = Date.now()
    updateTestResult(name, { status: 'pending', message: 'Running...' })
    
    try {
      const result = await testFn()
      const duration = Date.now() - startTime
      updateTestResult(name, { 
        status: 'success', 
        message: 'Test passed', 
        data: result,
        duration 
      })
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      updateTestResult(name, { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        duration 
      })
      throw error
    }
  }

  const runAllTests = async () => {
    setIsRunning(true)
    setTestResults([])

    try {
      // Test 1: Check JWT Authentication Status
      await runTest('JWT Authentication Status', async () => {
        const authResult = await unifiedSchedulingClient.testAuthentication()
        return authResult
      })

      // Test 2: Check Backend Configuration
      await runTest('Backend Configuration', async () => {
        const backendInfo = unifiedSchedulingClient.getBackendInfo()
        return backendInfo
      })

      // Test 3: Test Simple Production Orders Query
      await runTest('Production Orders Query', async () => {
        const orders = await unifiedSchedulingClient.getProductionOrders({ take: 5 })
        return { count: orders.length, orders: orders.slice(0, 2) } // Return first 2 for display
      })

      // Test 4: Test GraphQL Client Direct Query
      await runTest('Direct GraphQL Query', async () => {
        const isAuth = unifiedGraphQLClient.isAuthenticated()
        const user = unifiedGraphQLClient.getCurrentUser()
        return { isAuthenticated: isAuth, user }
      })

    } catch (error) {
      console.error('Test suite failed:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const handleLogin = async () => {
    try {
      // Use demo credentials for testing
      await login('demo@whiskeyhouse.com', 'demo123')
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
    }
  }

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-blue-100 text-blue-800'
      case 'success':
        return 'bg-green-100 text-green-800'
      case 'error':
        return 'bg-red-100 text-red-800'
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Unified GraphQL Client Test</h1>
          <p className="text-gray-600 mt-1">Test JWT authentication and GraphQL operations</p>
        </div>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Authentication Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">JWT Authentication</p>
              <p className="text-sm text-gray-600">
                {isAuthenticated ? `Logged in as: ${user?.username}` : 'Not authenticated'}
              </p>
            </div>
            <Badge className={isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
              {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
            </Badge>
          </div>
          
          <div className="flex gap-2">
            {!isAuthenticated ? (
              <Button onClick={handleLogin}>
                Login with Demo Credentials
              </Button>
            ) : (
              <Button variant="outline" onClick={logout}>
                Logout
              </Button>
            )}
            <Button 
              onClick={runAllTests} 
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              Run Tests
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Results from unified GraphQL client tests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testResults.map((result, index) => (
              <div key={result.name}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <p className="font-medium">{result.name}</p>
                      <p className="text-sm text-gray-600">{result.message}</p>
                      {result.duration && (
                        <p className="text-xs text-gray-500">{result.duration}ms</p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(result.status)}>
                    {result.status}
                  </Badge>
                </div>
                
                {result.data && result.status === 'success' && (
                  <Alert className="mt-2">
                    <AlertDescription>
                      <pre className="text-xs overflow-x-auto">
                        {(() => {
                          try {
                            return JSON.stringify(result.data, null, 2)
                          } catch {
                            return String(result.data)
                          }
                        })()}
                      </pre>
                    </AlertDescription>
                  </Alert>
                )}
                
                {index < testResults.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-600">
            1. <strong>Login:</strong> Click &ldquo;Login with Demo Credentials&rdquo; to authenticate with JWT
          </p>
          <p className="text-sm text-gray-600">
            2. <strong>Run Tests:</strong> Click &ldquo;Run Tests&rdquo; to verify the unified GraphQL client
          </p>
          <p className="text-sm text-gray-600">
            3. <strong>Check Results:</strong> Review test results to ensure JWT authentication is working
          </p>
          <p className="text-sm text-gray-600">
            4. <strong>Debug:</strong> Check browser console for detailed logs
          </p>
        </CardContent>
      </Card>
    </div>
  )
} 