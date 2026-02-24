import { useEffect, useState, useCallback, useRef } from 'react'
import { useWebSocket } from '@/lib/websocket/websocket-client'

export interface UseWebSocketConnectionOptions {
  autoConnect?: boolean
  reconnectOnMount?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
}

export function useWebSocketConnection(options: UseWebSocketConnectionOptions = {}) {
  const {
    autoConnect = true,
    reconnectOnMount = true,
    onConnect,
    onDisconnect,
    onError
  } = options

  const [connectionState, setConnectionState] = useState<string>('disconnected')
  const [isConnecting, setIsConnecting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const ws = useWebSocket()
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update connection state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const newState = ws.getConnectionState()
      setConnectionState(newState)
    }, 1000)

    return () => clearInterval(interval)
  }, [ws])

  const connect = useCallback(async () => {
    if (isConnecting || ws.isConnected()) {
      return
    }

    setIsConnecting(true)
    setLastError(null)

    try {
      await ws.connect()
      setConnectionState('connected')
      onConnect?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      setLastError(errorMessage)
      onError?.(error as Event)
    } finally {
      setIsConnecting(false)
    }
  }, [ws, isConnecting, onConnect, onError])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    ws.disconnect()
    setConnectionState('disconnected')
    onDisconnect?.()
  }, [ws, onDisconnect])

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (ws.isConnected()) {
      ws.send(message)
      return true
    }
    return false
  }, [ws])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [autoConnect, connect])

  // Reconnect on mount if previously connected
  useEffect(() => {
    if (reconnectOnMount && !ws.isConnected()) {
      const timeout = setTimeout(() => {
        connect()
      }, 1000)

      reconnectTimeoutRef.current = timeout

      return () => clearTimeout(timeout)
    }
  }, [reconnectOnMount, ws, connect])

  // Listen for production alerts
  useEffect(() => {
    const handleProductionAlert = (event: CustomEvent) => {
      console.log('Production alert received:', event.detail)
      // Could integrate with a notification system here
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('production-alert', handleProductionAlert as EventListener)
      
      return () => {
        window.removeEventListener('production-alert', handleProductionAlert as EventListener)
      }
    }
  }, [])

  return {
    connectionState,
    isConnected: ws.isConnected(),
    isConnecting,
    lastError,
    connect,
    disconnect,
    sendMessage
  }
} 