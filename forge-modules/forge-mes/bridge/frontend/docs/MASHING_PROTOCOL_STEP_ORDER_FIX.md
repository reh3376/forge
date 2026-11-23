# Mashing Protocol Step Order Preservation Fix

## Issue Description

When loading mashing protocol templates in the recipe creation wizard, the step order was not being preserved correctly. Steps were appearing in the wrong sequence compared to how they were saved in the template.

## Root Cause

The GraphQL query `GET_MASHING_PROTOCOL_TEMPLATES` had two critical issues:

1. **Missing `index` field**: The query was not fetching the `index` field from the database, which contains the correct step order
2. **No ordering specified**: The query was not ordering the steps by their index, so they could be returned in any order
3. **Generated index**: The processing logic was generating step indexes based on array position instead of using the actual database index

## Database Structure

The `MashingProtocolStep` table stores steps with an `index` field that preserves the correct order:

```sql
SELECT 
    mps."index",
    mps."stepType",
    mps."holdType"
FROM "MashingProtocolStep" mps
WHERE mps."mashingProtocolId" = 'template_id'
ORDER BY mps."index" ASC;
```

## Fix Implementation

### 1. Updated GraphQL Query

**File:** `lib/api/graphql-queries.ts`

Added the missing `index` field and proper ordering:

```graphql
export const GET_MASHING_PROTOCOL_TEMPLATES = gql`
  query GetMashingProtocolTemplates {
    mashingProtocols(where: { isTemplate: { equals: true } }) {
      id
      name
      templateCategory
      templateDescription
      createdBy
      steps(orderBy: { index: Asc }) {  # Added ordering
        id
        index                           # Added index field
        stepTime
        stepType
        holdType
        heatTempSp
        coolTempSp
        temperatureSetpoint
        agitatorEnabled
        agitatorSpdSp
        recipeBomItem {
          id
          quantity
          item {
            id
            itemNumber
            itemName
          }
        }
      }
    }
  }
`;
```

### 2. Updated TypeScript Interfaces

**File:** `lib/hooks/use-mashing-protocol-templates.ts`

Added the `index` field to the GraphQL response interface:

```typescript
interface GraphQLMashingProtocolStep {
  id: string
  index: number          // Added index field
  stepTime: number | null
  stepType: string
  holdType: string | null
  heatTempSp: number | null
  coolTempSp: number | null
  temperatureSetpoint: number | null
  agitatorEnabled: boolean | null
  agitatorSpdSp: number | null
  recipeBomItem: GraphQLRecipeBomItem[]
}
```

### 3. Updated Processing Logic

**File:** `lib/hooks/use-mashing-protocol-templates.ts`

Changed from generating index to using the actual database index:

```typescript
// Before (incorrect)
steps: template.steps.map((step, index) => {
  const stepData = {
    id: step.id,
    index: index + 1,  // Generated from array position
    stepType: step.stepType,
    // ...
  }
})

// After (correct)
steps: template.steps.map((step) => {
  const stepData = {
    id: step.id,
    index: step.index,  // Use actual database index
    stepType: step.stepType,
    // ...
  }
})
```

## Testing

### Database Verification

You can verify the correct step order in the database:

```sql
SELECT 
    mp.name as protocol_name,
    mps."index",
    mps."stepType",
    mps."holdType"
FROM "MashingProtocol" mp
JOIN "MashingProtocolStep" mps ON mp.id = mps."mashingProtocolId"
WHERE mp."isTemplate" = true
  AND mp.name = 'Standard Rye Bourbon'
ORDER BY mps."index" ASC;
```

### UI Testing

1. Navigate to the recipe creation wizard
2. Select a mashing protocol template
3. Verify that the steps appear in the correct order (1, 2, 3, 4, etc.)
4. Check that the step types follow the expected sequence (e.g., LiquidAdd → Hold → AdditiveAdd → Malt → etc.)

## Impact

- ✅ **Step order preservation**: Templates now load with steps in the correct sequence
- ✅ **Data integrity**: Step indexes match the original template exactly
- ✅ **User experience**: Recipe creation follows the intended mashing protocol sequence
- ✅ **Backward compatibility**: Existing templates continue to work correctly
- ✅ **No database changes**: Fix only required GraphQL and processing logic updates

## Files Modified

1. `lib/api/graphql-queries.ts` - Added index field and ordering to GraphQL query
2. `lib/hooks/use-mashing-protocol-templates.ts` - Updated interfaces and processing logic
3. `docs/MASHING_PROTOCOL_STEP_ORDER_FIX.md` - This documentation

## Related Issues

This fix complements the previous temperature setpoint loading fix and ensures that mashing protocol templates are loaded completely and correctly, preserving both the step order and temperature data. 