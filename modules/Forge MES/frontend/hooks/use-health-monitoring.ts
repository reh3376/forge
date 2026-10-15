'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useHealthSocket, HealthData } from '@/lib/websocket/health-socket-client'

export interface HealthStatus {
  status: 'up' | 'down' | 'degraded' | 'unknown'
  lastUpdated: Date | null
  responseTime: number | null
  database: {
    status: 'up' | 'down' | 'degraded' | 'unknown'
    responseTime: number | null
    connection: 'active' | 'inactive' | 'unknown'
  }
  api: {
    status: 'up' | 'down' | 'degraded' | 'unknown'
    responseTime: number | null
    endpoints: Array<{
      name: string
      status: 'up' | 'down' | 'degraded' | 'unknown'
      responseTime: number | null
    }>
  }
  version: string | null
  environment: string | null
  socketConnected: boolean
  socketState: string
  error: string | null
}

export interface UseHealthMonitoringOptions {
  autoConnect?: boolean
  enablePolling?: boolean
  pollingInterval?: number
  onHealthUpdate?: (data: HealthData) => void
  onConnectionChange?: (connected: boolean) => void
  onError?: (error: string) => void
}

export function useHealthMonitoring(options: UseHealthMonitoringOptions = {}) {
  const {
    autoConnect = true,
    enablePolling = false,
    pollingInterval = 30000, // 30 seconds
    onHealthUpdate,
    onConnectionChange,
    onError
  } = options

  const healthSocket = useHealthSocket()
  const [healthStatus, setHealthStatus] = useState<HealthStatus>({
    status: 'unknown',
    lastUpdated: null,
    responseTime: null,
    database: {
      status: 'unknown',
      responseTime: null,
      connection: 'unknown'
    },
    api: {
      status: 'unknown',
      responseTime: null,
      endpoints: []
    },
    version: null,
    environment: null,
    socketConnected: false,
    socketState: 'disconnected',
    error: null
  })

  const [isConnecting, setIsConnecting] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle health data updates
  const handleHealthUpdate = useCallback((data: HealthData) => {
    setHealthStatus(prev => ({
      ...prev,
      status: data.status,
      lastUpdated: new Date(data.timestamp),
      responseTime: data.details.responseTime,
      database: {
        status: data.details.database.status,
        responseTime: data.details.database.responseTime,
        connection: data.details.database.connection
      },
      api: {
        status: data.details.api.status,
        responseTime: data.details.api.responseTime,
        endpoints: data.details.api.endpoints.map(endpoint => ({
          name: endpoint.name,
          status: endpoint.status,
          responseTime: endpoint.responseTime
        }))
      },
      version: data.details.version,
      environment: data.details.environment,
      error: null
    }))

    // Call external callback if provided
    onHealthUpdate?.(data)
  }, [onHealthUpdate])

  // Handle connection status changes
  const handleConnectionChange = useCallback((connected: boolean) => {
    setHealthStatus(prev => ({
      ...prev,
      socketConnected: connected,
      socketState: healthSocket.getConnectionState(),
      error: connected ? null : prev.error
    }))

    // Call external callback if provided
    onConnectionChange?.(connected)
  }, [healthSocket, onConnectionChange])

  // Handle errors
  const handleError = useCallback((error: string) => {
    setHealthStatus(prev => ({
      ...prev,
      error,
      socketState: healthSocket.getConnectionState()
    }))

    // Call external callback if provided
    onError?.(error)
  }, [healthSocket, onError])

  // Connect to health socket
  const connect = useCallback(async () => {
    if (isConnecting || healthSocket.isConnected()) {
      return
    }

    setIsConnecting(true)
    try {
      await healthSocket.connect()
    } catch (error) {
      console.error('Failed to connect to health socket:', error)
      handleError(error instanceof Error ? error.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }, [healthSocket, isConnecting, handleError])

  // Disconnect from health socket
  const disconnect = useCallback(() => {
    healthSocket.disconnect()
    
    // Clear polling if active
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [healthSocket])

  // Request immediate health update
  const requestHealthUpdate = useCallback(() => {
    healthSocket.requestHealthUpdate()
  }, [healthSocket])

  // Start polling for health updates
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(() => {
      if (healthSocket.isConnected()) {
        requestHealthUpdate()
      }
    }, pollingInterval)
  }, [healthSocket, requestHealthUpdate, pollingInterval])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  // Setup socket event listeners
  useEffect(() => {
    const unsubscribeHealth = healthSocket.onHealthUpdate(handleHealthUpdate)
    const unsubscribeConnection = healthSocket.onConnectionChange(handleConnectionChange)
    const unsubscribeError = healthSocket.onError(handleError)

    return () => {
      unsubscribeHealth()
      unsubscribeConnection()
      unsubscribeError()
    }
  }, [healthSocket, handleHealthUpdate, handleConnectionChange, handleError])

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  // Setup polling if enabled
  useEffect(() => {
    if (enablePolling && healthStatus.socketConnected) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => {
      stopPolling()
    }
  }, [enablePolling, healthStatus.socketConnected, startPolling, stopPolling])

  // Update socket state periodically
  useEffect(() => {
    const updateSocketState = () => {
      setHealthStatus(prev => ({
        ...prev,
        socketState: healthSocket.getConnectionState(),
        socketConnected: healthSocket.isConnected()
      }))
    }

    const interval = setInterval(updateSocketState, 1000)
    return () => clearInterval(interval)
  }, [healthSocket])

  return {
    // Health status data
    healthStatus,
    
    // Connection state
    isConnecting,
    isConnected: healthStatus.socketConnected,
    connectionState: healthStatus.socketState,
    
    // Actions
    connect,
    disconnect,
    requestHealthUpdate,
    startPolling,
    stopPolling,
    
    // Utilities
    getLastUpdateAge: () => {
      if (!healthStatus.lastUpdated) return null
      return Date.now() - healthStatus.lastUpdated.getTime()
    },
    
    isHealthy: () => healthStatus.status === 'up',
    isDegraded: () => healthStatus.status === 'degraded',
    isDown: () => healthStatus.status === 'down',
    
    // Raw socket access (for advanced usage)
    socket: healthSocket
  }
} 