'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useHealthMonitoring } from '@/lib/hooks/use-health-monitoring'
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
  XCircle
} from 'lucide-react'

interface HealthStatusWidgetProps {
  showDetails?: boolean
  showRefreshButton?: boolean
  compact?: boolean
  className?: string
}

export function HealthStatusWidget({ 
  showDetails = false, 
  showRefreshButton = true,
  compact = false,
  className = ""
}: HealthStatusWidgetProps) {
  // REST API health monitoring
  const {
    systemHealth: restHealth,
    loading: restLoading,
    refreshHealth
  } = useHealthMonitoring({
    autoRefresh: true,
    refreshInterval: 60000 // 1 minute for widget
  })

  // WebSocket health monitoring
  const {
    isConnected: wsConnected,
    currentHealth: wsHealth
  } = useHealthWebSocket({
    autoConnect: true
  })

  // Use WebSocket data if available, fallback to REST data
  const currentHealth = wsHealth || restHealth

  const getStatusIcon = (status: 'up' | 'down' | 'ok' | 'error' | undefined) => {
    switch (status) {
      case 'up':
      case 'ok':
        return <CheckCircle className="h-3 w-3 text-green-600" />
      case 'down':
      case 'error':
        return <XCircle className="h-3 w-3 text-red-600" />
      default:
        return <AlertTriangle className="h-3 w-3 text-yellow-600" />
    }
  }

  const getStatusColor = (status: 'up' | 'down' | 'ok' | 'error' | undefined) => {
    switch (status) {
      case 'up':
      case 'ok':
        return 'text-green-600'
      case 'down':
      case 'error':
        return 'text-red-600'
      default:
        return 'text-yellow-600'
    }
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1">
          {getStatusIcon(currentHealth?.status)}
          <span className={`text-xs font-medium ${getStatusColor(currentHealth?.status)}`}>
            {currentHealth?.status === 'ok' ? 'Healthy' : 'Issues'}
          </span>
        </div>
        {wsConnected && (
          <Badge variant="outline" className="text-xs px-1 py-0">
            Live
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">System Health</span>
            </div>
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <Wifi className="h-3 w-3 text-green-600" />
              ) : (
                <WifiOff className="h-3 w-3 text-gray-400" />
              )}
              {showRefreshButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshHealth}
                  disabled={restLoading}
                  className="h-6 w-6 p-0"
                >
                  <RefreshCw className={`h-3 w-3 ${restLoading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>

          {/* Status Overview */}
          <div className="flex items-center gap-2">
            {getStatusIcon(currentHealth?.status)}
            <span className={`text-sm font-medium ${getStatusColor(currentHealth?.status)}`}>
              {currentHealth?.status === 'ok' ? 'System Healthy' : 'System Issues Detected'}
            </span>
            {wsConnected && (
              <Badge variant="outline" className="text-xs">
                Real-time
              </Badge>
            )}
          </div>

          {/* Detailed Status */}
          {showDetails && currentHealth && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  <span>Database</span>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(currentHealth.database.status)}
                  <span className={getStatusColor(currentHealth.database.status)}>
                    {currentHealth.database.status}
                  </span>
                  {currentHealth.database.details?.responseTime && (
                    <span className="text-muted-foreground">
                      ({currentHealth.database.details.responseTime})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>API Service</span>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(currentHealth.api.status)}
                  <span className={getStatusColor(currentHealth.api.status)}>
                    {currentHealth.api.status}
                  </span>
                  {currentHealth.api.details?.version && (
                    <span className="text-muted-foreground">
                      (v{currentHealth.api.details.version})
                    </span>
                  )}
                </div>
              </div>

              {currentHealth.memory && (
                <div className="flex items-center justify-between text-xs">
                  <span>Memory Usage</span>
                  <span className="text-muted-foreground">
                    {Math.round((currentHealth.memory.used / currentHealth.memory.total) * 100)}%
                  </span>
                </div>
              )}

              {currentHealth.uptime && (
                <div className="flex items-center justify-between text-xs">
                  <span>Uptime</span>
                  <span className="text-muted-foreground">
                    {Math.round(currentHealth.uptime / 3600)}h
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 