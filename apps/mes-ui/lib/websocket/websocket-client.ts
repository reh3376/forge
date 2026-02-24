import { useProductionStore } from '@/stores/production-store'
import type { Recipe, ProductionOrder, Batch } from '@/stores/production-store'

export interface WebSocketMessage {
  type: 'equipment_update' | 'batch_update' | 'production_order_update' | 'recipe_update' | 'alert'
  data: EquipmentUpdate | BatchUpdate | ProductionOrder | Recipe | ProductionAlert
  timestamp: string
}

export interface EquipmentUpdate {
  id: string
  status: 'running' | 'idle' | 'maintenance' | 'offline' | 'error' | 'setup' | 'paused' | 'standby'
  temperature?: number
  pressure?: number
  level?: number
  currentBatch?: string
}

export interface BatchUpdate {
  id: string
  status: 'mashing' | 'fermenting' | 'distilling' | 'aging' | 'completed' | 'quality-hold'
  qualityMetrics?: {
    phLevel?: number
    temperature?: number
    gravity?: number
  }
  yields?: {
    mashVolume?: number
    fermentedVolume?: number
    proofGallons?: number
  }
}

export interface ProductionAlert {
  id: string
  type: 'warning' | 'error' | 'info'
  message: string
  equipmentId?: string
  batchId?: string
  timestamp: string
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private messageHandlers: Map<string, (data: WebSocketMessage['data']) => void> = new Map()

  constructor(private url: string) {
    this.setupMessageHandlers()
  }

  private setupMessageHandlers() {
    // Equipment updates
    this.messageHandlers.set('equipment_update', (data: WebSocketMessage['data']) => {
      const equipmentData = data as EquipmentUpdate
      const store = useProductionStore.getState()
      
      // Filter out undefined values to match the store interface
      const updateData: Record<string, string | number> = {}
      if (equipmentData.temperature !== undefined) updateData['temperature'] = equipmentData.temperature
      if (equipmentData.pressure !== undefined) updateData['pressure'] = equipmentData.pressure
      if (equipmentData.level !== undefined) updateData['level'] = equipmentData.level
      if (equipmentData.currentBatch !== undefined) updateData['currentBatch'] = equipmentData.currentBatch
      
      store.updateEquipmentStatus(equipmentData.id, equipmentData.status, updateData)
    })

    // Batch updates
    this.messageHandlers.set('batch_update', (data: WebSocketMessage['data']) => {
      const batchData = data as BatchUpdate
      const store = useProductionStore.getState()
      store.updateBatchStatus(batchData.id, batchData.status)
      
      // Update quality metrics if provided
      if (batchData.qualityMetrics || batchData.yields) {
        const updates: Partial<Batch> = {}
        if (batchData.qualityMetrics) {
          updates.qualityMetrics = batchData.qualityMetrics
        }
        if (batchData.yields) {
          updates.yields = batchData.yields
        }
        store.updateBatch(batchData.id, updates)
      }
    })

    // Production order updates
    this.messageHandlers.set('production_order_update', (data: WebSocketMessage['data']) => {
      const orderData = data as ProductionOrder
      const store = useProductionStore.getState()
      store.updateProductionOrder(orderData.id, orderData)
    })

    // Recipe updates
    this.messageHandlers.set('recipe_update', (data: WebSocketMessage['data']) => {
      const recipeData = data as Recipe
      const store = useProductionStore.getState()
      store.updateRecipe(recipeData.id, recipeData)
    })

    // Alerts - for now just log them since there's no alert system in the store
    this.messageHandlers.set('alert', (data: WebSocketMessage['data']) => {
      const alertData = data as ProductionAlert
      console.warn('Production Alert:', {
        id: alertData.id,
        type: alertData.type,
        message: alertData.message,
        equipmentId: alertData.equipmentId,
        batchId: alertData.batchId,
        timestamp: alertData.timestamp
      })
      
      // Could dispatch a custom event or use a notification system here
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('production-alert', {
          detail: alertData
        }))
      }
    })
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnecting = false
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason)
          this.isConnecting = false
          this.ws = null
          
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.isConnecting = false
          reject(error)
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  private handleMessage(message: WebSocketMessage) {
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message.data)
    } else {
      console.warn('No handler for message type:', message.type)
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnect failed:', error)
      })
    }, delay)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message')
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getConnectionState(): string {
    if (!this.ws) return 'disconnected'
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting'
      case WebSocket.OPEN: return 'connected'
      case WebSocket.CLOSING: return 'closing'
      case WebSocket.CLOSED: return 'disconnected'
      default: return 'unknown'
    }
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] || 'ws://localhost:3001/ws'
    wsClient = new WebSocketClient(wsUrl)
  }
  return wsClient
}

export function useWebSocket() {
  const client = getWebSocketClient()
  
  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    send: (message: Record<string, unknown>) => client.send(message),
    isConnected: () => client.isConnected(),
    getConnectionState: () => client.getConnectionState()
  }
} 