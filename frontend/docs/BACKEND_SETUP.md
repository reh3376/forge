# Backend Configuration Guide

This guide explains how to configure the MES UI to connect to different backend services.

## Quick Setup

### Option 1: Use Environment Variables (Recommended)

Add these to your `.env.local` file:

```bash
# For connecting to a separate MES backend
NEXT_PUBLIC_BACKEND_CONFIG=local_mes
NEXT_PUBLIC_MES_API_URL=http://localhost:8000/api
NEXT_PUBLIC_MES_GRAPHQL_URL=http://localhost:8000/graphql
NEXT_PUBLIC_SOCKET_URL=http://localhost:8001

# Or use a predefined configuration
NEXT_PUBLIC_BACKEND_CONFIG=dev_mes
```

### Option 2: Use Predefined Configurations

Set `NEXT_PUBLIC_BACKEND_CONFIG` to one of:

- `local_mes` - Connect to local MES backend on port 8000 (default)
- `dev_mes` - Connect to development MES server
- `prod_mes` - Connect to production MES server
- `custom` - Use custom URLs from environment variables
- `nextjs` - Use Next.js internal APIs (deprecated - backend required)

## Available Configurations

### Next.js Internal (Default)
```bash
NEXT_PUBLIC_BACKEND_CONFIG=nextjs
```
- Uses Next.js API routes
- Good for development without external backend
- Health endpoints: `/api/_health`, `/api/_health/db`, etc.

### Local MES Backend (Default)
```bash
NEXT_PUBLIC_BACKEND_CONFIG=local_mes
```
- Connects to MES backend running on localhost:8000
- Assumes standard MES API structure
- Health endpoints: `/health`, `/api/health`, `/status`

### Development MES Backend
```bash
NEXT_PUBLIC_BACKEND_CONFIG=dev_mes
```
- Connects to development MES server
- Uses `dev-mes.whiskeyhouse.local:8000`

### Production MES Backend
```bash
NEXT_PUBLIC_BACKEND_CONFIG=prod_mes
```
- Connects to production MES server
- Uses HTTPS endpoints

### Custom Configuration
```bash
NEXT_PUBLIC_BACKEND_CONFIG=custom
NEXT_PUBLIC_MES_API_URL=http://your-backend:8000/api
NEXT_PUBLIC_MES_GRAPHQL_URL=http://your-backend:8000/graphql
NEXT_PUBLIC_SOCKET_URL=http://your-backend:8001
```

## Health Monitoring

The health monitoring system will:

1. **Connect to your configured MES backend**
2. **Show an error if backend is unavailable** - backend is required
3. **Display backend data source** in the dashboard

### Backend Health Endpoint Formats Supported

The system supports multiple health check response formats:

#### Format 1: Standard Health Check
```json
{
  "status": "UP",
  "checks": {
    "database": {
      "status": "UP",
      "responseTime": "5ms"
    },
    "api": {
      "status": "UP",
      "responseTime": "2ms"
    }
  },
  "uptime": 3600,
  "memory": { "used": 256, "total": 512 }
}
```

#### Format 2: Simple Status
```json
{
  "status": "healthy",
  "database": { "status": "up", "responseTime": "3ms" },
  "uptime": 3600,
  "version": "1.0.0"
}
```

## Testing Your Backend Connection

1. **Check the health monitoring page**: `/diagnostics/health-monitoring`
2. **Look for the "Backend" badge** in the overview section
3. **Use the endpoint tester** to manually test health endpoints
4. **Check browser console** for connection errors

## Common Backend URLs

| Service | Local | Development | Production |
|---------|-------|-------------|------------|
| API | `http://localhost:8000/api` | `http://dev-mes.whiskeyhouse.local:8000/api` | `https://mes-api.whiskeyhouse.com/api` |
| GraphQL | `http://localhost:8000/graphql` | `http://dev-mes.whiskeyhouse.local:8000/graphql` | `https://mes-api.whiskeyhouse.com/graphql` |
| WebSocket | `http://localhost:8001` | `http://dev-mes.whiskeyhouse.local:8001` | `wss://mes-ws.whiskeyhouse.com` |

## Troubleshooting

### Backend Not Connecting
1. Verify the backend service is running
2. Check the URL and port in your configuration
3. Ensure CORS is configured on the backend
4. Check network connectivity

### Health Checks Failing
1. Verify health endpoints exist on your backend
2. Check the response format matches supported formats
3. Ensure proper HTTP status codes (200 for healthy)
4. Check for authentication requirements

### Mixed Data Sources
If you see "Mixed Sources" in the dashboard:
- Backend is partially responding
- Some data comes from backend, some from Next.js
- Usually indicates backend is missing some endpoints

## Development Workflow

1. **Start with local backend** (`local_mes` config) - default configuration
2. **Use development backend** (`dev_mes` config) for integration testing
3. **Deploy with production backend** (`prod_mes` config)

**Note:** Backend is now required. Ensure your MES backend is running before starting the UI.

## Environment File Example

```bash
# .env.local
NEXT_PUBLIC_BACKEND_CONFIG=local_mes
NEXT_PUBLIC_MES_API_URL=http://localhost:8000/api
NEXT_PUBLIC_MES_GRAPHQL_URL=http://localhost:8000/graphql
NEXT_PUBLIC_SOCKET_URL=http://localhost:8001
```

After changing configuration, restart the Next.js development server. 