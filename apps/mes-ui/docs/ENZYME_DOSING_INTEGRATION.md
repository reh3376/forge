# Enzyme Dosing Integration

This document explains how to integrate enzyme dosing calculations into your recipe creation workflow using the GraphQL mutation and utility functions.

## Overview

The enzyme dosing integration provides:
- **GraphQL Mutation**: `calculateNormalizedEnzymeDosing` for real-time enzyme dosing calculations
- **Utility Functions**: Helper functions for formatting and processing enzyme data
- **React Hook**: `useEnzymeDosing` for easy integration into React components
- **Example Component**: `EnzymeDosingCalculator` demonstrating usage patterns

## Quick Start

### 1. Basic GraphQL Mutation

```graphql
mutation CalculateEnzymeDosing {
  calculateNormalizedEnzymeDosing(data: {
    recipeId: "cm8vv2gu600zkbseoolyfhz6x"
    enzymeItemId: "cmbbayb0l00019q8s2iu672fn"
  }) {
    normalizedDoseRatio
    enzymeName
    mashBill
    instructions
    recipeId
    recipeName
    enzymeCategory
    calculatedAt
  }
}
```

### 2. Using the React Hook

```typescript
import { useEnzymeDosing } from '../hooks/useEnzymeDosing'

function RecipeCreationWizard() {
  const { 
    calculateSingleEnzymeDosing, 
    generateRecommendations,
    loading,
    error 
  } = useEnzymeDosing()

  const handleCalculateEnzyme = async () => {
    const result = await calculateSingleEnzymeDosing({
      recipeId: 'your-recipe-id',
      enzymeItemId: 'enzyme-item-id'
    })
    
    if (result) {
      console.log('Normalized dose ratio:', result.normalizedDoseRatio)
      console.log('Instructions:', result.instructions)
    }
  }

  return (
    <button onClick={handleCalculateEnzyme} disabled={loading}>
      {loading ? 'Calculating...' : 'Calculate Enzyme Dosing'}
    </button>
  )
}
```

### 3. Using Utility Functions Directly

```typescript
import { calculateEnzymeDosing, formatEnzymeDosingForBom } from '../lib/utils/enzyme-dosing'
import { useApolloClient } from '@apollo/client'

function MyComponent() {
  const client = useApolloClient()

  const handleCalculate = async () => {
    try {
      // Calculate enzyme dosing
      const result = await calculateEnzymeDosing(client, {
        recipeId: 'recipe-id',
        enzymeItemId: 'enzyme-item-id'
      })

      // Format for recipe BOM
      const bomItem = formatEnzymeDosingForBom(result, 18000) // 18,000 lbs grain
      
      console.log('BOM Item:', bomItem)
      // {
      //   itemId: "...",
      //   itemName: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
      //   quantity: 1.062,
      //   operation: "Mashing01",
      //   instructions: "Add with water/backset before grain addition...",
      //   category: "LIQUIFACTION"
      // }
    } catch (error) {
      console.error('Calculation failed:', error)
    }
  }
}
```

## Available Queries and Mutations

### Mutations

#### `calculateNormalizedEnzymeDosing`
Calculates normalized enzyme dosing ratios for a specific recipe and enzyme combination.

**Input:**
- `recipeId`: String - ID of the recipe with BOM data
- `enzymeItemId`: String - ID of the enzyme item (not enzyme configuration)

**Output:**
- `normalizedDoseRatio`: Number - Ratio to multiply by grain weight
- `enzymeName`: String - Full enzyme name
- `mashBill`: String - Recipe mash bill (e.g., "75-21-00-04")
- `instructions`: String - Usage instructions
- `recipeId`: String - Recipe ID used
- `recipeName`: String - Recipe name
- `enzymeCategory`: String - LIQUIFACTION, SACCHARIFICATION, or VISCOSITY
- `calculatedAt`: String - ISO timestamp

### Queries

#### `GET_ENZYME_CONFIGURATIONS`
Retrieves enzyme configurations with dosing information.

#### `GET_ENZYME_ITEMS`
Retrieves enzyme items (use these IDs for the mutation).

#### `GET_RECIPES_WITH_BOMS`
Finds recipes that have BOM data (required for calculations).

