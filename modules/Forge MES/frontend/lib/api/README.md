# GraphQL Client Consolidation

This directory contains the unified GraphQL client architecture that consolidates all GraphQL operations for the MES backend into a single, cohesive system.

## Overview

Previously, the codebase had multiple GraphQL clients scattered across different files:
- `graphql-client.ts` - Main Apollo client
- `graphql-client-config.ts` - Configurable client
- `mes-client.ts` - MES-specific client using graphql-request
- `recipe-client.ts` - Recipe-specific operations
- `api.ts` - Simple GraphQL client utility

This has been consolidated into a unified architecture that provides:
- **Single authentication flow** (JWT + MSAL fallback)
- **Consistent error handling**
- **Optimized caching configuration**
- **Better TypeScript support**
- **Centralized configuration**

## New Architecture

### Core Files

#### `unified-graphql-client.ts`
The main GraphQL client class that handles all GraphQL operations with proper authentication.

```typescript
import { unifiedGraphQLClient } from '@/lib/api'

// Query example
const recipes = await unifiedGraphQLClient.query(RECIPE_QUERIES.GET_RECIPES, {
  variables: { skip: 0, take: 10 }
})

// Mutation example
const newRecipe = await unifiedGraphQLClient.mutate(RECIPE_MUTATIONS.CREATE_RECIPE, {
  variables: { data: recipeInput }
})
```

#### `graphql-queries.ts`
Centralized location for all GraphQL queries and mutations, organized by domain.

```typescript
import { RECIPE_QUERIES, PRODUCTION_ORDER_MUTATIONS } from '@/lib/api'

// All queries are properly typed and organized
const recipe = await unifiedGraphQLClient.query(RECIPE_QUERIES.GET_RECIPE, {
  variables: { id: 'recipe-123' }
})
```

#### `unified-recipe-client.ts`
Domain-specific client for recipe operations that uses the unified GraphQL client internally.

```typescript
import { unifiedRecipeClient } from '@/lib/api'

// High-level recipe operations
const recipes = await unifiedRecipeClient.getRecipes({ skip: 0, take: 10 })
const recipe = await unifiedRecipeClient.getRecipe('recipe-123')
```

#### `unified-apollo-provider.tsx`
React provider that uses the unified GraphQL client.

```typescript
import { UnifiedGraphQLProvider } from '@/lib/api'

function App() {
  return (
    <UnifiedGraphQLProvider>
      {/* Your app components */}
    </UnifiedGraphQLProvider>
  )
}
```

## Authentication Flow

The unified client handles authentication in the following priority order:

1. **JWT Authentication** (Primary)
   - Uses `jwtAuthService.getToken()`
   - Preferred for backend API calls

2. **MSAL Authentication** (Fallback)
   - Uses `getAuthToken()` from auth-utils
   - Falls back when JWT is not available

3. **No Authentication**
   - Continues without token
   - Logs appropriate messages

## Migration Guide

### Before (Multiple Clients)

```typescript
// Old way - multiple imports and clients
import { mesGraphQLClient } from '@/lib/api/graphql-client'
import { recipeClient } from '@/lib/api/recipe-client'
import { GraphQLProvider } from '@/lib/api/apollo-provider'
import { GET_RECIPES } from '@/lib/api/recipe-queries'

// Different clients for different operations
const recipes = await mesGraphQLClient.query({ query: GET_RECIPES })
const recipe = await recipeClient.getRecipe('123')
```

### After (Unified Client)

```typescript
// New way - single unified approach
import { 
  unifiedGraphQLClient,
  unifiedRecipeClient,
  UnifiedGraphQLProvider,
  RECIPE_QUERIES
} from '@/lib/api'

// Consistent interface across all operations
const recipes = await unifiedGraphQLClient.query(RECIPE_QUERIES.GET_RECIPES)
const recipe = await unifiedRecipeClient.getRecipe('123')
```

## Configuration

The unified client uses the backend configuration from `config/backend.ts`:

```typescript
// Automatically uses the configured backend
const backendConfig = getCurrentBackendConfig()
// GraphQL endpoint: backendConfig.graphqlUrl
```

## Error Handling

All GraphQL operations use consistent error handling:

```typescript
try {
  const result = await unifiedGraphQLClient.query(RECIPE_QUERIES.GET_RECIPES)
} catch (error) {
  // Errors are properly formatted and logged
  console.error('GraphQL Error:', graphqlUtils.extractError(error))
}
```

## Caching

The unified client includes optimized caching policies for MES data:

- **Recipes**: Cached with merge policies for related data
- **Production Orders**: Cached with equipment and personnel merging
- **Equipment Status**: Fresh data (no caching)
- **Live Metrics**: Always fresh
- **Customers**: Cached for performance

## Backward Compatibility

Legacy exports are maintained for backward compatibility but marked as deprecated:

```typescript
// Still works but deprecated
import { mesGraphQLClient } from '@/lib/api'

// Preferred new approach
import { unifiedGraphQLClient } from '@/lib/api'
```

## Benefits

1. **Reduced Complexity**: Single client instead of multiple scattered clients
2. **Consistent Authentication**: Unified JWT + MSAL flow
3. **Better Error Handling**: Centralized error formatting and logging
4. **Improved Performance**: Optimized caching and retry logic
5. **Type Safety**: Better TypeScript support throughout
6. **Maintainability**: Single source of truth for GraphQL operations

## Future Considerations

- Remove deprecated exports after migration is complete
- Add more domain-specific clients (production, equipment, etc.)
- Implement subscription support for real-time updates
- Add query optimization and batching

## Files to Eventually Remove

Once migration is complete, these files can be removed:
- `graphql-client.ts`
- `graphql-client-config.ts` 
- `mes-client.ts`
- `recipe-client.ts` (replaced by unified-recipe-client.ts)
- `recipe-queries.ts` (consolidated into graphql-queries.ts)
- `apollo-provider.tsx` (replaced by unified-apollo-provider.tsx) 