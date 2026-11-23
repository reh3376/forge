# Health Endpoints Documentation

This document provides comprehensive information about all health monitoring endpoints available in the WHK Recipe Configuration system, including both REST API endpoints and WebSocket connections for real-time health monitoring.

## Overview

The health monitoring system provides multiple endpoints to check the status of various system components:

- **Database connectivity and performance**
- **API service status**
- **System resource usage**
- **Real-time health broadcasting via WebSocket**

## REST API Endpoints

All REST health endpoints are available under the `/api/_health` path and are **publicly accessible** (no authentication required).

### Base URL
```
http://localhost:3000/api/_health
```

---

### 1. Liveness Check
**Endpoint:** `GET /api/_health/live`

**Description:** Simple liveness probe to verify the service is running.

**Response:**
- **Status Code:** `204 No Content` - Service is alive
- **Body:** Empty

**Use Case:** Kubernetes/Docker liveness probes, basic service availability checks.

**Example:**
```bash
curl -X GET http://localhost:3000/api/_health/live
```

---

### 2. Readiness Check
**Endpoint:** `GET /api/_health/ready`

**Description:** Readiness probe that verifies database connectivity before marking the service as ready to receive traffic.

**Response:**
- **Status Code:** `204 No Content` - Service is ready (database connected)
- **Status Code:** `404 Not Found` - Service is not ready (database connection failed)
- **Body:** Empty

**Use Case:** Kubernetes/Docker readiness probes, load balancer health checks.

**Example:**
```bash
curl -X GET http://localhost:3000/api/_health/ready
```

---

### 3. Database Health Check
**Endpoint:** `GET /api/_health/db`

**Description:** Detailed database health check with connection status and response time metrics.

**Response:**
- **Status Code:** `200 OK`
- **Content-Type:** `application/json`

**Response Schema:**
```typescript
interface HealthCheckResult {
  status: 'up' | 'down';
  details?: {
    responseTime?: string;      // e.g., "15ms"
    connection?: string;        // e.g., "active"
    error?: string;            // Present when status is 'down'
    code?: string;             // Error code when status is 'down'
  };
  timestamp: string;           // ISO 8601 timestamp
}
```

