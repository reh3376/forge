'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { getAuthHeaders } from '@/lib/auth-utils'

export default function AuthTestSimplePage() {
  const [results, setResults] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const { isAuthenticated, user, devMode } = useAuth()

  const addToResults = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setResults(prev => `[${timestamp}] ${message}\n${prev}`)
  }

  const testAuthHeaders = async () => {
    setLoading(true)
    try {
      addToResults('🔐 Testing auth headers...')
      
      const headers = await getAuthHeaders()
      addToResults(`📋 Auth headers: ${JSON.stringify(headers, null, 2)}`)
      
      addToResults(`👤 Auth state: authenticated=${isAuthenticated}, user=${user?.name || 'none'}`)
      addToResults(`🛠️ Dev mode: enabled=${devMode.isEnabled}`)
      
    } catch (error) {
      addToResults(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const testGraphQLProxy = async () => {
    setLoading(true)
    try {
      addToResults('🔍 Testing GraphQL proxy...')
      
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '{ __typename }'
        })
      })
      
      const result = await response.text()
      addToResults(`📡 GraphQL response (${response.status}): ${result.substring(0, 200)}...`)
      
    } catch (error) {
      addToResults(`❌ GraphQL Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const testRESTProxy = async () => {
    setLoading(true)
    try {
      addToResults('🔍 Testing REST proxy...')
      
      const response = await fetch('/api/rest/scheduleOrderQueues/test', {
        method: 'GET'
      })
      
      const result = await response.text()
      addToResults(`📡 REST response (${response.status}): ${result.substring(0, 200)}...`)
      
    } catch (error) {
      addToResults(`❌ REST Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const signInDemo = () => {
    addToResults('🔑 Signing in with demo user...')
    devMode.signInWithDemoUser()
    addToResults('✅ Demo sign-in completed')
  }

  const clearResults = () => {
    setResults('')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-3xl font-bold">Authentication Test - Simple</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
          <CardDescription>Current authentication state and demo controls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between">
              <span>Authenticated</span>
              <span className={`px-2 py-1 rounded text-xs ${isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {isAuthenticated ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>User</span>
              <span className="text-sm">{user?.name || 'None'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Dev Mode</span>
              <span className={`px-2 py-1 rounded text-xs ${devMode.isEnabled ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                {devMode.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button onClick={testAuthHeaders} disabled={loading}>
              Test Auth Headers
            </Button>
            <Button onClick={testGraphQLProxy} disabled={loading}>
              Test GraphQL Proxy
            </Button>
            <Button onClick={testRESTProxy} disabled={loading}>
              Test REST Proxy
            </Button>
            <Button onClick={clearResults} variant="outline" disabled={loading}>
              Clear Results
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>Real-time test output and authentication debugging</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={results}
            readOnly
            className="min-h-[400px] font-mono text-sm"
            placeholder="Test results will appear here..."
          />
        </CardContent>
      </Card>
    </div>
  )
} 