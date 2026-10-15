#!/usr/bin/env node

import { Server } from 'socket.io'
import http from 'http'
import { createSocketAuthMiddleware } from '../lib/websocket/socket-auth-middleware.js'

// Create HTTP server
const server = http.createServer()

// Create Socket.IO server with CORS enabled
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:4000", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
})

// Add authentication middleware
const authMiddleware = createSocketAuthMiddleware({
  allowDemo: true,
  requireAuth: false // Allow unauthenticated connections for health monitoring
})

// Apply auth middleware to all namespaces
io.use(authMiddleware)

// Health namespace
const healthNamespace = io.of('/health')

// Apply auth middleware to health namespace as well
healthNamespace.use(authMiddleware)

// Mock health data generator
function generateHealthData() {
  // Bias towards 'up' status for more realistic simulation
  const getRealisticStatus = () => {
    const rand = Math.random()
    if (rand < 0.7) return 'up'
    if (rand < 0.9) return 'degraded'
    return 'down'
  }

  const baseResponseTime = 50
  const variation = Math.random() * 100

  return {
    status: getRealisticStatus(),
    timestamp: new Date().toISOString(),
    details: {
      responseTime: Math.round(baseResponseTime + variation),
      database: {
        status: getRealisticStatus(),
        responseTime: Math.round(baseResponseTime + (Math.random() * 50)),
        connection: Math.random() > 0.1 ? 'active' : 'inactive'
      },
      api: {
        status: getRealisticStatus(),
        responseTime: Math.round(baseResponseTime + (Math.random() * 30)),
        endpoints: [
          {
            name: '/api/_health',
            status: getRealisticStatus(),
            responseTime: Math.round(baseResponseTime + (Math.random() * 20))
          },
          {
            name: '/api/_health/db',
            status: getRealisticStatus(),
            responseTime: Math.round(baseResponseTime + (Math.random() * 40))
          },
          {
            name: '/api/_health/api',
            status: getRealisticStatus(),
            responseTime: Math.round(baseResponseTime + (Math.random() * 15))
          },
          {
            name: '/api/_health/live',
            status: getRealisticStatus(),
            responseTime: Math.round(baseResponseTime + (Math.random() * 10))
          },
          {
            name: '/api/_health/ready',
            status: getRealisticStatus(),
            responseTime: Math.round(baseResponseTime + (Math.random() * 10))
          }
        ]
      },
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  }
}

// Handle health namespace connections
healthNamespace.on('connection', (socket) => {
  console.log(`🔌 Health client connected: ${socket.id}`)
  
  // Log authentication info
  if (socket.userId) {
    console.log(`🔐 Authenticated user: ${socket.username} (${socket.userId}) - Roles: ${socket.roles?.join(', ')}`)
  } else {
    console.log(`🔐 Unauthenticated connection (demo mode: ${socket.isDemo})`)
  }

  // Send initial health data
  const initialData = generateHealthData()
  socket.emit('health', initialData)
  console.log(`📊 Sent initial health data to ${socket.id}`)

  // Handle manual health requests
  socket.on('request_health', () => {
    console.log(`🔄 Health update requested by ${socket.id}`)
    const healthData = generateHealthData()
    socket.emit('health', healthData)
    console.log(`📊 Sent health data to ${socket.id}`)
  })

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Health client disconnected: ${socket.id}, reason: ${reason}`)
  })

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error)
  })
})

// Broadcast health updates every 10 seconds
setInterval(() => {
  const healthData = generateHealthData()
  healthNamespace.emit('health', healthData)
  console.log(`📡 Broadcasted health data to ${healthNamespace.sockets.size} clients`)
}, 10000)

// Handle main namespace connections (optional)
io.on('connection', (socket) => {
  console.log(`🔌 Client connected to main namespace: ${socket.id}`)
  
  // Log authentication info
  if (socket.userId) {
    console.log(`🔐 Authenticated user: ${socket.username} (${socket.userId}) - Roles: ${socket.roles?.join(', ')}`)
  } else {
    console.log(`🔐 Unauthenticated connection (demo mode: ${socket.isDemo})`)
  }
  
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Client disconnected from main namespace: ${socket.id}, reason: ${reason}`)
  })
})

// Start server
const PORT = process.env.HEALTH_SOCKET_PORT || 3001
server.listen(PORT, () => {
  console.log(`🚀 Health Socket.IO server running on port ${PORT}`)
  console.log(`📡 Health namespace available at: http://localhost:${PORT}/health`)
  console.log(`🔄 Broadcasting health updates every 10 seconds`)
  console.log(`🌐 CORS enabled for: http://localhost:4000, http://localhost:3000`)
  console.log(`🔐 Authentication middleware enabled (demo mode allowed, auth not required)`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Health Socket.IO server...')
  server.close(() => {
    console.log('✅ Server closed')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down Health Socket.IO server...')
  server.close(() => {
    console.log('✅ Server closed')
    process.exit(0)
  })
}) 