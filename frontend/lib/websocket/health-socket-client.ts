'use client'

import { io, Socket } from 'socket.io-client'
import { getAuthHeaders } from '../auth-utils'
import { JWTAuthService } from '../auth/jwt-auth'

export interface HealthData {
  status: 'up' | 'down' | 'degraded'
  timestamp: string
  details: {
    responseTime: number
    database: {
      status: string
      responseTime: number
      connection: string
    }
    api: {
      status: string
      responseTime: number
      endpoints: Array<{
        name: string
        status: string
        responseTime: number
      }>
    }
    version: string
    environment: string
  }
}

export interface HealthSocketEvents {
  health: (data: HealthData) => void
  connect: () => void
  disconnect: () => void
  connect_error: (error: Error) => void
  reconnect: (attemptNumber: number) => void
  reconnect_error: (error: Error) => void
  reconnect_failed: () => void
}

export interface HealthConnectionListener {
  (connected: boolean): void
}

export interface HealthDataListener {
  (data: HealthData): void
}

export interface HealthErrorListener {
  (error: string): void
}

class HealthSocketClient {
  private socket: Socket | null = null
  private healthListeners: Set<(data: HealthData) => void> = new Set()
  private connectionListeners: Set<(connected: boolean) => void> = new Set()
  private errorListeners: Set<(error: string) => void> = new Set()
  private isConnecting = false
  private url: string
  private namespace: string = '/health'

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (this.socket?.connected) {
        resolve()
        return
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true

      try {
        // Get authentication headers and token
        const authHeaders = await getAuthHeaders()
        const jwtService = JWTAuthService.getInstance()
        const token = jwtService.getToken()

        console.log('🔐 Health Socket.IO: Preparing authentication', {
          hasToken: !!token,
          hasAuthHeaders: Object.keys(authHeaders).length > 0,
          authHeaders: Object.keys(authHeaders)
        })

        // Create socket connection to the health namespace
        this.socket = io(`${this.url}${this.namespace}`, {
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
          forceNew: true,
          auth: {
            token: token || undefined
          },
          extraHeaders: {
            ...authHeaders,
            ...(token && { authorization: `Bearer ${token}` })
          }
        })

        // Connection event handlers
        this.socket.on('connect', () => {
          console.log('🔌 Health Socket.IO connected to', this.namespace)
          this.isConnecting = false
          this.notifyConnectionListeners(true)
          resolve()
        })

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 Health Socket.IO disconnected:', reason)
          this.notifyConnectionListeners(false)
        })

        this.socket.on('connect_error', (error) => {
          console.error('🔌 Health Socket.IO connection error:', error)
          this.isConnecting = false
          this.notifyErrorListeners(`Connection error: ${error.message}`)
          reject(error)
        })

        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`🔌 Health Socket.IO reconnected after ${attemptNumber} attempts`)
          this.notifyConnectionListeners(true)
        })

        this.socket.on('reconnect_error', (error) => {
          console.error('🔌 Health Socket.IO reconnection error:', error)
          this.notifyErrorListeners(`Reconnection error: ${error.message}`)
        })

        this.socket.on('reconnect_failed', () => {
          console.error('🔌 Health Socket.IO reconnection failed')
          this.notifyErrorListeners('Reconnection failed after maximum attempts')
        })

        // Health data event handler
        this.socket.on('health', (data: HealthData) => {
          console.log('📊 Health data received:', data)
          this.notifyHealthListeners(data)
        })

      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting Health Socket.IO')
      this.socket.disconnect()
      this.socket = null
    }
  }

  // Subscribe to health data updates
  onHealthUpdate(callback: (data: HealthData) => void): () => void {
    this.healthListeners.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.healthListeners.delete(callback)
    }
  }

  // Subscribe to connection status changes
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.connectionListeners.delete(callback)
    }
  }

  // Subscribe to error events
  onError(callback: (error: string) => void): () => void {
    this.errorListeners.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.errorListeners.delete(callback)
    }
  }

  // Request immediate health update
  requestHealthUpdate() {
    if (this.socket?.connected) {
      this.socket.emit('request_health')
    } else {
      console.warn('🔌 Cannot request health update: Socket not connected')
    }
  }

  // Get current connection status
  isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  // Get connection state
  getConnectionState(): string {
    if (!this.socket) return 'disconnected'
    if (this.socket.connected) return 'connected'
    if (this.isConnecting) return 'connecting'
    return 'disconnected'
  }

  // Private notification methods
  private notifyHealthListeners(data: HealthData) {
    this.healthListeners.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('Error in health listener callback:', error)
      }
    })
  }

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected)
      } catch (error) {
        console.error('Error in connection listener callback:', error)
      }
    })
  }

  private notifyErrorListeners(error: string) {
    this.errorListeners.forEach(callback => {
      try {
        callback(error)
      } catch (error) {
        console.error('Error in error listener callback:', error)
      }
    })
  }
}

// Singleton instance
let healthSocketClient: HealthSocketClient | null = null

export function getHealthSocketClient(): HealthSocketClient {
  if (!healthSocketClient) {
    const socketUrl = process.env['NEXT_PUBLIC_SOCKET_URL'] || 'http://localhost:3001'
    healthSocketClient = new HealthSocketClient(socketUrl)
  }
  return healthSocketClient
}

// React hook for using the health socket
export function useHealthSocket() {
  const client = getHealthSocketClient()
  
  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    onHealthUpdate: (callback: (data: HealthData) => void) => client.onHealthUpdate(callback),
    onConnectionChange: (callback: (connected: boolean) => void) => client.onConnectionChange(callback),
    onError: (callback: (error: string) => void) => client.onError(callback),
    requestHealthUpdate: () => client.requestHealthUpdate(),
    isConnected: () => client.isConnected(),
    getConnectionState: () => client.getConnectionState()
  }
} 