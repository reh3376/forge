# Recipe Wizard Integration Guide

This guide shows how to integrate the master recipe GraphQL mutations into your existing recipe wizard using the **unified GraphQL client**.

## Overview

The master recipe mutations have been successfully implemented and tested with the unified GraphQL client. You can now:

1. **Create new master recipes** from wizard data
2. **Update existing master recipes** 
3. **Validate recipe data** before submission
4. **Generate recipe codes** automatically
5. **Handle errors and loading states** gracefully

## Files Created

### 1. `lib/api/graphql/master-recipe-mutations.ts`
- GraphQL mutation definitions using `gql` from Apollo Client
- TypeScript interfaces for type safety
- **MasterRecipeService class** that uses the unified GraphQL client
- Utility functions for validation and data transformation
- Recipe code generation logic
- Singleton service instance export

### 2. `hooks/useMasterRecipe.ts`
- Custom React hook for recipe operations
- Built on top of the MasterRecipeService class
- Handles loading states, error management, and validation
- Provides convenient methods for wizard integration

### 3. `components/recipe/RecipeWizardSubmit.tsx`
- Example React component showing integration
- Comprehensive validation display
- Loading states and error handling
- Success feedback and navigation

## Key Features

### ✅ **Unified GraphQL Client Integration**
```typescript
// Uses the unified GraphQL client for all operations
const result = await unifiedGraphQLClient.mutate<{ createMasterRecipe: MasterRecipeResponse }>(
  CREATE_MASTER_RECIPE,
  {
    variables: { input },
  }
);
```

### ✅ **Service-Based Architecture**
```typescript
// Clean service class with async methods
export class MasterRecipeService {
  async createMasterRecipe(input: CreateMasterRecipeInput): Promise<MasterRecipeResponse>
  async updateMasterRecipe(id: string, input: UpdateMasterRecipeInput): Promise<MasterRecipeResponse>
  async createMasterRecipeFromWizard(wizardData: WizardData): Promise<MasterRecipeResponse>
  async updateMasterRecipeFromWizard(id: string, wizardData: WizardData): Promise<MasterRecipeResponse>
  validateRecipeData(wizardData: WizardData): { isValid: boolean; errors: string[] }
  generateRecipeCodeFromData(wizardData: WizardData): string
}
```

### ✅ **React Hook Integration**
```typescript
const {
  createRecipeFromWizard,
  updateRecipeFromWizard,
  validateRecipeData,
  generateRecipeCodeFromData,
  loading,
  error,
  lastCreatedRecipe,
} = useMasterRecipe();
```

### ✅ **Comprehensive Validation**
- Recipe name validation
- Mash bill percentage validation (must total 100%)
- Ingredient validation (name, item code, quantity)
- Mashing step validation (duration, temperatures)
- Whiskey type validation

### ✅ **Automatic Recipe Code Generation**
```typescript
// Generates codes like: "FGB-70-16-14-00-R01"
// Format: [WhiskeyType]-[Corn%]-[Wheat%]-[MaltedBarley%]-[Rye%]-[Revision]
const recipeCode = generateRecipeCode(whiskeyType, mashBill, revision);
```

## Integration Steps

### 1. Import the Hook
```typescript
import { useMasterRecipe } from '@/hooks/useMasterRecipe';
import { WizardData } from '@/lib/api/graphql/master-recipe-mutations';
```

### 2. Use in Your Component
```typescript
const MyRecipeWizard = () => {
  const {
    createRecipeFromWizard,
    validateRecipeData,
    loading,
    error
  } = useMasterRecipe();

  const handleSubmit = async (wizardData: WizardData) => {
    const result = await createRecipeFromWizard(wizardData);
    if (result) {
      console.log('Recipe created:', result.id);
    }
  };

  // ... rest of component
};
```

### 3. Validate Before Submission
```typescript
const validation = validateRecipeData(wizardData);
if (!validation.isValid) {
  console.log('Validation errors:', validation.errors);
  return;
}
```

## Example Usage

### Creating a New Recipe
```typescript
const wizardData: WizardData = {
  recipeName: "Premium Bourbon",
  whiskeyType: "FourGrainBourbon",
  cooksPerFerm: 2.5,
  customerCode: "PREM001",
  mashBill: {
    corn: 70,
    wheat: 16,
    maltedBarley: 14,
    rye: 0
  },
  ingredients: [
    {
      id: "corn-001",
      itemCode: "COR-DLF02-US",
      name: "US #2 Yellow Dent Corn",
      category: "grains",
      quantity: 1400,
      unit: "pounds"
    }
    // ... more ingredients
  ]
};

const result = await createRecipeFromWizard(wizardData);
```

### Updating an Existing Recipe
```typescript
const result = await updateRecipeFromWizard(existingRecipeId, updatedWizardData);
```

## Error Handling

The system provides comprehensive error handling:

```typescript
// Validation errors
const validation = validateRecipeData(wizardData);
if (!validation.isValid) {
  validation.errors.forEach(error => console.log(error));
}

// API errors
if (error) {
  console.log('API Error:', error);
}

// Loading states
if (loading) {
  // Show loading spinner
}
```

## Testing

The mutations have been successfully tested with:

✅ **Create Master Recipe** - Creates new recipes with full ingredient and mashing step data  
✅ **Update Master Recipe** - Updates existing recipes with new data  
✅ **Validation** - Comprehensive data validation before submission  
✅ **Error Handling** - Proper error messages and loading states  
✅ **Recipe Code Generation** - Automatic generation of standardized recipe codes  

## Next Steps

1. **Integrate into your existing wizard** by replacing form submission logic
2. **Add the RecipeWizardSubmit component** to your wizard's final step
3. **Customize validation rules** as needed for your specific requirements
4. **Add additional fields** to the WizardData interface if needed
5. **Implement recipe listing/editing** using the same service patterns

## Available Whiskey Types

- `FourGrainBourbon`
- `RyeWhiskey` 
- `WheatWhiskey`
- `CornWhiskey`
- `MaltWhiskey`

## Available Mashing Step Types

- `AdditiveAdd`
- `Corn`
- `Hold`
- `LiquidAdd`
- `Malt`
- `PreMalt`
- `Prompt`
- `Rye`
- `Wheat`

The implementation is production-ready and follows your existing patterns with the unified GraphQL client! 