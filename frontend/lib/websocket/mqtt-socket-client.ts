'use client'

import { io, Socket } from 'socket.io-client'
import { getAuthHeaders } from '../auth-utils'
import { JWTAuthService } from '../auth/jwt-auth'

export interface MqttConnectionStatus {
  brokerId: string
  connected: boolean
  brokerConfig?: {
    host: string
    port: number
    protocol: string
    tls: boolean
  }
}

export interface MqttStatusUpdate {
  brokers: MqttConnectionStatus[]
  timestamp: string
}

export interface MqttEvent {
  type: 'connection' | 'message' | 'error'
  brokerId: string
  data: Record<string, unknown>
  timestamp: string
}

class MqttSocketClient {
  private socket: Socket | null = null
  private url: string
  private namespace: string = '/mqtt'
  private isConnecting: boolean = false

  // Event listeners
  private connectionListeners: Set<(connected: boolean) => void> = new Set()
  private statusListeners: Set<(status: MqttStatusUpdate) => void> = new Set()
  private eventListeners: Set<(event: MqttEvent) => void> = new Set()
  private errorListeners: Set<(error: string) => void> = new Set()

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

        console.log('🔐 MQTT Socket.IO: Preparing authentication', {
          hasToken: !!token,
          hasAuthHeaders: Object.keys(authHeaders).length > 0,
          authHeaders: Object.keys(authHeaders)
        })

        // Create socket connection to the MQTT namespace
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
          console.log('🔌 MQTT Socket.IO connected to', this.namespace)
          this.isConnecting = false
          this.notifyConnectionListeners(true)
          
          // Request initial status
          this.requestStatus()
          resolve()
        })

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 MQTT Socket.IO disconnected:', reason)
          this.notifyConnectionListeners(false)
        })

        this.socket.on('connect_error', (error) => {
          console.error('🔌 MQTT Socket.IO connection error:', error)
          this.isConnecting = false
          this.notifyErrorListeners(`Connection error: ${error.message}`)
          reject(error)
        })

        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`🔌 MQTT Socket.IO reconnected after ${attemptNumber} attempts`)
          this.notifyConnectionListeners(true)
          this.requestStatus() // Request status after reconnection
        })

        this.socket.on('reconnect_error', (error) => {
          console.error('🔌 MQTT Socket.IO reconnection error:', error)
          this.notifyErrorListeners(`Reconnection error: ${error.message}`)
        })

        this.socket.on('reconnect_failed', () => {
          console.error('🔌 MQTT Socket.IO reconnection failed')
          this.notifyErrorListeners('Reconnection failed after maximum attempts')
        })

        // MQTT-specific event handlers
        this.socket.on('mqtt:connection_status', (data: MqttStatusUpdate) => {
          console.log('📊 MQTT connection status received:', data)
          this.notifyStatusListeners(data)
        })

        this.socket.on('mqtt:status', (event: MqttEvent) => {
          console.log('📊 MQTT event received:', event)
          this.notifyEventListeners(event)
        })

        this.socket.on('mqtt:error', (error: { message?: string }) => {
          console.error('📊 MQTT error received:', error)
          this.notifyErrorListeners(error.message || 'MQTT error occurred')
        })

      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting MQTT Socket.IO')
      this.socket.disconnect()
      this.socket = null
    }
  }

  // Request current MQTT broker status
  requestStatus() {
    if (this.socket?.connected) {
      this.socket.emit('mqtt:get_status')
    } else {
      console.warn('🔌 Cannot request MQTT status: Socket not connected')
    }
  }

  // Request MQTT statistics
  requestStats() {
    if (this.socket?.connected) {
      this.socket.emit('mqtt:get_stats')
    } else {
      console.warn('🔌 Cannot request MQTT stats: Socket not connected')
    }
  }

  // Subscribe to status updates
  onStatusUpdate(callback: (data: MqttStatusUpdate) => void): () => void {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }

  // Subscribe to MQTT events
  onMqttEvent(callback: (event: MqttEvent) => void): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  // Subscribe to connection state changes
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback)
    return () => this.connectionListeners.delete(callback)
  }

  // Subscribe to errors
  onError(callback: (error: string) => void): () => void {
    this.errorListeners.add(callback)
    return () => this.errorListeners.delete(callback)
  }

  // Get current connection state
  get isConnected(): boolean {
    return this.socket?.connected || false
  }

  // Notify listeners
  private notifyStatusListeners(data: MqttStatusUpdate) {
    this.statusListeners.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('Error in MQTT status listener:', error)
      }
    })
  }

  private notifyEventListeners(event: MqttEvent) {
    this.eventListeners.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('Error in MQTT event listener:', error)
      }
    })
  }

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected)
      } catch (error) {
        console.error('Error in MQTT connection listener:', error)
      }
    })
  }

  private notifyErrorListeners(error: string) {
    this.errorListeners.forEach(callback => {
      try {
        callback(error)
      } catch (error) {
        console.error('Error in MQTT error listener:', error)
      }
    })
  }
}

// Singleton instance
let mqttSocketClient: MqttSocketClient | null = null

export function useMqttSocket(): MqttSocketClient {
  if (!mqttSocketClient) {
    const socketUrl = process.env['NEXT_PUBLIC_SOCKET_URL'] || 'http://localhost:3000'
    mqttSocketClient = new MqttSocketClient(socketUrl)
  }
  return mqttSocketClient
}

export { MqttSocketClient } 