## Integration Patterns

### Recipe Creation Workflow

1. **Create Recipe**: First create the recipe with basic information
2. **Add Grain BOM**: Add grain items to establish mash bill
3. **Calculate Enzymes**: Use enzyme dosing calculations to determine quantities
4. **Add Enzyme BOM**: Add calculated enzymes to recipe BOM
5. **Generate Protocol**: Create mashing protocol with enzyme addition steps

### Example Integration in Recipe Wizard

```typescript
// Step 1: Create recipe and add grains
const recipe = await createRecipe(recipeData)
await addGrainsToBom(recipe.id, grainItems)

// Step 2: Calculate total grain weight
const totalGrainWeight = calculateTotalGrainWeight(grainItems)

// Step 3: Generate enzyme recommendations
const enzymeRecommendations = await generateEnzymeRecommendations(
  client,
  recipe.id,
  totalGrainWeight
)

// Step 4: Add enzymes to BOM
for (const enzyme of enzymeRecommendations) {
  await addEnzymeToBom(recipe.id, enzyme)
}
```

## Error Handling

The enzyme dosing calculation can fail for several reasons:

1. **Recipe has no BOM data**: Recipe must have grain items in BOM
2. **Enzyme has no active configuration**: Enzyme must have active configuration
3. **Invalid recipe/enzyme IDs**: IDs must exist in the system

```typescript
try {
  const result = await calculateEnzymeDosing(client, input)
  // Handle success
} catch (error) {
  if (error.message.includes('no BOM data')) {
    // Handle missing BOM data
  } else if (error.message.includes('no active enzyme configuration')) {
    // Handle missing enzyme configuration
  } else {
    // Handle other errors
  }
}
```

## Example Results

### Successful Calculation
```json
{
  "normalizedDoseRatio": 0.000059,
  "enzymeName": "ENZ-UNI01-Enzyme (Termamyl SC DS)",
  "mashBill": "75-21-00-04",
  "instructions": "Add with water/backset before grain addition at ambient temperature",
  "recipeId": "cm8vv2gu600zkbseoolyfhz6x",
  "recipeName": "DWL-75-21-00-04-R01",
  "enzymeCategory": "LIQUIFACTION",
  "calculatedAt": "2025-06-03T18:40:13.811Z"
}
```

### Calculated Quantities
For a recipe with 18,000 lbs of grain:
- **Termamyl SC DS (Liquifaction)**: 0.000059 × 18,000 = 1.062 lbs
- **Saczyme Pro 1.5X (Saccharification)**: 0.000272 × 18,000 = 4.896 lbs
- **Saczyme Yield (Saccharification)**: 0.000136 × 18,000 = 2.448 lbs

## Testing

Use the `EnzymeDosingCalculator` component to test the integration:

```typescript
import { EnzymeDosingCalculator } from '../components/enzyme-dosing/EnzymeDosingCalculator'

function TestPage() {
  return (
    <EnzymeDosingCalculator
      recipeId="cm8vv2gu600zkbseoolyfhz6x"
      totalGrainWeight={18000}
      onEnzymeDosingCalculated={(results) => {
        console.log('Calculated enzymes:', results)
      }}
    />
  )
}
```

## Best Practices

1. **Always check for BOM data** before attempting enzyme calculations
2. **Use error boundaries** to handle calculation failures gracefully
3. **Cache enzyme configurations** to avoid repeated API calls
4. **Validate enzyme item IDs** before making calculations
5. **Round quantities appropriately** for practical use (3 decimal places)
6. **Include instructions** in the BOM for operators

## Troubleshooting

### Common Issues

1. **"Could not calculate enzyme dosing"**: Recipe likely missing BOM data
2. **"No active enzyme configuration"**: Enzyme configuration may be inactive
3. **GraphQL validation errors**: Check that IDs exist and are valid UUIDs

### Debug Steps

1. Verify recipe has BOM data: `GET_RECIPES_WITH_BOMS`
2. Check enzyme configurations: `GET_ENZYME_CONFIGURATIONS`
3. Validate enzyme item IDs: `GET_ENZYME_ITEMS`
4. Test with known working recipe: `cm8vv2gu600zkbseoolyfhz6x` 