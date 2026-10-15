# Health Monitoring WebSocket (Socket.IO)

This document describes the Socket.IO-based health monitoring system that provides real-time health status updates for the MES UI application.

## Overview

The health monitoring system uses Socket.IO to provide real-time health status updates via WebSocket connections. It includes:

- **Socket.IO Client**: React components and hooks for connecting to health monitoring
- **Health Events**: Real-time 'health' event subscriptions
- **Mock Server**: Development server for testing health monitoring functionality
- **UI Components**: Widgets and dashboards for displaying health status

## Architecture

```
┌─────────────────┐    WebSocket     ┌─────────────────┐
│   React Client  │ ◄─────────────► │  Socket.IO      │
│                 │   (Socket.IO)    │  Health Server  │
│ - useHealthSocket│                 │                 │
│ - HealthWidget  │                 │ - /health       │
│ - Dashboard     │                 │ - health events │
└─────────────────┘                 └─────────────────┘
```

## Components

### 1. Health Socket Client (`lib/websocket/health-socket-client.ts`)

Core Socket.IO client for health monitoring:

```typescript
import { useHealthSocket } from '@/lib/websocket/health-socket-client'

const healthSocket = useHealthSocket()

// Connect to health monitoring
await healthSocket.connect()

// Subscribe to health updates
const unsubscribe = healthSocket.onHealthUpdate((data) => {
  console.log('Health update:', data)
})

// Request immediate health update
healthSocket.requestHealthUpdate()
```

**Features:**
- Auto-reconnection with exponential backoff
- Connection state management
- Event subscription management
- Error handling and logging

### 2. Health Monitoring Hook (`hooks/use-health-monitoring.ts`)

React hook that combines Socket.IO with health monitoring logic:

```typescript
import { useHealthMonitoring } from '@/hooks/use-health-monitoring'

function MyComponent() {
  const {
    healthStatus,
    isConnected,
    connect,
    disconnect,
    requestHealthUpdate
  } = useHealthMonitoring({
    autoConnect: true,
    enablePolling: false,
    pollingInterval: 30000
  })

  return (
    <div>
      Status: {healthStatus.status}
      Connected: {isConnected ? 'Yes' : 'No'}
    </div>
  )
}
```

**Options:**
- `autoConnect`: Automatically connect on mount (default: true)
- `enablePolling`: Enable periodic health requests (default: false)
- `pollingInterval`: Polling interval in milliseconds (default: 30000)
- `onHealthUpdate`: Callback for health updates
- `onConnectionChange`: Callback for connection changes
- `onError`: Callback for errors

### 3. Health WebSocket Widget (`components/debug/health-websocket-widget.tsx`)

UI component for displaying health status:

```typescript
import { HealthWebSocketWidget } from '@/components/debug/health-websocket-widget'

// Basic widget
<HealthWebSocketWidget />

// Detailed widget with polling
<HealthWebSocketWidget 
  showDetails={true} 
  enablePolling={true}
  pollingInterval={10000}
/>

// Compact widget
<HealthWebSocketWidget compact={true} />
```

**Props:**
- `showDetails`: Show detailed system status (default: false)
- `compact`: Use compact layout (default: false)
- `autoConnect`: Auto-connect on mount (default: true)
- `enablePolling`: Enable periodic updates (default: false)
- `pollingInterval`: Polling interval in ms (default: 30000)

## Health Data Format

The health monitoring system uses a standardized data format:

```typescript
interface HealthData {
  status: 'up' | 'down' | 'degraded'
  timestamp: string
  details: {
    responseTime: number
    database: {
      status: 'up' | 'down' | 'degraded'
      responseTime: number
      connection: 'active' | 'inactive'
    }
    api: {
      status: 'up' | 'down' | 'degraded'
      responseTime: number
      endpoints: Array<{
        name: string
        status: 'up' | 'down' | 'degraded'
        responseTime: number
      }>
    }
    version: string
    environment: string
  }
}
```

## Socket.IO Events

### Client → Server Events

- `request_health`: Request immediate health update

### Server → Client Events

- `health`: Health status update with full health data
- `connect`: Connection established
- `disconnect`: Connection lost
- `connect_error`: Connection error
- `reconnect`: Reconnection successful

