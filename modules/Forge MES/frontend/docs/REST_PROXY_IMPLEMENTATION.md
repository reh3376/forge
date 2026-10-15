# REST API Proxy Implementation

## Overview

This document describes the REST API proxy implementation that resolves authentication issues with schedule order queue operations in the MES UI application.

## Problem Statement

The schedule order queue operations (move up/down, scheduling) were experiencing unauthorized (401) errors when making direct REST API calls to the backend, while GraphQL operations worked correctly through the existing GraphQL proxy.

## Solution

We implemented a REST API proxy similar to the existing GraphQL proxy (`/api/graphql/route.ts`) that:

1. **Handles Authentication**: Automatically forwards JWT tokens and adds development mode headers
2. **Proxies All HTTP Methods**: Supports GET, POST, PUT, PATCH, DELETE operations
3. **Preserves Request/Response**: Maintains original request structure and response format
4. **Provides Error Handling**: Forwards backend errors with proper status codes

## Implementation Details

### REST Proxy Endpoint

**File**: `app/api/rest/[...path]/route.ts`

**Endpoint Pattern**: `/api/rest/[...path]`

**Example Usage**:
- Original: `http://localhost:3000/api/scheduleOrderQueues/move-up`
- Via Proxy: `/api/rest/scheduleOrderQueues/move-up`

### Authentication Handling

The proxy automatically adds authentication headers:

```typescript
// JWT Bearer token (if available)
if (authHeader) {
  authHeaders['authorization'] = authHeader
}

// Development mode headers (when no auth token)
if (process.env.NODE_ENV === 'development' && !authHeader) {
  authHeaders['x-development-mode'] = 'true'
  authHeaders['x-demo-user'] = 'true'
  authHeaders['x-demo-user-id'] = 'demo-user-supervisor'
  authHeaders['x-demo-user-role'] = 'OPS_DISTILLERY_SUPERVISOR'
}
```

### Updated API Client

**File**: `lib/api/schedule-order-queue.ts`

**Change**: Updated `API_BASE` from direct backend URL to proxy:

```typescript
// Before
const API_BASE = process.env['NEXT_PUBLIC_MES_API_URL'] || 'http://localhost:3000/api'

// After
const API_BASE = '/api/rest'
```

## Supported Operations

The REST proxy supports all schedule order queue operations:

### Move Operations
- **Move Up**: `PATCH /api/rest/scheduleOrderQueues/update-schedule-order-queue-index/{id}`
- **Move Down**: `PATCH /api/rest/scheduleOrderQueues/update-schedule-order-queue-index/{id}`

### Queue Management
- **Add to Queue**: `POST /api/rest/scheduleOrderQueues/add-to-pending-schedule-order-queue`
- **Remove from Queue**: `PATCH /api/rest/scheduleOrderQueues/deactivate-schedule-order-queue/{id}`

### Query Operations
- **List Queue Items**: `GET /api/rest/scheduleOrderQueues`

## Testing

### Test Pages

1. **REST Proxy Test**: `/debug/rest-proxy-test`
   - Tests basic proxy functionality
   - Validates authentication forwarding
   - Tests move operations

2. **Schedule API Test**: `/debug/schedule-api-test`
   - Updated to use REST proxy
   - Tests all queue operations
   - Provides comprehensive API testing

### Manual Testing

```bash
# Test proxy connectivity (should return 401 without auth)
curl http://localhost:4000/api/rest/scheduleOrderQueues

# Test with the application (authenticated)
# Use the test pages in the browser
```

## Benefits

1. **Consistent Authentication**: Same auth handling as GraphQL operations
2. **Development Mode Support**: Works with demo users in development
3. **Error Transparency**: Backend errors are properly forwarded
4. **Minimal Code Changes**: Only required updating the API base URL
5. **Future-Proof**: Can be used for other REST API operations

## Configuration

### Environment Variables

The proxy uses the same backend configuration as other components:

```env
NEXT_PUBLIC_MES_API_URL=http://localhost:3000/api
NEXT_PUBLIC_API_URL=http://localhost:3000/api  # fallback
```

### Development Mode

In development mode, the proxy automatically adds demo user headers when no authentication token is present, allowing testing without full authentication setup.

## Monitoring and Debugging

### Logging

The proxy includes comprehensive logging:

```typescript
console.log(`🔄 REST Proxy: ${method} ${finalUrl}`, {
  hasAuth: !!(authHeader || bearerToken),
  headers: Object.keys(authHeaders),
  path: `/${path}`
})
```

### Error Handling

- **Network Errors**: Logged with full context
- **Backend Errors**: Forwarded with original status codes
- **Proxy Errors**: Return 500 with generic error message

## Future Enhancements

1. **Caching**: Add response caching for GET requests
2. **Rate Limiting**: Implement request rate limiting
3. **Metrics**: Add performance monitoring
4. **Request Transformation**: Add request/response transformation if needed

## Related Files

- `app/api/rest/[...path]/route.ts` - REST proxy implementation
- `lib/api/schedule-order-queue.ts` - Updated API client
- `app/debug/rest-proxy-test/page.tsx` - REST proxy test page
- `app/debug/schedule-api-test/page.tsx` - Updated schedule API test page
- `app/api/graphql/route.ts` - Similar GraphQL proxy (reference)

## Conclusion

The REST proxy implementation successfully resolves the authentication issues with schedule order queue operations by providing a consistent authentication layer similar to the existing GraphQL proxy. This approach maintains the existing API structure while ensuring proper authentication handling across all REST operations. 