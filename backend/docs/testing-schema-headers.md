# Testing Schema Version Headers

This document describes how to test the schema version header functionality.

## Overview

The schema version header implementation adds `X-Schema-Version` headers to both REST API and GraphQL responses. This allows clients to determine the current database schema version being used by the server.

## Test Types

### Unit Tests

Unit tests verify the individual components work correctly in isolation:

- **`SchemaVersionHeaderInterceptor`** - Tests the REST API interceptor
- **`SchemaVersionPlugin`** - Tests the GraphQL plugin

**Location**: `src/interceptors/schemaVersionHeader.interceptor.spec.ts` and `src/graphql/schemaVersionPlugin.spec.ts`

### End-to-End Tests

E2E tests verify the complete functionality works in a real application context:

- REST API endpoints include the header
- GraphQL queries include the header
- Headers contain the correct schema version
- Performance impact is minimal

**Location**: `src/tests/e2e/schema-version-headers.e2e-spec.ts`

## Running Tests

### Quick Test Script

Run the comprehensive test suite:

```bash
./scripts/test-schema-headers.sh
```

### Individual Test Commands

```bash
# Unit tests only
npm run test:unit -- --testPathPattern="(schemaVersionHeader|schemaVersionPlugin)"

# E2E tests only
npm run test:e2e -- --testPathPattern="schema-version-headers"

# All schema header related tests
npm run test:schema-headers
```

### Manual Testing

You can also test manually with curl:

```bash
# Test REST API
curl -I http://localhost:3000/api/schema-version

# Test GraphQL
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' \
  -I
```

Both should return an `X-Schema-Version` header.

## Expected Behavior

### REST API

- All HTTP responses should include `X-Schema-Version` header
- Header value should match the latest Prisma migration name
- Works for 200, 404, 500, and other response codes

### GraphQL

- All GraphQL responses should include `X-Schema-Version` header
- Works for queries, mutations, introspection, and errors
- Header value should be consistent with REST API

### Error Handling

- If schema version cannot be determined, no header is added
- Errors in version retrieval are logged but don't break requests
- System continues to function normally even if versioning fails

## Troubleshooting

### Common Issues

1. **Header not appearing**:

   - Check that the interceptor is registered in `app.module.ts`
   - Verify the GraphQL plugin is configured
   - Ensure database connection is working

2. **Tests failing**:

   - Make sure database is running
   - Run `npm run prisma:generate` to update client
   - Check that migrations have been applied

3. **Performance issues**:
   - Schema version is cached to minimize database queries
   - Check database connection pool settings
   - Monitor query performance in logs

### Debug Mode

Enable debug logging to see schema version retrieval:

```bash
DEBUG=schema-version npm run start:dev
```

## Implementation Details

The implementation consists of:

1. **Global HTTP Interceptor** (`SchemaVersionHeaderInterceptor`)

   - Applies to all REST API endpoints
   - Uses NestJS interceptor pattern
   - Runs after request processing

2. **GraphQL Plugin** (`SchemaVersionPlugin`)

   - Apollo Server plugin
   - Hooks into `willSendResponse` event
   - Works with both queries and introspection

3. **Schema Version Service** (`SchemaVersionService`)
   - Queries `_prisma_migrations` table
   - Caches results for performance
   - Handles database connection errors

Both components use the same `SchemaVersionService` to ensure consistency.
