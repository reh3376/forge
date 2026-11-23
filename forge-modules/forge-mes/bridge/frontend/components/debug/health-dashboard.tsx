'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHealthWebSocket } from '@/lib/hooks/use-health-websocket'
import { 
  Activity, 
  Database, 
  Server, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  MemoryStick,
  Zap,
  Globe
} from 'lucide-react'

export function HealthDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  
  // Socket.IO health monitoring
  const {
    connectionState,
    isConnected,
    isConnecting,
    lastError,
    currentHealth,
    lastUpdated,
    connect,
    disconnect,
    resetConnection,
    reconnectAttempts,
    maxReconnectAttempts,
    canReconnect
  } = useHealthWebSocket({
    autoConnect: true,
    maxReconnectAttempts: 3,
    onHealthUpdate: (health) => {
      console.log('Health update received:', health)
    },
    onError: (error) => {
      console.warn('Socket.IO health monitoring error:', error)
    }
  })

  // Calculate metrics from current health data
  const currentMetrics = currentHealth ? {
    isHealthy: currentHealth.status === 'ok',
    isDatabaseHealthy: currentHealth.database.status === 'up',
    isApiHealthy: currentHealth.api.status === 'up',
    memoryUsagePercent: Math.round((currentHealth.memory.used / currentHealth.memory.total) * 100),
    uptimeHours: Math.round(currentHealth.uptime / 3600 * 100) / 100,
    databaseResponseTime: currentHealth.database.details?.responseTime,
    apiVersion: currentHealth.api.details?.version,
    environment: currentHealth.api.details?.environment
  } : null

  const getStatusColor = (status: 'up' | 'down' | 'ok' | 'error') => {
    switch (status) {
      case 'up':
      case 'ok':
        return 'text-green-600'
      case 'down':
      case 'error':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: 'up' | 'down' | 'ok' | 'error') => {
    switch (status) {
      case 'up':
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'down':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    }
  }

  const getConnectionStatusBadge = () => {
    if (isConnected) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Real-time Connected</Badge>
    } else if (isConnecting) {
      return <Badge variant="secondary">Connecting...</Badge>
    } else if (reconnectAttempts >= maxReconnectAttempts) {
      return <Badge variant="destructive">Connection Failed</Badge>
    } else {
      return <Badge variant="outline">Socket.IO Disconnected</Badge>
    }
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const handleRetryConnection = () => {
    if (!isConnected && canReconnect) {
      resetConnection()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Health Dashboard
              </CardTitle>
              <CardDescription>
                Real-time monitoring of system components and performance via Socket.IO
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getConnectionStatusBadge()}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryConnection}
                disabled={isConnecting || isConnected}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isConnecting ? 'animate-spin' : ''}`} />
                Retry Connection
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Overall Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Status</p>
                <p className={`text-lg font-semibold ${getStatusColor(currentHealth?.status || 'error')}`}>
                  {currentHealth?.status === 'ok' ? 'Healthy' : 'Issues Detected'}
                </p>
              </div>
              {getStatusIcon(currentHealth?.status || 'error')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Database</p>
                <p className={`text-lg font-semibold ${getStatusColor(currentHealth?.database.status || 'down')}`}>
                  {currentHealth?.database.status === 'up' ? 'Connected' : 'Disconnected'}
                </p>
                {currentMetrics?.databaseResponseTime && (
                  <p className="text-xs text-muted-foreground">{currentMetrics.databaseResponseTime}</p>
                )}
              </div>
              <Database className={`h-5 w-5 ${getStatusColor(currentHealth?.database.status || 'down')}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">API Service</p>
                <p className={`text-lg font-semibold ${getStatusColor(currentHealth?.api.status || 'down')}`}>
                  {currentHealth?.api.status === 'up' ? 'Running' : 'Down'}
                </p>
                {currentMetrics?.apiVersion && (
                  <p className="text-xs text-muted-foreground">v{currentMetrics.apiVersion}</p>
                )}
              </div>
              <Server className={`h-5 w-5 ${getStatusColor(currentHealth?.api.status || 'down')}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Memory Usage</p>
                <p className="text-lg font-semibold">
                  {currentMetrics?.memoryUsagePercent || 0}%
                </p>
                {currentHealth?.memory && (
                  <p className="text-xs text-muted-foreground">
                    {currentHealth.memory.used}MB / {currentHealth.memory.total}MB
                  </p>
                )}
              </div>
              <MemoryStick className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="api">API Service</TabsTrigger>
          <TabsTrigger value="websocket">Socket.IO</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Uptime:</span>
                    <span className="text-sm">
                      {currentHealth?.uptime ? formatUptime(currentHealth.uptime) : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Environment:</span>
                    <Badge variant="outline">{currentMetrics?.environment || 'Unknown'}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Last Updated:</span>
                    <span className="text-sm">
                      {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Data Source:</span>
                    <Badge variant={isConnected ? "default" : "secondary"}>
                      {isConnected ? 'Socket.IO (Real-time)' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Connection:</span>
                    <Badge variant={isConnected ? "default" : "outline"}>
                      {connectionState}
                    </Badge>
                  </div>
                  {lastError && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-600">Error:</span>
                      <span className="text-sm text-red-600">{lastError}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentHealth?.database ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(currentHealth.database.status)}
                    <span className="font-medium">Status:</span>
                    <Badge variant={currentHealth.database.status === 'up' ? 'default' : 'destructive'}>
                      {currentHealth.database.status}
                    </Badge>
                  </div>
                  
                  {currentHealth.database.details && (
                    <div className="space-y-2">
                      {currentHealth.database.details.responseTime && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Response Time: {currentHealth.database.details.responseTime}</span>
                        </div>
                      )}
                      {currentHealth.database.details.connection && (
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Connection: {currentHealth.database.details.connection}</span>
                        </div>
                      )}
                      {currentHealth.database.details.error && (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-sm text-red-600">Error: {currentHealth.database.details.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Last checked: {new Date(currentHealth.database.timestamp).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">No database health data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                API Service Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentHealth?.api ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(currentHealth.api.status)}
                    <span className="font-medium">Status:</span>
                    <Badge variant={currentHealth.api.status === 'up' ? 'default' : 'destructive'}>
                      {currentHealth.api.status}
                    </Badge>
                  </div>
                  
                  {currentHealth.api.details && (
                    <div className="space-y-2">
                      {currentHealth.api.details.version && (
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Version: {currentHealth.api.details.version}</span>
                        </div>
                      )}
                      {currentHealth.api.details.environment && (
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Environment: {currentHealth.api.details.environment}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Last checked: {new Date(currentHealth.api.timestamp).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">No API health data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="websocket" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                Socket.IO Connection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">Connection Status:</span>
                  <Badge variant={isConnected ? 'default' : 'destructive'}>
                    {connectionState}
                  </Badge>
                </div>
                
                {reconnectAttempts > 0 && (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Reconnect Attempts: {reconnectAttempts}</span>
                  </div>
                )}
                
                {lastError && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-600">Error: {lastError}</span>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={connect}
                    disabled={isConnected || isConnecting}
                  >
                    Connect
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnect}
                    disabled={!isConnected}
                  >
                    Disconnect
                  </Button>
                </div>
                
                {lastUpdated && (
                  <div className="text-xs text-muted-foreground">
                    Last update: {lastUpdated.toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 