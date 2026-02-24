'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWebSocketConnection } from '@/lib/hooks/use-websocket-connection'
import { useProductionStore } from '@/stores/production-store'
import { AlertCircle, Wifi, WifiOff, Activity, Thermometer, Gauge } from 'lucide-react'

interface MessageLog {
  timestamp: string
  type: string
  data: Record<string, unknown>
}

export function WebSocketDemo() {
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [simulationActive, setSimulationActive] = useState(false)
  
  const { equipment } = useProductionStore()
  
  const {
    connectionState,
    isConnected,
    isConnecting,
    lastError,
    connect,
    disconnect,
    sendMessage
  } = useWebSocketConnection({
    autoConnect: false,
    onConnect: () => {
      console.log('WebSocket demo: Connected')
      setMessages(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'connection',
        data: { status: 'connected' }
      }])
    },
    onDisconnect: () => {
      console.log('WebSocket demo: Disconnected')
      setMessages(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'connection',
        data: { status: 'disconnected' }
      }])
    },
    onError: (error) => {
      console.error('WebSocket demo: Error', error)
      setMessages(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'error',
        data: { error: error.toString() }
      }])
    }
  })

  // Listen for production alerts
  useEffect(() => {
    const handleProductionAlert = (event: CustomEvent) => {
      setMessages(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: 'alert',
        data: event.detail
      }])
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('production-alert', handleProductionAlert as EventListener)
      
      return () => {
        window.removeEventListener('production-alert', handleProductionAlert as EventListener)
      }
    }
  }, [])

  const handleConnect = async () => {
    try {
      await connect()
    } catch (error) {
      console.error('Failed to connect:', error)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setSimulationActive(false)
  }

  const simulateEquipmentUpdate = () => {
    if (!isConnected) return
    
    const equipmentIds = ['mash-tank-01', 'fermenter-02', 'still-01', 'barrel-line-01']
    const statuses = ['running', 'idle', 'maintenance', 'error'] as const
    const randomId = equipmentIds[Math.floor(Math.random() * equipmentIds.length)]
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
    
    const message = {
      type: 'equipment_update',
      data: {
        id: randomId,
        status: randomStatus,
        temperature: Math.round(180 + Math.random() * 20),
        pressure: Math.round(15 + Math.random() * 5),
        level: Math.round(Math.random() * 100)
      },
      timestamp: new Date().toISOString()
    }
    
    sendMessage(message)
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'sent',
      data: message
    }])
  }

  const simulateBatchUpdate = () => {
    if (!isConnected) return
    
    const batchIds = ['BATCH-2024-001', 'BATCH-2024-002', 'BATCH-2024-003']
    const statuses = ['mashing', 'fermenting', 'distilling', 'aging'] as const
    const randomId = batchIds[Math.floor(Math.random() * batchIds.length)]
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
    
    const message = {
      type: 'batch_update',
      data: {
        id: randomId,
        status: randomStatus,
        qualityMetrics: {
          phLevel: Math.round((4.0 + Math.random() * 2.0) * 100) / 100,
          temperature: Math.round(80 + Math.random() * 20),
          gravity: Math.round((1.040 + Math.random() * 0.020) * 1000) / 1000
        },
        yields: {
          mashVolume: Math.round(1000 + Math.random() * 500),
          proofGallons: Math.round(200 + Math.random() * 100)
        }
      },
      timestamp: new Date().toISOString()
    }
    
    sendMessage(message)
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'sent',
      data: message
    }])
  }

  const simulateAlert = () => {
    if (!isConnected) return
    
    const alertTypes = ['warning', 'error', 'info'] as const
    const alertMessages = [
      'Temperature threshold exceeded',
      'Low pressure detected',
      'Batch quality check required',
      'Equipment maintenance scheduled',
      'Production target achieved'
    ]
    
    const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)]
    const randomMessage = alertMessages[Math.floor(Math.random() * alertMessages.length)]
    
    const message = {
      type: 'alert',
      data: {
        id: `alert-${Date.now()}`,
        type: randomType,
        message: randomMessage,
        equipmentId: 'mash-tank-01',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    }
    
    sendMessage(message)
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'sent',
      data: message
    }])
  }

  const startSimulation = () => {
    if (!isConnected) return
    
    setSimulationActive(true)
    
    // Send updates every 3 seconds
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        simulateEquipmentUpdate()
      } else {
        simulateBatchUpdate()
      }
      
      // Occasionally send alerts
      if (Math.random() > 0.8) {
        simulateAlert()
      }
    }, 3000)
    
    // Store interval ID for cleanup
    const timeoutId = setTimeout(() => {
      clearInterval(interval)
      setSimulationActive(false)
    }, 30000) // Stop after 30 seconds
    
    return () => {
      clearInterval(interval)
      clearTimeout(timeoutId)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'disconnected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = () => {
    if (isConnected) return <Wifi className="h-4 w-4" />
    if (isConnecting) return <Activity className="h-4 w-4 animate-spin" />
    return <WifiOff className="h-4 w-4" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            WebSocket Connection Demo
          </CardTitle>
          <CardDescription>
            Test real-time manufacturing data updates via WebSocket connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(connectionState)}`} />
              <span className="text-sm font-medium">Status: {connectionState}</span>
            </div>
            {lastError && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{lastError}</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            {!isConnected ? (
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            ) : (
              <Button onClick={handleDisconnect} variant="outline">
                Disconnect
              </Button>
            )}
            
            {isConnected && (
              <>
                <Button onClick={simulateEquipmentUpdate} variant="outline">
                  <Thermometer className="h-4 w-4 mr-2" />
                  Equipment Update
                </Button>
                <Button onClick={simulateBatchUpdate} variant="outline">
                  <Gauge className="h-4 w-4 mr-2" />
                  Batch Update
                </Button>
                <Button onClick={simulateAlert} variant="outline">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Send Alert
                </Button>
                <Button 
                  onClick={startSimulation} 
                  disabled={simulationActive}
                  variant={simulationActive ? "secondary" : "default"}
                >
                  {simulationActive ? 'Simulation Running...' : 'Start Simulation'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Equipment Status</CardTitle>
            <CardDescription>Real-time equipment monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(equipment).map(([id, eq]) => (
                <div key={id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{id}</div>
                    <div className="text-sm text-muted-foreground">
                      {eq.temperature && `${eq.temperature}°F`}
                      {eq.pressure && ` • ${eq.pressure} PSI`}
                      {eq.level && ` • ${eq.level}% Level`}
                    </div>
                  </div>
                  <Badge variant={eq.status === 'running' ? 'default' : 'secondary'}>
                    {eq.status}
                  </Badge>
                </div>
              ))}
              {Object.keys(equipment).length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No equipment data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Message Log</CardTitle>
            <CardDescription>WebSocket message history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.slice(-10).map((msg, index) => (
                <div key={index} className="text-xs p-2 border rounded">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {msg.type}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">
                    {JSON.stringify(msg.data, null, 2)}
                  </pre>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No messages yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 