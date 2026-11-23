# Temperature Setpoint Loading Fix

## Issue Description

When loading mashing protocol templates in the recipe creation wizard, the temperature setpoints (Temp SP column) were showing as empty even though the templates contained temperature data in the database.

## Root Cause

The GraphQL query `GET_MASHING_PROTOCOL_TEMPLATES` in `lib/api/graphql-queries.ts` was missing the temperature fields:
- `heatTempSp`
- `coolTempSp` 
- `temperatureSetpoint`
- `agitatorEnabled`
- `agitatorSpdSp`

This meant that when templates were loaded, the temperature data was not being fetched from the database.

## Fix Implementation

### 1. Updated GraphQL Query

**File:** `lib/api/graphql-queries.ts`

Added the missing temperature fields to the `GET_MASHING_PROTOCOL_TEMPLATES` query:

```graphql
export const GET_MASHING_PROTOCOL_TEMPLATES = gql`
  query GetMashingProtocolTemplates {
    mashingProtocols(where: { isTemplate: { equals: true } }) {
      id
      name
      templateCategory
      templateDescription
      createdBy
      steps {
        id
        stepTime
        stepType
        holdType
        heatTempSp          # ← Added
        coolTempSp          # ← Added
        temperatureSetpoint # ← Added
        agitatorEnabled     # ← Added
        agitatorSpdSp       # ← Added
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

Updated the `GraphQLMashingProtocolStep` interface to include the temperature fields:

```typescript
interface GraphQLMashingProtocolStep {
  id: string
  stepTime: number | null
  stepType: string
  holdType: string | null
  heatTempSp: number | null          // ← Added
  coolTempSp: number | null          // ← Added
  temperatureSetpoint: number | null // ← Added
  agitatorEnabled: boolean | null    // ← Added
  agitatorSpdSp: number | null       // ← Added
  recipeBomItem: GraphQLRecipeBomItem[]
}
```

### 3. Enhanced Template Processing Logic

**File:** `lib/hooks/use-mashing-protocol-templates.ts`

Updated the template processing logic to properly handle the temperature fields:

```typescript
// Add optional properties only if they have values
if (step.holdType) {
  stepData.holdType = step.holdType
}
if (step.stepTime) {
  stepData.stepTime = step.stepTime
}
if (step.heatTempSp !== null && step.heatTempSp !== undefined) {
  stepData.heatTempSp = step.heatTempSp
}
if (step.coolTempSp !== null && step.coolTempSp !== undefined) {
  stepData.coolTempSp = step.coolTempSp
}
if (step.temperatureSetpoint !== null && step.temperatureSetpoint !== undefined) {
  stepData.temperatureSetpoint = step.temperatureSetpoint
}
if (step.agitatorEnabled !== null && step.agitatorEnabled !== undefined) {
  stepData.agitatorEnabled = step.agitatorEnabled
}
if (step.agitatorSpdSp !== null && step.agitatorSpdSp !== undefined) {
  stepData.agitatorSpdSp = step.agitatorSpdSp
}
```

## Temperature Display Logic

The temperature display uses the `getTemperatureDisplay()` function from `lib/utils/temperature-utils.ts`, which intelligently handles different temperature field configurations:

- **Heat steps**: Uses `heatTempSp`
- **Cool steps**: Uses `coolTempSp` (with fallback to `heatTempSp` for legacy data)
- **None/Other steps**: Uses `heatTempSp`, then `coolTempSp`, then `temperatureSetpoint`

## Testing

### Manual Testing

1. **Navigate to Recipe Creation:**
   - Go to `/recipe-management/create`
   - Proceed to the Mashing Protocol step

2. **Load a Template:**
   - Select a template from the dropdown
   - Click "Load Template"
   - Verify that the Temp SP column now shows temperature values

3. **Debug Page Testing:**
   - Navigate to `/debug/mashing-template-test`
   - Test template loading functionality
   - Verify temperature values are displayed correctly

### Expected Behavior

- ✅ Temperature setpoints should now appear in the Temp SP column when loading templates
- ✅ Different hold types (Heat/Cool/None) should display appropriate temperature values
- ✅ Legacy templates with `temperatureSetpoint` should still work as fallback
- ✅ Templates without temperature data should show empty cells (not break)

## Related Files

- `lib/api/graphql-queries.ts` - GraphQL query definitions
- `lib/hooks/use-mashing-protocol-templates.ts` - Template loading logic
- `lib/utils/temperature-utils.ts` - Temperature display utilities
- `components/ui/recipe-components.tsx` - Mashing protocol table display
- `app/debug/mashing-template-test/page.tsx` - Test page for verification

## Database Schema

The fix relies on these database fields in the `MashingProtocolStep` table:
- `heatTempSp` (number) - Temperature setpoint for heating steps
- `coolTempSp` (number) - Temperature setpoint for cooling steps  
- `temperatureSetpoint` (number) - Legacy temperature field
- `agitatorEnabled` (boolean) - Agitator enable flag
- `agitatorSpdSp` (number) - Agitator speed setpoint

## Notes

- This fix maintains backward compatibility with existing templates
- The temperature display logic handles edge cases and data inconsistencies
- No database migrations were required - only the GraphQL query and processing logic needed updates 