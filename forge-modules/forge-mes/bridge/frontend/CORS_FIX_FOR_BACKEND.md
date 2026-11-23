# CORS Fix for GraphQL Backend Server

## Problem
The frontend at `http://localhost:4000` cannot make GraphQL requests to the backend at `http://localhost:3000` due to CORS (Cross-Origin Resource Sharing) restrictions. The browser blocks these requests because:

1. The origins are different (different ports)
2. Apollo Server has CSRF protection enabled by default
3. The GraphQL server is not properly configured to handle CORS preflight requests

## Current Error
When the browser tries to make a GraphQL request, it first sends an OPTIONS preflight request, which gets blocked with:
```
This operation has been blocked as a potential Cross-Site Request Forgery (CSRF). Please either specify a 'content-type' header (with a type that is not one of application/x-www-form-urlencoded, multipart/form-data, text/plain) or provide a non-empty value for one of the following headers: x-apollo-operation-name, apollo-require-preflight
```

## Solution
Modify the GraphQL configuration in `/src/app.module.ts` to properly handle CORS and disable CSRF protection for development.

### File to Modify: `src/app.module.ts`

**Current GraphQL Configuration (around line 140-150):**
```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: (configService: ConfigService) => {
    const playground = configService.get("GRAPHQL_PLAYGROUND");
    const introspection = configService.get("GRAPHQL_INTROSPECTION");
    return {
      autoSchemaFile: "schema.graphql",
      sortSchema: true,
      playground,
      introspection: playground || introspection,
    };
  },
  inject: [ConfigService],
  imports: [ConfigModule],
}),
```

**Updated GraphQL Configuration:**
```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: (configService: ConfigService) => {
    const playground = configService.get("GRAPHQL_PLAYGROUND");
    const introspection = configService.get("GRAPHQL_INTROSPECTION");
    return {
      autoSchemaFile: "schema.graphql",
      sortSchema: true,
      playground,
      introspection: playground || introspection,
      cors: {
        origin: [
          'http://localhost:4000',
          'http://localhost:3000',
          'http://127.0.0.1:4000',
          'http://127.0.0.1:3000'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'apollo-require-preflight',
          'x-apollo-operation-name'
        ]
      },
      csrfPrevention: false, // Disable CSRF protection for development
    };
  },
  inject: [ConfigService],
  imports: [ConfigModule],
}),
```

## Alternative Solution (More Secure for Production)
If you want to keep CSRF protection enabled, you can configure it to work with CORS:

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: (configService: ConfigService) => {
    const playground = configService.get("GRAPHQL_PLAYGROUND");
    const introspection = configService.get("GRAPHQL_INTROSPECTION");
    return {
      autoSchemaFile: "schema.graphql",
      sortSchema: true,
      playground,
      introspection: playground || introspection,
      cors: {
        origin: [
          'http://localhost:4000',
          'http://localhost:3000',
          'http://127.0.0.1:4000',
          'http://127.0.0.1:3000'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'apollo-require-preflight',
          'x-apollo-operation-name'
        ]
      },
      csrfPrevention: {
        requestHeaders: ['apollo-require-preflight', 'x-apollo-operation-name']
      }
    };
  },
  inject: [ConfigService],
  imports: [ConfigModule],
}),
```

## Why This Fixes the Issue

1. **CORS Configuration**: Explicitly allows requests from the frontend origin (`http://localhost:4000`)
2. **Allowed Headers**: Includes the `apollo-require-preflight` header that the frontend is sending
3. **Methods**: Explicitly allows OPTIONS requests (needed for CORS preflight)
4. **CSRF Prevention**: Either disabled for development or configured to work with the headers being sent

## After Making Changes

1. Restart the GraphQL server
2. The frontend should now be able to successfully make GraphQL requests
3. The scheduling page should load production data without errors

## Testing
You can verify the fix works by:
1. Opening browser dev tools
2. Going to the scheduling page
3. Checking that GraphQL requests in the Network tab return 200 status codes instead of CORS errors 