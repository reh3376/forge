import { HealthDashboard } from '@/components/debug/health-dashboard'
import { HealthStatusWidget } from '@/components/debug/health-status-widget'
import { HealthEndpointTester } from '@/components/debug/health-endpoint-tester'
import { BackendConfigDebug } from '@/components/debug/backend-config-debug'
import { SocketDebug } from '@/components/debug/socket-debug'
// import { HealthWebSocketWidget } from '@/components/debug/health-websocket-widget'

export default function HealthMonitoringPage() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Health Monitoring</h1>
        <p className="text-muted-foreground">
          Monitor system health, database connectivity, API status, and performance metrics in real-time.
        </p>
      </div>

      {/* Widget Examples */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Health Status Widgets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <HealthStatusWidget />
          <HealthStatusWidget showDetails={true} />
          <div className="p-4 border rounded-lg">
            <h3 className="text-sm font-medium mb-2">Compact Widget</h3>
            <HealthStatusWidget compact={true} />
          </div>
        </div>
      </div>

      {/* WebSocket Health Monitoring */}
      {/* <div className="space-y-4">
        <h2 className="text-xl font-semibold">WebSocket Health Monitoring</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HealthWebSocketWidget showDetails={true} />
          <HealthWebSocketWidget enablePolling={true} pollingInterval={10000} />
        </div>
        <div className="max-w-md">
          <h3 className="text-sm font-medium mb-2">Compact WebSocket Widget</h3>
          <HealthWebSocketWidget compact={true} />
        </div>
      </div> */}

      {/* Main Dashboard */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Full Health Dashboard</h2>
        <HealthDashboard />
      </div>

      {/* Endpoint Tester */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Endpoint Testing</h2>
        <HealthEndpointTester />
      </div>

      {/* Backend Configuration */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Backend Configuration</h2>
        <BackendConfigDebug />
      </div>

      {/* Socket.IO Debug Tool */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Socket.IO Debug Tool</h2>
        <SocketDebug />
      </div>

      {/* Integration Information */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Integration Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">REST API Endpoints</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <code className="bg-muted px-2 py-1 rounded">/api/_health</code>
                <span className="text-muted-foreground">Complete system health</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted px-2 py-1 rounded">/api/_health/db</code>
                <span className="text-muted-foreground">Database health</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted px-2 py-1 rounded">/api/_health/api</code>
                <span className="text-muted-foreground">API service health</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted px-2 py-1 rounded">/api/_health/live</code>
                <span className="text-muted-foreground">Liveness probe</span>
              </div>
              <div className="flex justify-between">
                <code className="bg-muted px-2 py-1 rounded">/api/_health/ready</code>
                <span className="text-muted-foreground">Readiness probe</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Socket.IO Connection</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">URL:</span>
                <code className="bg-muted px-2 py-1 rounded">http://localhost:3001</code>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Namespace:</span>
                <code className="bg-muted px-2 py-1 rounded">/health</code>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Event:</span>
                <code className="bg-muted px-2 py-1 rounded">health</code>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Broadcast Interval:</span>
                <span className="text-muted-foreground">10 seconds</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Auto Reconnect:</span>
                <span className="text-muted-foreground">Yes (5 attempts)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Environment Variable:</span>
                <code className="bg-muted px-2 py-1 rounded">NEXT_PUBLIC_SOCKET_URL</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 