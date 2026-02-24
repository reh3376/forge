'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHealthMonitoring } from '@/lib/hooks/use-health-monitoring'
import { 
  Activity, 
  Database, 
  Server, 
  Zap, 
  Heart,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  RefreshCw
} from 'lucide-react'

interface EndpointTestResult {
  endpoint: string
  status: number
  statusText: string
  data?: unknown
  error?: string
  responseTime: number
  timestamp: Date
}

export function HealthEndpointTester() {
  const [testResults, setTestResults] = useState<Record<string, EndpointTestResult>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  
  useHealthMonitoring({ autoRefresh: false })

  // Use the backend API URL from environment variables
  const baseUrl = process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api'
  
  const endpoints = [
    { key: 'complete', path: `${baseUrl}/_health`, name: 'Complete System Health', icon: Activity },
    { key: 'database', path: `${baseUrl}/_health/db`, name: 'Database Health', icon: Database },
    { key: 'api', path: `${baseUrl}/_health/api`, name: 'API Service Health', icon: Server },
    { key: 'liveness', path: `${baseUrl}/_health/live`, name: 'Liveness Probe', icon: Heart },
    { key: 'readiness', path: `${baseUrl}/_health/ready`, name: 'Readiness Probe', icon: Zap }
  ]

  const testEndpoint = async (endpoint: { key: string; path: string; name: string }) => {
    setLoading(prev => ({ ...prev, [endpoint.key]: true }))
    
    const startTime = Date.now()
    
    try {
      const response = await fetch(endpoint.path)
      const endTime = Date.now()
      const responseTime = endTime - startTime
      
      let data = null
      const contentType = response.headers.get('content-type')
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          // Response might be empty for liveness/readiness checks
          data = null
        }
      }
      
      const result: EndpointTestResult = {
        endpoint: endpoint.path,
        status: response.status,
        statusText: response.statusText,
        data,
        responseTime,
        timestamp: new Date()
      }
      
      setTestResults(prev => ({ ...prev, [endpoint.key]: result }))
    } catch (error) {
      const endTime = Date.now()
      const responseTime = endTime - startTime
      
      const result: EndpointTestResult = {
        endpoint: endpoint.path,
        status: 0,
        statusText: 'Network Error',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
        timestamp: new Date()
      }
      
      setTestResults(prev => ({ ...prev, [endpoint.key]: result }))
    } finally {
      setLoading(prev => ({ ...prev, [endpoint.key]: false }))
    }
  }

  const testAllEndpoints = async () => {
    for (const endpoint of endpoints) {
      await testEndpoint(endpoint)
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  const copyToClipboard = async (data: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>
    } else if (status >= 400 && status < 500) {
      return <Badge variant="destructive">Client Error</Badge>
    } else if (status >= 500) {
      return <Badge variant="destructive">Server Error</Badge>
    } else if (status === 0) {
      return <Badge variant="secondary">Network Error</Badge>
    } else {
      return <Badge variant="outline">{status}</Badge>
    }
  }

  const getStatusIcon = (status: number) => {
    if (status >= 200 && status < 300) {
      return <CheckCircle className="h-4 w-4 text-green-600" />
    } else {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Health Endpoint Tester
          </CardTitle>
          <CardDescription>
            Test individual health endpoints to verify backend connectivity and responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={testAllEndpoints} disabled={Object.values(loading).some(Boolean)}>
              {Object.values(loading).some(Boolean) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Test All Endpoints
            </Button>
            {endpoints.map(endpoint => (
              <Button
                key={endpoint.key}
                variant="outline"
                onClick={() => testEndpoint(endpoint)}
                disabled={loading[endpoint.key]}
              >
                {loading[endpoint.key] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <endpoint.icon className="h-4 w-4 mr-2" />
                {endpoint.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {Object.keys(testResults).length > 0 && (
        <Tabs defaultValue={Object.keys(testResults)[0] || 'complete'}>
          <TabsList className="grid w-full grid-cols-5">
            {endpoints.map(endpoint => (
              <TabsTrigger 
                key={endpoint.key} 
                value={endpoint.key}
                disabled={!testResults[endpoint.key]}
              >
                <endpoint.icon className="h-4 w-4 mr-1" />
                {endpoint.key}
              </TabsTrigger>
            ))}
          </TabsList>

          {endpoints.map(endpoint => {
            const result = testResults[endpoint.key]
            if (!result) return null

            return (
              <TabsContent key={endpoint.key} value={endpoint.key}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <endpoint.icon className="h-5 w-5" />
                        {endpoint.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(result.status)}
                        {getStatusBadge(result.status)}
                      </div>
                    </div>
                    <CardDescription>
                      {endpoint.path} • {result.responseTime}ms • {result.timestamp.toLocaleTimeString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Response Details</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>Status Code:</span>
                            <span className="font-mono">{result.status}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Status Text:</span>
                            <span className="font-mono">{result.statusText}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Response Time:</span>
                            <span className="font-mono">{result.responseTime}ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Timestamp:</span>
                            <span className="font-mono">{result.timestamp.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Actions</h4>
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testEndpoint(endpoint)}
                            disabled={loading[endpoint.key]}
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading[endpoint.key] ? 'animate-spin' : ''}`} />
                            Retest
                          </Button>
                          {(result.data || result.error) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(result.data || result.error)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Response
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {result.error && (
                      <div>
                        <h4 className="font-medium mb-2 text-red-600">Error</h4>
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <pre className="text-sm text-red-800 whitespace-pre-wrap">
                            {result.error}
                          </pre>
                        </div>
                      </div>
                    )}

                    {result.data && (
                      <div>
                        <h4 className="font-medium mb-2">Response Data</h4>
                        <div className="bg-muted rounded p-3 max-h-96 overflow-auto">
                          <pre className="text-sm whitespace-pre-wrap">
                            {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {!result.data && !result.error && result.status >= 200 && result.status < 300 && (
                      <div>
                        <h4 className="font-medium mb-2">Response Data</h4>
                        <div className="bg-muted rounded p-3">
                          <p className="text-sm text-muted-foreground">
                            No response body (typical for liveness/readiness probes)
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )
          })}
        </Tabs>
      )}
    </div>
  )
} 