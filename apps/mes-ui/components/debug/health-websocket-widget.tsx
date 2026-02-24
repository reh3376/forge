'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useHealthMonitoring } from '@/hooks/use-health-monitoring'
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Database, 
  Server, 
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface HealthWebSocketWidgetProps {
  showDetails?: boolean
  compact?: boolean
  autoConnect?: boolean
  enablePolling?: boolean
  pollingInterval?: number
}

export function HealthWebSocketWidget({ 
  showDetails = false, 
  compact = false,
  autoConnect = true,
  enablePolling = false,
  pollingInterval = 30000
}: HealthWebSocketWidgetProps) {
  const {
    healthStatus,
    isConnecting,
    isConnected,
    connectionState,
    connect,
    disconnect,
    requestHealthUpdate,
    getLastUpdateAge
  } = useHealthMonitoring({
    autoConnect,
    enablePolling,
    pollingInterval,
    onHealthUpdate: (data) => {
      console.log('🔄 Health update received:', data)
    },
    onConnectionChange: (connected) => {
      console.log('🔌 Connection status changed:', connected)
    },
    onError: (error) => {
      console.error('❌ Health monitoring error:', error)
    }
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'down':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'up':
        return <Badge variant="default" className="bg-green-500">Healthy</Badge>
      case 'degraded':
        return <Badge variant="secondary" className="bg-yellow-500">Degraded</Badge>
      case 'down':
        return <Badge variant="destructive">Down</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const formatResponseTime = (time: number | null) => {
    if (time === null) return 'N/A'
    return `${time}ms`
  }

  const formatLastUpdate = () => {
    const age = getLastUpdateAge()
    if (age === null) return 'Never'
    
    const seconds = Math.floor(age / 1000)
    if (seconds < 60) return `${seconds}s ago`
    
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  if (compact) {
    return (
      <div className="flex items-center space-x-2 p-2 border rounded">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500" />
        )}
        {getStatusIcon(healthStatus.status)}
        <span className="text-sm font-medium">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {getStatusBadge(healthStatus.status)}
      </div>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
            <CardTitle className="text-lg">WebSocket Health Monitor</CardTitle>
          </div>
          {getStatusBadge(healthStatus.status)}
        </div>
        <CardDescription>
          Real-time health monitoring via Socket.IO
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Connection</div>
            <div className="flex items-center space-x-2">
              <Badge variant={isConnected ? 'default' : 'secondary'}>
                {connectionState}
              </Badge>
              {isConnecting && (
                <RefreshCw className="h-3 w-3 animate-spin" />
              )}
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Last Update</div>
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{formatLastUpdate()}</span>
            </div>
          </div>
        </div>

        {/* System Status */}
        {showDetails && (
          <div className="space-y-3">
            <div className="text-sm font-medium">System Status</div>
            
            {/* Overall Status */}
            <div className="flex items-center justify-between p-2 bg-muted rounded">
              <div className="flex items-center space-x-2">
                <Server className="h-4 w-4" />
                <span className="text-sm">Overall</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(healthStatus.status)}
                <span className="text-sm">{formatResponseTime(healthStatus.responseTime)}</span>
              </div>
            </div>

            {/* Database Status */}
            <div className="flex items-center justify-between p-2 bg-muted rounded">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span className="text-sm">Database</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(healthStatus.database.status)}
                <span className="text-sm">{formatResponseTime(healthStatus.database.responseTime)}</span>
                <Badge variant="outline" className="text-xs">
                  {healthStatus.database.connection}
                </Badge>
              </div>
            </div>

            {/* API Status */}
            <div className="flex items-center justify-between p-2 bg-muted rounded">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm">API</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(healthStatus.api.status)}
                <span className="text-sm">{formatResponseTime(healthStatus.api.responseTime)}</span>
                <Badge variant="outline" className="text-xs">
                  {healthStatus.api.endpoints.length} endpoints
                </Badge>
              </div>
            </div>

            {/* Environment Info */}
            {(healthStatus.environment || healthStatus.version) && (
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {healthStatus.environment && (
                  <div>Env: {healthStatus.environment}</div>
                )}
                {healthStatus.version && (
                  <div>Version: {healthStatus.version}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {healthStatus.error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {healthStatus.error}
          </div>
        )}

        {/* Controls */}
        <div className="flex space-x-2">
          {!isConnected ? (
            <Button 
              onClick={connect} 
              disabled={isConnecting}
              size="sm"
              variant="outline"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          ) : (
            <>
              <Button 
                onClick={disconnect} 
                size="sm"
                variant="outline"
              >
                Disconnect
              </Button>
              <Button 
                onClick={requestHealthUpdate} 
                size="sm"
                variant="outline"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 