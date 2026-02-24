'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'checking' | 'unknown'
  message: string
  details?: Record<string, unknown>
}

export function BackendHealthCheck() {
  const [graphqlHealth, setGraphqlHealth] = useState<HealthStatus>({ status: 'unknown', message: 'Not checked' })
  const [restHealth, setRestHealth] = useState<HealthStatus>({ status: 'unknown', message: 'Not checked' })

  const checkGraphQLHealth = async () => {
    setGraphqlHealth({ status: 'checking', message: 'Checking...' })
    
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { __typename }`
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.data) {
          setGraphqlHealth({ 
            status: 'healthy', 
            message: 'GraphQL endpoint is responding',
            details: data as Record<string, unknown>
          })
        } else if (data.errors) {
          setGraphqlHealth({ 
            status: 'unhealthy', 
            message: `GraphQL errors: ${data.errors.map((e: { message: string }) => e.message).join(', ')}`,
            details: data.errors
          })
        }
      } else {
        setGraphqlHealth({ 
          status: 'unhealthy', 
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText }
        })
      }
    } catch (error) {
      setGraphqlHealth({ 
        status: 'unhealthy', 
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error instanceof Error ? { message: error.message, name: error.name } : { error: String(error) }
      })
    }
  }

  const checkRESTHealth = async () => {
    setRestHealth({ status: 'checking', message: 'Checking...' })
    
    try {
      const response = await fetch('/api/_health/live')
      
      if (response.ok) {
        const data = await response.json()
        setRestHealth({ 
          status: 'healthy', 
          message: 'REST API is responding',
          details: data as Record<string, unknown>
        })
      } else {
        setRestHealth({ 
          status: 'unhealthy', 
          message: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText }
        })
      }
    } catch (error) {
      setRestHealth({ 
        status: 'unhealthy', 
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error instanceof Error ? { message: error.message, name: error.name } : { error: String(error) }
      })
    }
  }

  const getStatusIcon = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'checking':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-100 text-green-800">Healthy</Badge>
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>
      case 'checking':
        return <Badge variant="secondary">Checking...</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Backend Health Check</CardTitle>
          <CardDescription>
            Check the connectivity and health of backend services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GraphQL Health */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getStatusIcon(graphqlHealth.status)}
              <div>
                <div className="font-medium">GraphQL API</div>
                <div className="text-sm text-muted-foreground">{graphqlHealth.message}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusBadge(graphqlHealth.status)}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={checkGraphQLHealth}
                disabled={graphqlHealth.status === 'checking'}
              >
                Test
              </Button>
            </div>
          </div>

          {/* REST Health */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              {getStatusIcon(restHealth.status)}
              <div>
                <div className="font-medium">REST API</div>
                <div className="text-sm text-muted-foreground">{restHealth.message}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusBadge(restHealth.status)}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={checkRESTHealth}
                disabled={restHealth.status === 'checking'}
              >
                Test
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2 pt-2">
            <Button 
              size="sm" 
              onClick={() => {
                checkGraphQLHealth()
                checkRESTHealth()
              }}
              disabled={graphqlHealth.status === 'checking' || restHealth.status === 'checking'}
            >
              Test All
            </Button>
          </div>

          {/* Debug Information */}
          {(graphqlHealth.details || restHealth.details) && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Debug Details</summary>
              <div className="mt-2 space-y-2">
                {graphqlHealth.details && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">GraphQL Response:</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(graphqlHealth.details, null, 2)}
                    </pre>
                  </div>
                )}
                {restHealth.details && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">REST Response:</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(restHealth.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 