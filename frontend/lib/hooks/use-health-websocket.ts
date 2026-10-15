import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getAuthHeaders } from '../auth-utils'
import { JWTAuthService } from '../auth/jwt-auth'
import { SystemHealth } from './use-health-monitoring'

export interface UseHealthWebSocketOptions {
  autoConnect?: boolean
  reconnectOnMount?: boolean
  onHealthUpdate?: (health: SystemHealth) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: string) => void
  maxReconnectAttempts?: number
  baseReconnectDelay?: number
  maxReconnectDelay?: number
}

export function useHealthWebSocket(options: UseHealthWebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectOnMount = false,
    onHealthUpdate,
    onConnect,
    onDisconnect,
    onError,
    maxReconnectAttempts = 5,
    baseReconnectDelay = 1000,
    maxReconnectDelay = 30000
  } = options

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [isConnecting, setIsConnecting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [currentHealth, setCurrentHealth] = useState<SystemHealth | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const socketRef = useRef<Socket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const isManuallyDisconnected = useRef(false)
  const lastConnectionAttempt = useRef<number>(0)

  const calculateReconnectDelay = useCallback((attempt: number) => {
    const exponentialDelay = Math.min(
      baseReconnectDelay * Math.pow(2, attempt),
      maxReconnectDelay
    )
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5)
    return Math.max(exponentialDelay + jitter, 1000)
  }, [baseReconnectDelay, maxReconnectDelay])

  const getSocketUrl = useCallback(() => {
    if (typeof window === 'undefined') return ''
    
    const socketUrl = process.env['NEXT_PUBLIC_SOCKET_URL'] || 'http://localhost:3001'
    
    // Remove any trailing slashes and paths
    const cleanUrl = socketUrl.replace(/\/+$/, '')
    console.log('Socket.IO URL from env:', socketUrl)
    console.log('Cleaned Socket.IO URL:', cleanUrl)
    return cleanUrl
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    const delay = calculateReconnectDelay(reconnectAttempts.current)
    console.log(`Health Socket.IO: Scheduling reconnect attempt ${reconnectAttempts.current + 1} in ${delay}ms`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttempts.current++
      connect()
    }, delay)
  }, [calculateReconnectDelay])

  const connect = useCallback(async () => {
    if (isConnecting || (socketRef.current && socketRef.current.connected)) {
      return
    }

    // Prevent rapid reconnection attempts
    const now = Date.now()
    if (now - lastConnectionAttempt.current < 1000) {
      console.log('Health Socket.IO: Throttling connection attempt')
      return
    }
    lastConnectionAttempt.current = now

    setIsConnecting(true)
    setConnectionState('connecting')
    isManuallyDisconnected.current = false

    try {
      const socketUrl = getSocketUrl()
      if (!socketUrl) {
        throw new Error('Cannot determine Socket.IO URL')
      }

      // Get authentication headers and token
      const authHeaders = await getAuthHeaders()
      const jwtService = JWTAuthService.getInstance()
      const token = jwtService.getToken()

      console.log('🔐 Health Socket.IO: Preparing authentication', {
        hasToken: !!token,
        hasAuthHeaders: Object.keys(authHeaders).length > 0,
        authHeaders: Object.keys(authHeaders)
      })

      // Create Socket.IO connection with authentication
      console.log(`Health Socket.IO: Attempting to connect to ${socketUrl}/health`)
      console.log('Environment NEXT_PUBLIC_SOCKET_URL:', process.env['NEXT_PUBLIC_SOCKET_URL'])
      
      const socket = io(`${socketUrl}/health`, {
        autoConnect: false,
        reconnection: false, // We handle reconnection manually
        timeout: 10000,
        transports: ['websocket', 'polling'],
        forceNew: true,
        auth: {
          token: token || undefined
        },
        extraHeaders: {
          ...authHeaders,
          ...(token && { authorization: `Bearer ${token}` })
        }
      })
      
      socketRef.current = socket

      socket.on('connect', () => {
        console.log('Health Socket.IO connected with authentication')
        setConnectionState('connected')
        setIsConnecting(false)
        reconnectAttempts.current = 0
        setLastError(null)
        onConnect?.()
      })

      socket.on('health', (healthData: SystemHealth) => {
        try {
          console.log('Health Socket.IO: Received health data:', healthData)
          setCurrentHealth(healthData)
          setLastUpdated(new Date())
          onHealthUpdate?.(healthData)
        } catch (error) {
          console.error('Failed to process health Socket.IO message:', error)
        }
      })

      socket.on('disconnect', (reason) => {
        console.log(`Health Socket.IO disconnected: ${reason}`)
        setConnectionState('disconnected')
        setIsConnecting(false)
        onDisconnect?.()
        
        // Only attempt reconnection for unexpected disconnections
        if (!isManuallyDisconnected.current && 
            reason !== 'io client disconnect' && 
            reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect()
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('Health Socket.IO: Max reconnection attempts reached, giving up')
          setConnectionState('error')
          setLastError('Connection failed after maximum retry attempts')
        }
      })

      socket.on('connect_error', (error) => {
        console.error('Health Socket.IO connection error:', error)
        console.error('Full error object:', JSON.stringify(error, null, 2))
        setConnectionState('error')
        setIsConnecting(false)
        setLastError(`Socket.IO connection error: ${error.message}`)
        onError?.(error.message)
        
        // Schedule reconnect on connection error
        if (!isManuallyDisconnected.current && reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect()
        }
      })

      // Add more debugging events
      socket.on('error', (error) => {
        console.error('Health Socket.IO error event:', error)
      })

      socket.onAny((event, ...args) => {
        console.log('Health Socket.IO received event:', event, args)
      })

      // Initiate connection
      console.log('Initiating authenticated Socket.IO connection...')
      socket.connect()

    } catch (error) {
      console.error('Health Socket.IO: Connection setup failed:', error)
      setConnectionState('error')
      setIsConnecting(false)
      setLastError(error instanceof Error ? error.message : 'Unknown connection error')
      onError?.(error instanceof Error ? error.message : 'Unknown connection error')
      
      // Schedule reconnect on setup error
      if (!isManuallyDisconnected.current && reconnectAttempts.current < maxReconnectAttempts) {
        scheduleReconnect()
      }
    }
  }, [getSocketUrl, onConnect, onDisconnect, onError, onHealthUpdate, maxReconnectAttempts, scheduleReconnect])

  const disconnect = useCallback(() => {
    isManuallyDisconnected.current = true
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setConnectionState('disconnected')
    reconnectAttempts.current = 0
    setLastError(null)
  }, [])

  const resetConnection = useCallback(() => {
    reconnectAttempts.current = 0
    setLastError(null)
    setConnectionState('disconnected')
    if (autoConnect) {
      connect()
    }
  }, [autoConnect, connect])

  useEffect(() => {
    if (autoConnect) {
      const timeout = setTimeout(() => {
        connect()
      }, 1000)

      return () => clearTimeout(timeout)
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  useEffect(() => {
    if (reconnectOnMount && connectionState === 'disconnected' && !isManuallyDisconnected.current) {
      const timeout = setTimeout(() => {
        connect()
      }, 2000)

      return () => clearTimeout(timeout)
    }
  }, [reconnectOnMount, connectionState, connect])

  useEffect(() => {
    return () => {
      isManuallyDisconnected.current = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isConnecting,
    lastError,
    currentHealth,
    lastUpdated,
    connect,
    disconnect,
    resetConnection,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts,
    canReconnect: reconnectAttempts.current < maxReconnectAttempts && !isManuallyDisconnected.current
  }
} 