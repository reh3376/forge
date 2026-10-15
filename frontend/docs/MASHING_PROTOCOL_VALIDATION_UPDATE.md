# Mashing Protocol Validation Enhancement

## Overview

Updated the mashing protocol validation to additionally check for grains, additive, or water/liquid steps that do not have a linked recipeBom item, ensuring better data integrity in recipe configurations.

## Changes Made

### 1. Enhanced Validation Logic (`components/recipe/recipe-mashing-step.tsx`)

**Previous Behavior:**
- Only validated that existing recipeBom items in mashing steps were present in the recipe BOM
- Did not check if steps that require BOM items were missing them

**New Behavior:**
- Validates that steps requiring BOM items (`Corn`, `Wheat`, `Rye`, `Malt`, `AdditiveAdd`, `LiquidAdd`) have linked recipeBom items
- Still validates that any existing recipeBom items are present in the recipe BOM
- Provides specific error messages based on step type (grain, additive, water/liquid)

**Key Function Updated:**
```typescript
const validateMashingStepBOMItems = useCallback((mashingSteps: MashingStep[]): string[] => {
  // ... validation logic
  const requiresRecipeBomItem = (stepType: string): boolean => {
    return ['Corn', 'Wheat', 'Rye', 'Malt', 'AdditiveAdd', 'LiquidAdd'].includes(stepType)
  }
  // ... rest of validation
}, [getBOMIngredientsFromWizard])
```

### 2. Updated Item Selection Logic (`components/ui/recipe-components.tsx`)

**Changes:**
- Added `LiquidAdd` to the `requiresItemSelection` function
- Added filtering logic for `LiquidAdd` steps to show water-related items

**Updated Functions:**
```typescript
const requiresItemSelection = (stepType: string) => {
  return ['Corn', 'Wheat', 'Rye', 'Malt', 'AdditiveAdd', 'LiquidAdd'].includes(stepType)
}

const getFilteredItems = (stepType: string) => {
  // ... existing cases
  case 'LiquidAdd':
    // For liquid steps, show items with water-related item groups
    return items.filter((item: ApiItem) => {
      const itemGroup = item.itemGroup?.toUpperCase()
      return itemGroup === 'RM-WATER' || itemGroup === 'RM-LIQ' || 
             itemGroup?.includes('WATER') || itemGroup?.includes('LIQUID')
    })
  // ... rest of cases
}
```

### 3. Added Comprehensive Tests (`components/recipe/__tests__/recipe-mashing-step.test.tsx`)

**Test Coverage:**
- Validates that grain steps require recipeBom items
- Validates that liquid steps require recipeBom items  
- Validates that additive steps require recipeBom items
- Validates that recipeBom items exist in recipe BOM
- Confirms Hold steps don't require recipeBom items
- Tests multiple missing BOM items scenario
- Tests valid configuration passes validation

## Step Types Requiring BOM Items

| Step Type | Category | Item Groups | Required |
|-----------|----------|-------------|----------|
| `Corn` | Grain | `RM-GR-*` | ✅ |
| `Wheat` | Grain | `RM-GR-*` | ✅ |
| `Rye` | Grain | `RM-GR-*` | ✅ |
| `Malt` | Grain | `RM-GR-*`, `RM-MLT` | ✅ |
| `AdditiveAdd` | Additive | `RM-ENZ`, `RM-YEA`, `RM-ADD` | ✅ |
| `LiquidAdd` | Water/Liquid | `RM-WATER`, `RM-LIQ` | ✅ |
| `Hold` | Control | N/A | ❌ |
| `Prompt` | Control | N/A | ❌ |

## Error Messages

The validation provides specific error messages based on the step type:

- **Grain steps:** "Step X: [StepType] step requires a linked BOM item. Please select a grain ingredient for this step."
- **Liquid steps:** "Step X: LiquidAdd step requires a linked BOM item. Please select a water/liquid ingredient for this step."
- **Additive steps:** "Step X: AdditiveAdd step requires a linked BOM item. Please select a additive ingredient for this step."
- **Invalid BOM items:** "Step X: BOM item '[ItemName]' ([ItemNumber]) is not configured in the recipe's Bill of Materials. Please add this item to the BOM or remove it from the mashing step."

## Testing

### Manual Testing
Visit `/debug/mashing-template-test` to test the validation:
1. Toggle "Include Mock BOM Data" to test with/without BOM
2. Create mashing steps of different types
3. Observe validation errors for missing BOM items
4. Test with valid BOM item selections

### Automated Testing
Run the test suite:
```bash
npm test -- components/recipe/__tests__/recipe-mashing-step.test.tsx
```

## Impact

### Benefits
- **Data Integrity:** Ensures all material-adding steps have proper BOM linkage
- **User Experience:** Clear error messages guide users to fix configuration issues
- **Consistency:** Uniform validation across all step types that require materials

### Backward Compatibility
- Existing recipes with valid configurations continue to work
- Only adds new validation rules, doesn't change existing behavior
- Graceful handling when no BOM is configured yet

## Future Enhancements

Potential improvements for future iterations:
1. **Auto-suggestion:** Suggest BOM items based on step type
2. **Bulk validation:** Validate entire recipe for missing BOM items
3. **Template validation:** Ensure mashing protocol templates have valid BOM references
4. **Quantity validation:** Check if BOM quantities match step requirements 