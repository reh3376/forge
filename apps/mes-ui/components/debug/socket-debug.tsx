'use client'

import React, { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function SocketDebug() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionState, setConnectionState] = useState<string>('disconnected')
  const [logs, setLogs] = useState<string[]>([])
  const [receivedEvents, setReceivedEvents] = useState<Array<{ event: string; args: unknown[]; timestamp: Date }>>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-20), `[${timestamp}] ${message}`])
  }

  const testConnection = (url: string, namespace?: string) => {
    if (socket) {
      socket.disconnect()
    }

    const fullUrl = namespace ? `${url}${namespace}` : url
    addLog(`Attempting to connect to: ${fullUrl}`)
    
    const newSocket = io(fullUrl, {
      autoConnect: false,
      reconnection: false,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      forceNew: true
    })

    newSocket.on('connect', () => {
      addLog('✅ Connected successfully!')
      setConnectionState('connected')
    })

    newSocket.on('disconnect', (reason) => {
      addLog(`❌ Disconnected: ${reason}`)
      setConnectionState('disconnected')
    })

    newSocket.on('connect_error', (error) => {
      addLog(`❌ Connection error: ${error.message}`)
      addLog(`Error details: ${JSON.stringify(error)}`)
      setConnectionState('error')
    })

    newSocket.onAny((event, ...args) => {
      addLog(`📨 Received event: ${event}`)
      setReceivedEvents(prev => [...prev.slice(-10), { event, args, timestamp: new Date() }])
    })

    newSocket.connect()
    setSocket(newSocket)
  }

  const disconnect = () => {
    if (socket) {
      socket.disconnect()
      setSocket(null)
      addLog('Manually disconnected')
    }
  }

  const clearLogs = () => {
    setLogs([])
    setReceivedEvents([])
  }

  useEffect(() => {
    addLog('Socket Debug component loaded')
    addLog(`Environment NEXT_PUBLIC_SOCKET_URL: ${process.env['NEXT_PUBLIC_SOCKET_URL'] || 'not set'}`)
    
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Socket.IO Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span>Status:</span>
            <Badge variant={connectionState === 'connected' ? 'default' : 'destructive'}>
              {connectionState}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => testConnection('http://localhost:3001')}
              variant="outline"
              size="sm"
            >
              Test Root (localhost:3001)
            </Button>
            <Button 
              onClick={() => testConnection('http://localhost:3001', '/health')}
              variant="outline"
              size="sm"
            >
              Test /health namespace
            </Button>
            <Button 
              onClick={() => testConnection('ws://localhost:3001')}
              variant="outline"
              size="sm"
            >
              Test WebSocket URL
            </Button>
            <Button 
              onClick={disconnect}
              variant="outline"
              size="sm"
            >
              Disconnect
            </Button>
            <Button 
              onClick={clearLogs}
              variant="outline"
              size="sm"
            >
              Clear Logs
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Connection Logs:</h4>
            <div className="bg-gray-100 p-3 rounded text-sm font-mono max-h-40 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-gray-500">No logs yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">{log}</div>
                ))
              )}
            </div>
          </div>

          {receivedEvents.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Received Events:</h4>
              <div className="bg-gray-100 p-3 rounded text-sm font-mono max-h-40 overflow-y-auto">
                {receivedEvents.map((event, index) => (
                  <div key={index} className="mb-2 p-2 bg-white rounded">
                    <div className="font-bold">{event.event}</div>
                    <div className="text-xs text-gray-600">{event.timestamp.toLocaleTimeString()}</div>
                    <pre className="text-xs mt-1">{JSON.stringify(event.args, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 