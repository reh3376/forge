'use client'

import React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { useHealthMonitoring } from '@/lib/hooks/use-health-monitoring'
import { useHealthWebSocket } from '@/lib/hooks/use-health-websocket'
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Wifi
} from 'lucide-react'

interface HealthIndicatorProps {
  showLabel?: boolean
  showWebSocketStatus?: boolean
  linkToHealthPage?: boolean
  className?: string
}

export function HealthIndicator({ 
  showLabel = false,
  showWebSocketStatus = false,
  linkToHealthPage = true,
  className = ""
}: HealthIndicatorProps) {
  // REST API health monitoring
  const {
    systemHealth: restHealth
  } = useHealthMonitoring({
    autoRefresh: true,
    refreshInterval: 60000 // 1 minute
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

  const getStatusIcon = () => {
    switch (currentHealth?.status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusBadge = () => {
    const variant = currentHealth?.status === 'ok' ? 'default' : 'destructive'
    const text = currentHealth?.status === 'ok' ? 'Healthy' : 'Issues'
    
    return (
      <Badge variant={variant} className="text-xs">
        {text}
      </Badge>
    )
  }

  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusIcon()}
      {showLabel && getStatusBadge()}
      {showWebSocketStatus && wsConnected && (
        <Wifi className="h-3 w-3 text-green-600" />
      )}
    </div>
  )

  if (linkToHealthPage) {
    return (
      <Link 
        href="/debug/health-monitoring" 
        className="hover:opacity-80 transition-opacity"
        title={`System Status: ${currentHealth?.status === 'ok' ? 'Healthy' : 'Issues Detected'}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <div title={`System Status: ${currentHealth?.status === 'ok' ? 'Healthy' : 'Issues Detected'}`}>
      {content}
    </div>
  )
} 