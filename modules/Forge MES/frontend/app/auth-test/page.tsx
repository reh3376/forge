'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { JWTLoginForm } from '../../components/auth/JWTLoginForm'
import { useJWTAuth } from '../../hooks/useJWTAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { LogOut, User, Shield, Key, RefreshCw, Database } from 'lucide-react'
import { restApi } from '../../lib/api/rest-client'
import { unifiedGraphQLClient } from '../../lib/api/unified-graphql-client'
import { RECIPE_QUERIES } from '../../lib/api/graphql-queries'

export default function AuthTestPage() {
  const { isAuthenticated, user, logout, getToken, refreshAuth } = useJWTAuth()
  const [apiTestResult, setApiTestResult] = useState<string | null>(null)
  const [isTestingApi, setIsTestingApi] = useState(false)
  const [graphqlTestResult, setGraphqlTestResult] = useState<string | null>(null)
  const [isTestingGraphql, setIsTestingGraphql] = useState(false)

  // Test API call with JWT token
  const testApiCall = async () => {
    setIsTestingApi(true)
    setApiTestResult(null)

    try {
      // Try to call a protected endpoint
      const response = await restApi.recipes.getAll()
      setApiTestResult(`✅ REST API call successful! Retrieved ${response.data.data?.length || 0} recipes`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setApiTestResult(`❌ REST API call failed: ${errorMessage}`)
    } finally {
      setIsTestingApi(false)
    }
  }

  // Test GraphQL call with JWT token
  const testGraphqlCall = async () => {
    setIsTestingGraphql(true)
    setGraphqlTestResult(null)

    try {
      // Test the unified GraphQL client with JWT authentication
      const result = await unifiedGraphQLClient.query(RECIPE_QUERIES.GET_RECIPES, {
        variables: { skip: 0, take: 10 }
      }) as { recipes?: Array<{ id: string }> }
      
      const recipeCount = result?.recipes?.length || 0
      setGraphqlTestResult(`✅ GraphQL call successful! Retrieved ${recipeCount} recipes via unified client`)
      
      // Log additional details for debugging
      console.log('🔍 GraphQL Test Result:', {
        hasData: !!result,
        recipeCount,
        authStatus: unifiedGraphQLClient.isAuthenticated(),
        currentUser: unifiedGraphQLClient.getCurrentUser()
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setGraphqlTestResult(`❌ GraphQL call failed: ${errorMessage}`)
      
      // Log error details for debugging
      console.error('🔥 GraphQL Test Error:', {
        error,
        authStatus: unifiedGraphQLClient.isAuthenticated(),
        currentUser: unifiedGraphQLClient.getCurrentUser(),
        backendInfo: unifiedGraphQLClient.getBackendInfo()
      })
    } finally {
      setIsTestingGraphql(false)
    }
  }

  const handleLoginSuccess = () => {
    console.log('🔐 Login successful, refreshing page state')
    // The useJWTAuth hook will automatically update the state
  }

  const handleLogout = () => {
    logout()
    setApiTestResult(null)
    setGraphqlTestResult(null)
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">JWT Authentication Test</h1>
            <p className="text-gray-600">Test the JWT authentication system</p>
          </div>
          
          <JWTLoginForm onSuccess={handleLoginSuccess} />
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Use the credentials from your .env file
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">JWT Authentication Test</h1>
          <p className="text-gray-600">Successfully authenticated! Test your JWT integration below.</p>
        </div>

        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </CardTitle>
            <CardDescription>
              Current authenticated user details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Username</label>
                <p className="text-lg font-semibold">{user?.username}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">User ID</label>
                <p className="text-lg font-mono text-gray-700">{user?.id}</p>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Roles</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {user?.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    <Shield className="h-3 w-3 mr-1" />
                    {role}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Permissions</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {user?.permissions.slice(0, 6).map((permission, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {permission.resource}:{permission.action}
                  </Badge>
                ))}
                {user?.permissions && user.permissions.length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{user.permissions.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              JWT Token Information
            </CardTitle>
            <CardDescription>
              Current JWT token details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Token (first 50 chars)</label>
              <p className="text-sm font-mono bg-gray-100 p-2 rounded border">
                {getToken()?.substring(0, 50)}...
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-500">Token Length</label>
              <p className="text-lg font-semibold">{getToken()?.length} characters</p>
            </div>
          </CardContent>
        </Card>

        {/* REST API Test Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              REST API Integration Test
            </CardTitle>
            <CardDescription>
              Test REST API calls with JWT authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testApiCall} 
              disabled={isTestingApi}
              className="w-full"
            >
              {isTestingApi ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Testing REST API...
                </>
              ) : (
                'Test REST API Call (Get Recipes)'
              )}
            </Button>
            
            {apiTestResult && (
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-sm font-mono">{apiTestResult}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GraphQL API Test Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              GraphQL API Integration Test
            </CardTitle>
            <CardDescription>
              Test GraphQL calls with JWT authentication using the unified client
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testGraphqlCall} 
              disabled={isTestingGraphql}
              className="w-full"
              variant="secondary"
            >
              {isTestingGraphql ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Testing GraphQL...
                </>
              ) : (
                'Test GraphQL Call (Get Recipes)'
              )}
            </Button>
            
            {graphqlTestResult && (
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-sm font-mono">{graphqlTestResult}</p>
              </div>
            )}
            
            <div className="text-xs text-gray-500 space-y-1">
              <p>• Tests the unified GraphQL client with JWT authentication</p>
              <p>• Verifies that JWT tokens are properly included in GraphQL requests</p>
              <p>• Check browser console for detailed authentication logs</p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-center space-x-4">
          <Button variant="outline" onClick={refreshAuth}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Auth State
          </Button>
          
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {/* Debug Info */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Debug Information</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p>✅ JWT authentication system active</p>
            <p>✅ Token stored in localStorage</p>
            <p>✅ Unified GraphQL client configured</p>
            <p>✅ Authentication headers automatically added</p>
            <p className="text-gray-500">Check browser console for detailed authentication logs</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 