# Schema Version Headers Implementation

This document describes the implementation of automatic schema version headers for both REST API and GraphQL responses.

## Overview

The system automatically adds an `X-Schema-Version` header to all HTTP responses (both REST and GraphQL) containing the current database schema version. This allows clients to understand which version of the database schema they are interacting with.

## Implementation Components

### 1. SchemaVersionHeaderInterceptor

**File:** `src/interceptors/schemaVersionHeader.interceptor.ts`

A global NestJS interceptor that adds the `X-Schema-Version` header to all REST API responses.

**Features:**

- Applies only to HTTP requests (skips GraphQL context types)
- Sets headers before response processing to avoid timing issues
- Graceful error handling (logs warnings but doesn't break requests)
- Checks if headers are already sent to prevent errors

**Registration:** Automatically registered as a global interceptor in `src/app.module.ts`

### 2. SchemaVersionPlugin

**File:** `src/graphql/schemaVersionPlugin.ts`

An Apollo Server plugin that adds the `X-Schema-Version` header to all GraphQL responses.

**Features:**

- Hooks into Apollo Server's `willSendResponse` event
- Adds headers to all GraphQL operations (queries, mutations, introspection)
- Graceful error handling
- Works with both successful responses and errors

**Registration:** Added to Apollo Server configuration in `src/app.module.ts`

### 3. SchemaVersionService

**File:** `src/schemaVersion/schemaVersion.service.ts`

Service that retrieves the current schema version from the database.

**Method:** `getVersion()` - Returns the latest migration name from the database

## Configuration

Both components are automatically registered in `src/app.module.ts`:

```typescript
// Global interceptor for REST API
{
  provide: APP_INTERCEPTOR,
  useClass: SchemaVersionHeaderInterceptor,
}

// GraphQL plugin
GraphQLModule.forRoot<ApolloDriverConfig>({
  // ... other config
  plugins: [SchemaVersionPlugin],
})
```

## Usage Examples

### REST API

```bash
# Get schema version from any REST endpoint
curl -I http://localhost:3000/api/schema-version

# Response will include:
# X-Schema-Version: 20241206153420_fix_lot_status_enum
```

### GraphQL

```bash
# Get schema version from GraphQL endpoint
curl -X POST http://localhost:3000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { __schema { types { name } } }"}' \
  -v

# Response headers will include:
# X-Schema-Version: 20241206153420_fix_lot_status_enum
```

## Testing

### Unit Tests

Run schema version related tests:

```bash
npm run test:schema-headers
```

This runs tests for:

- `SchemaVersionHeaderInterceptor` (6 tests)
- `SchemaVersionPlugin` (7 tests)
- `SchemaVersionService` (1 test)

### Manual Testing

Use the provided test script:

```bash
./scripts/test-schema-headers.sh
```

## Error Handling

Both implementations include robust error handling:

1. **Service Errors**: If `SchemaVersionService.getVersion()` fails, errors are logged but requests continue normally
2. **Header Timing**: Checks prevent setting headers after they've already been sent
3. **Null Versions**: Gracefully handles cases where no schema version is available
4. **Non-Breaking**: All errors are caught and logged, ensuring the functionality never breaks existing requests

## Schema Version Format

The schema version typically follows Prisma migration naming format:

- Format: `YYYYMMDDHHMMSS_description`
- Example: `20241206153420_fix_lot_status_enum`

## Benefits

1. **Client Compatibility**: Clients can verify they're compatible with the current schema
2. **Debugging**: Easier to debug issues by knowing exact schema version
3. **API Versioning**: Enables schema-aware client behavior
4. **Monitoring**: Operations teams can track schema versions across environments
5. **Automatic**: No manual intervention required - headers are added automatically

## Performance Impact

- **Minimal**: Schema version is retrieved once per request
- **Cached**: Service can implement caching if needed for high-traffic scenarios
- **Async**: Version lookup doesn't block request processing
- **Optional**: If version lookup fails, request continues normally