## Development Server

A mock Socket.IO server is provided for development and testing:

### Starting the Server

```bash
# Start the health monitoring server
npm run health-server

# Or manually
node scripts/health-socket-server.js
```

### Server Configuration

- **Port**: 3001 (configurable via `HEALTH_SOCKET_PORT`)
- **Namespace**: `/health`
- **CORS**: Enabled for localhost:3000 and localhost:4000
- **Broadcast Interval**: 10 seconds

### Server Features

- Generates realistic mock health data
- Broadcasts updates every 10 seconds
- Handles manual health requests
- Supports multiple concurrent clients
- Graceful shutdown handling

## Environment Configuration

### Client Configuration

Set the Socket.IO server URL in your environment:

```bash
# .env.local
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Server Configuration

```bash
# Health server port (default: 3001)
HEALTH_SOCKET_PORT=3001

# Environment for health data
NODE_ENV=development
```

## Usage Examples

### Basic Health Monitoring

```typescript
import { useHealthMonitoring } from '@/hooks/use-health-monitoring'

function HealthStatus() {
  const { healthStatus, isConnected } = useHealthMonitoring()

  if (!isConnected) {
    return <div>Connecting to health monitoring...</div>
  }

  return (
    <div>
      <h2>System Health: {healthStatus.status}</h2>
      <p>Database: {healthStatus.database.status}</p>
      <p>API: {healthStatus.api.status}</p>
      <p>Last Update: {healthStatus.lastUpdated?.toLocaleString()}</p>
    </div>
  )
}
```

### Advanced Health Dashboard

```typescript
import { useHealthMonitoring } from '@/hooks/use-health-monitoring'
import { HealthWebSocketWidget } from '@/components/debug/health-websocket-widget'

function HealthDashboard() {
  const {
    healthStatus,
    isConnected,
    requestHealthUpdate
  } = useHealthMonitoring({
    enablePolling: true,
    pollingInterval: 15000,
    onHealthUpdate: (data) => {
      console.log('Health update received:', data)
    },
    onError: (error) => {
      console.error('Health monitoring error:', error)
    }
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <HealthWebSocketWidget showDetails={true} />
      <HealthWebSocketWidget enablePolling={true} />
      
      <div className="col-span-full">
        <button onClick={requestHealthUpdate}>
          Refresh Health Status
        </button>
      </div>
    </div>
  )
}
```

## Integration with Existing Health System

The Socket.IO health monitoring integrates with the existing health monitoring system:

1. **Health Dashboard**: Located at `/diagnostics/health-monitoring`
2. **Health Widgets**: Available in the diagnostics section
3. **Health API**: Can be extended to broadcast via Socket.IO
4. **Health Checks**: Existing health check endpoints can feed into Socket.IO

## Troubleshooting

### Connection Issues

1. **Check server status**: Ensure the health server is running
2. **Verify CORS**: Check that your client URL is in the CORS allowlist
3. **Check environment variables**: Verify `NEXT_PUBLIC_SOCKET_URL` is set
4. **Network connectivity**: Ensure WebSocket connections are not blocked

### Common Errors

- **Connection refused**: Health server is not running
- **CORS errors**: Client URL not in server CORS configuration
- **Timeout errors**: Network connectivity issues or server overload

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=socket.io:client npm run dev
```

## Performance Considerations

- **Connection pooling**: Socket.IO handles connection pooling automatically
- **Event throttling**: Consider throttling rapid health updates
- **Memory usage**: Monitor memory usage with many concurrent connections
- **Bandwidth**: Health data broadcasts consume bandwidth

## Security Considerations

- **Authentication**: Consider adding authentication for production use
- **Rate limiting**: Implement rate limiting for health requests
- **CORS configuration**: Restrict CORS to known domains in production
- **Data validation**: Validate incoming health data on the client

## Future Enhancements

- **Authentication integration**: Add user-based health monitoring
- **Historical data**: Store and display health history
- **Alerting**: Add real-time alerts for health issues
- **Metrics**: Add performance metrics and analytics
- **Clustering**: Support for multiple health server instances 