**Example Response (Healthy):**
```json
{
  "status": "up",
  "details": {
    "responseTime": "12ms",
    "connection": "active"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**Example Response (Unhealthy):**
```json
{
  "status": "down",
  "details": {
    "error": "Connection refused",
    "code": "ECONNREFUSED"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/_health/db
```

---

### 4. API Service Health Check
**Endpoint:** `GET /api/_health/api`

**Description:** API service health status with version and environment information.

**Response:**
- **Status Code:** `200 OK`
- **Content-Type:** `application/json`

**Response Schema:**
```typescript
interface HealthCheckResult {
  status: 'up' | 'down';
  details: {
    version: string;           // Application version
    environment: string;       // e.g., "development", "production"
  };
  timestamp: string;           // ISO 8601 timestamp
}
```

**Example Response:**
```json
{
  "status": "up",
  "details": {
    "version": "1.0.0",
    "environment": "development"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/_health/api
```

---

### 5. Complete System Health Check
**Endpoint:** `GET /api/_health`

**Description:** Comprehensive system health check including database, API, and system resource information.

**Response:**
- **Status Code:** `200 OK`
- **Content-Type:** `application/json`

**Response Schema:**
```typescript
interface SystemHealth {
  status: 'ok' | 'error';      // Overall system status
  database: HealthCheckResult; // Database health details
  api: HealthCheckResult;      // API health details
  uptime: number;              // System uptime in seconds
  memory: {
    used: number;              // Used memory in MB
    total: number;             // Total allocated memory in MB
  };
}
```

**Example Response:**
```json
{
  "status": "ok",
  "database": {
    "status": "up",
    "details": {
      "responseTime": "8ms",
      "connection": "active"
    },
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  "api": {
    "status": "up",
    "details": {
      "version": "1.0.0",
      "environment": "development"
    },
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  "uptime": 3600,
  "memory": {
    "used": 128,
    "total": 256
  }
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/_health
```

---

## WebSocket Health Monitoring

### Connection Details
**Namespace:** `/health`
**URL:** `ws://localhost:3000/health`

**CORS Configuration:**
- **Origins:** Configurable via `CORS_ORIGINS` environment variable
- **Default Origins:** `http://localhost:4000`, `http://localhost:3000`
- **Credentials:** Configurable via `CORS_CREDENTIALS` environment variable (default: `true`)

### Features

#### Real-time Health Broadcasting
- **Automatic Broadcasting:** Health data is broadcast every 10 seconds to all connected clients
- **On-Demand Updates:** Immediate health status sent to new clients upon connection
- **Smart Broadcasting:** Broadcasting starts when the first client connects and stops when all clients disconnect

#### Events

##### 1. `health` Event
**Description:** Receives complete system health data in real-time.

**Data Schema:** Same as the complete system health check REST endpoint (`SystemHealth` interface).

**Example Data:**
```json
{
  "status": "ok",
  "database": {
    "status": "up",
    "details": {
      "responseTime": "5ms",
      "connection": "active"
    },
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  "api": {
    "status": "up",
    "details": {
      "version": "1.0.0",
      "environment": "development"
    },
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  "uptime": 3600,
  "memory": {
    "used": 128,
    "total": 256
  }
}
```

### Client Implementation Examples

#### JavaScript/Node.js
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000/health');

socket.on('connect', () => {
  console.log('Connected to health monitoring');
});

socket.on('health', (data) => {
  console.log('Health Status:', data);
  
  // Check overall system status
  if (data.status === 'error') {
    console.warn('System health issue detected!');
  }
  
  // Check database status
  if (data.database.status === 'down') {
    console.error('Database is down:', data.database.details);
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from health monitoring');
});
```

#### Browser JavaScript
```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
</head>
<body>
    <div id="health-status"></div>
    
    <script>
        const socket = io('http://localhost:3000/health');
        
        socket.on('health', (data) => {
            const statusDiv = document.getElementById('health-status');
            statusDiv.innerHTML = `
                <h3>System Status: ${data.status}</h3>
                <p>Database: ${data.database.status} (${data.database.details.responseTime})</p>
                <p>API: ${data.api.status}</p>
                <p>Uptime: ${data.uptime} seconds</p>
                <p>Memory: ${data.memory.used}MB / ${data.memory.total}MB</p>
            `;
        });
    </script>
</body>
</html>
```

#### Python
```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected to health monitoring')

@sio.event
def health(data):
    print(f"Health Status: {data}")
    
    if data['status'] == 'error':
        print("⚠️  System health issue detected!")
    
    if data['database']['status'] == 'down':
        print(f"❌ Database is down: {data['database']['details']}")
    else:
        print(f"✅ Database is healthy ({data['database']['details']['responseTime']})")

@sio.event
def disconnect():
    print('Disconnected from health monitoring')

sio.connect('http://localhost:3000/health')
sio.wait()
```

---

## Monitoring and Alerting

### Recommended Monitoring Strategy

1. **Liveness Checks:** Use `/api/_health/live` for basic service availability
2. **Readiness Checks:** Use `/api/_health/ready` for load balancer health checks
3. **Detailed Monitoring:** Use WebSocket connection for real-time monitoring dashboards
4. **Database Monitoring:** Monitor `/api/_health/db` response times and status
5. **Resource Monitoring:** Track memory usage from complete health check

### Alert Thresholds

- **Database Response Time:** Alert if > 100ms consistently
- **Memory Usage:** Alert if used memory > 80% of total
- **Database Status:** Immediate alert if status is 'down'
- **System Status:** Immediate alert if overall status is 'error'

### Integration Examples

#### Kubernetes Health Checks
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: whk-recipe-configuration
    livenessProbe:
      httpGet:
        path: /api/_health/live
        port: 3000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /api/_health/ready
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
```

#### Docker Compose Health Check
```yaml
version: '3.8'
services:
  whk-recipe-configuration:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/_health/ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

---

## Error Handling

### Common Error Scenarios

1. **Database Connection Lost:**
   - `/api/_health/ready` returns `404`
   - `/api/_health/db` returns `status: 'down'`
   - Complete health check shows `status: 'error'`

2. **High Memory Usage:**
   - Memory usage approaches total allocated memory
   - Monitor `memory.used` vs `memory.total` ratio

3. **WebSocket Connection Issues:**
   - Check CORS configuration
   - Verify network connectivity
   - Ensure proper namespace (`/health`)

### Troubleshooting

1. **Health Endpoints Not Responding:**
   - Verify service is running on correct port
   - Check if health module is properly imported in AppModule

2. **Database Health Check Failing:**
   - Verify database connection string
   - Check database server status
   - Review Prisma configuration

3. **WebSocket Connection Refused:**
   - Check CORS_ORIGINS environment variable
   - Verify WebSocket support in client library
   - Ensure correct namespace in connection URL

---

## Environment Configuration

### Environment Variables

```bash
# CORS Configuration for WebSocket
CORS_ORIGINS=http://localhost:3000,http://localhost:4000,https://yourdomain.com
CORS_CREDENTIALS=true

# Application Configuration
NODE_ENV=production
npm_package_version=1.0.0
```

### Default Values
- **CORS Origins:** `http://localhost:4000`, `http://localhost:3000`
- **CORS Credentials:** `true`
- **Health Broadcast Interval:** 10 seconds
- **WebSocket Namespace:** `/health`

---

## Security Considerations

- **Public Endpoints:** All health endpoints are publicly accessible by design
- **Information Disclosure:** Health endpoints may reveal system information
- **Rate Limiting:** Consider implementing rate limiting for health endpoints in production
- **Network Security:** Restrict access to health endpoints at the network level if needed

---

## Performance Impact

- **REST Endpoints:** Minimal performance impact, lightweight database query
- **WebSocket Broadcasting:** Low overhead, only active when clients are connected
- **Database Health Check:** Single `SELECT 1` query with response time measurement
- **Memory Monitoring:** Uses Node.js built-in `process.memoryUsage()` 