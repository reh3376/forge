'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Server, 
  Database, 
  Wifi, 
  Globe,
  Settings,
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { getBackendInfo } from '@/config/backend'

export function BackendConfigDebug() {
  const backendInfo = getBackendInfo()
  const { config, isExternal, healthEndpoints, environment } = backendInfo

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Backend Configuration Debug
        </CardTitle>
        <CardDescription>
          Current backend configuration and connection details
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration Overview */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Configuration Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Configuration:</span>
                <Badge variant={isExternal ? "default" : "secondary"}>
                  {config.name}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Environment:</span>
                <Badge variant="outline">{environment}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">External Backend:</span>
                {isExternal ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>
        </div>

        {/* Endpoint URLs */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Endpoint URLs</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Server className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">API URL</div>
                <code className="text-xs text-muted-foreground">{config.apiUrl}</code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(config.apiUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">GraphQL URL</div>
                <code className="text-xs text-muted-foreground">{config.graphqlUrl}</code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(config.graphqlUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">WebSocket URL</div>
                <code className="text-xs text-muted-foreground">{config.websocketUrl}</code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(config.websocketUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Health Endpoints */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Health Check Endpoints</h3>
          <div className="space-y-2">
            {healthEndpoints.map((endpoint, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                <Globe className="h-3 w-3 text-muted-foreground" />
                <code className="text-xs flex-1">{endpoint}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(endpoint, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Variables */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Environment Variables</h3>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">NEXT_PUBLIC_BACKEND_CONFIG:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {process.env['NEXT_PUBLIC_BACKEND_CONFIG'] || 'not set (using default)'}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">NEXT_PUBLIC_MES_API_URL:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {process.env['NEXT_PUBLIC_MES_API_URL'] || 'not set'}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">NEXT_PUBLIC_MES_GRAPHQL_URL:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {process.env['NEXT_PUBLIC_MES_GRAPHQL_URL'] || 'not set'}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">NEXT_PUBLIC_SOCKET_URL:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {process.env['NEXT_PUBLIC_SOCKET_URL'] || 'not set'}
              </code>
            </div>
          </div>
        </div>

        {/* Configuration Instructions */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Quick Configuration</h3>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Backend Required:</strong> Configure your MES backend connection in <code>.env.local</code>:
            </p>
            <pre className="text-xs bg-blue-100 p-2 rounded overflow-x-auto">
{`# Default configuration (local_mes)
NEXT_PUBLIC_BACKEND_CONFIG=local_mes
NEXT_PUBLIC_MES_API_URL=http://localhost:8000/api
NEXT_PUBLIC_MES_GRAPHQL_URL=http://localhost:8000/graphql
NEXT_PUBLIC_SOCKET_URL=http://localhost:8001`}
            </pre>
            <p className="text-xs text-blue-600 mt-2">
              Ensure your MES backend is running, then restart the Next.js development server.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 