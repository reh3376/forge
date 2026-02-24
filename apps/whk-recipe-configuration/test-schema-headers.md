# Testing Schema Version Headers

This document explains how to test that the X-Schema-Version headers are properly added to both REST API and GraphQL responses.

## Prerequisites

1. Start the application:

   ```bash
   cd apps/whk-recipe-configuration
   npm run start:dev
   ```

2. Ensure the database is running and migrations have been applied.

## Testing REST API Headers

Test any REST endpoint to verify the `X-Schema-Version` header is included:

```bash
# Test the schema version endpoint itself
curl -I http://localhost:3000/api/schema-version

# Test any other REST endpoint (requires authentication)
curl -I -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/assets

# Expected response should include:
# X-Schema-Version: 20241206153420_fix_lot_status_enum
```

## Testing GraphQL Headers

Test GraphQL introspection or any query to verify the header:

```bash
# Test GraphQL introspection
curl -I -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'

# Test a simple GraphQL query (requires authentication)
curl -I -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "{ assets { id name } }"}'

# Expected response should include:
# X-Schema-Version: 20241206153420_fix_lot_status_enum
```

## Verification Points

1. **Header Presence**: Verify that `X-Schema-Version` header is present in all responses
2. **Correct Value**: The header value should match the latest migration name from `_prisma_migrations` table
3. **REST vs GraphQL**: Both REST and GraphQL endpoints should include the header
4. **Error Handling**: If schema version cannot be retrieved, the header should be omitted gracefully

## Implementation Details

- **REST API**: Uses `SchemaVersionHeaderInterceptor` as a global interceptor
- **GraphQL**: Uses `SchemaVersionPlugin` to add headers to Apollo Server responses
- **Caching**: Schema version is cached in `SchemaVersionService` for performance
- **Error Handling**: Failures to retrieve schema version don't break requests

## Troubleshooting

If headers are missing:

1. Check that the application started without errors
2. Verify that migrations have been applied (`npx prisma migrate status`)
3. Check application logs for any interceptor or plugin errors
4. Ensure the `_prisma_migrations` table exists and has data
