# Recipe BOM Quantity Normalization Specification

## Executive Summary

This document defines how quantities from production BOMs (Bill of Materials) should be normalized when migrating to Recipe BOMs. Production BOMs contain **absolute quantities** for specific production runs (e.g., 3,250 lbs of corn), while Recipe BOMs should contain **normalized quantities** that represent the recipe template (e.g., 65% corn in the grain bill).

**Key Principle**: Recipe BOMs are templates that scale to production, not records of historical production.

## 1. Overview

### Why Normalization is Required

| Aspect         | Production BOM (Source)     | Recipe BOM (Target)               |
| -------------- | --------------------------- | --------------------------------- |
| **Purpose**    | Record of actual production | Template for future production    |
| **Quantities** | Absolute (3,250 lbs)        | Normalized (65% or per-cook)      |
| **Context**    | Specific production order   | Generic recipe template           |
| **Scaling**    | Fixed values                | Scales with production parameters |

### Migration Challenge

The `migrate-bom-to-recipe-bom.js` script must transform absolute production quantities into normalized recipe quantities while preserving the recipe's inherent ratios and formulations.

## 2. Normalization Rules by Item Category

### 2.1 Grain Items (Mashing01 Operation)

**Item Groups**: `RM-GR-COR`, `RM-GR-RYE`, `RM-GR-WHT`, `RM-GR-BRY`, `RM-GR-CRN`

#### Normalization Method: Percentage of Total Grain Bill

**Formula**:

```
normalized_quantity = item_quantity / total_grain_weight
```

**Unit**: Stored as decimal (0.65 = 65%)

**Rationale**:

- Recipes are defined by grain bill percentages (mashbill)
- Recipe.mashBill field stores percentages (e.g., "65-20-10-5")
- Production scaling multiplies percentages by target grain weight

#### Example Calculation

**Input BOM** (from production order for 5,000 lbs total grain):

```javascript
[
  { item: "Corn",   quantity: 3250, units: "lbs" },  // 65%
  { item: "Rye",    quantity: 1000, units: "lbs" },  // 20%
  { item: "Wheat",  quantity: 500,  units: "lbs" },  // 10%
  { item: "Malt",   quantity: 250,  units: "lbs" }   // 5%
]
Total: 5,000 lbs
```

**Normalization Process**:

```javascript
// Step 1: Calculate total grain weight
const totalGrainWeight = 3250 + 1000 + 500 + 250; // = 5000 lbs

// Step 2: Calculate percentages
const cornPercent = 3250 / 5000; // = 0.65 (65%)
const ryePercent = 1000 / 5000; // = 0.20 (20%)
const wheatPercent = 500 / 5000; // = 0.10 (10%)
const maltPercent = 250 / 5000; // = 0.05 (5%)

// Step 3: Verify total
const total = 0.65 + 0.2 + 0.1 + 0.05; // = 1.00 ✓
```

**Output Recipe BOM**:

```javascript
[
  { item: "Corn", quantity: 0.65, operation: "Mashing01" },
  { item: "Rye", quantity: 0.2, operation: "Mashing01" },
  { item: "Wheat", quantity: 0.1, operation: "Mashing01" },
  { item: "Malt", quantity: 0.05, operation: "Mashing01" },
];
```

#### Validation Rules

1. **Sum Check**: Total grain percentages must be between 0.95 and 1.05 (95-105%)

   - Allows for rounding errors and minor variations
   - Values outside this range indicate data issues

2. **Mashbill Comparison**: If Recipe.mashBill exists, compare against calculated percentages

   ```javascript
   // Recipe.mashBill = "65-20-10-5"
   const expectedPercentages = [0.65, 0.2, 0.1, 0.05];
   const calculatedPercentages = [0.65, 0.2, 0.1, 0.05];
   // Should match within ±2% tolerance
   ```

3. **Range Check**: Individual percentages must be between 0.01 and 1.00
   - No negative percentages
   - No grain > 100% of bill

### 2.2 Water & Backset (Mashing01 Operation)

**Item Numbers**: `Water`, `Backset`, `water`, `backset`
**Item Groups**: `RM-ADD` (additives)

#### Normalization Method: Per-Cook Quantity

**Formula**:

```
normalized_quantity = total_water_quantity / number_of_cooks
```

**Unit**: Gallons per cook

**Rationale**:

- Water/backset quantities scale linearly with number of cooks
- BOM Calculator formula: `Actual = Recipe Quantity * Cook Count`
- Each cook uses consistent water amount

#### Example Calculation

**Input BOM** (from production order with 3 cooks):

```javascript
{
  item: "Water",
  quantity: 1500,  // Total gallons for all 3 cooks
  units: "gal"
}
```

**Production Context** (from ProductionOrder):

```javascript
{
  productionOrderId: "PO-123",
  totalCooks: 3,
  bomId: "bom-xyz"
}
```

**Normalization**:

```javascript
const waterPerCook = 1500 / 3; // = 500 gallons per cook
```

**Output Recipe BOM**:

```javascript
{
  item: "Water",
  quantity: 500,           // Gallons per cook
  operation: "Mashing01",
  displayUnitsId: "gallon-unit-id"
}
```

#### Extracting Production Context

To normalize per-cook, we need to determine the number of cooks from production history:

```javascript
// Query production orders that used this BOM
const productionOrders = await prisma.productionOrder.findMany({
  where: { bomId: bom.id },
  select: {
    totalCooks: true,
    quantity: true,
    createdAt: true,
  },
});

// Strategy 1: Use most recent production order
const mostRecent = productionOrders.sort(
  (a, b) => b.createdAt - a.createdAt
)[0];
const totalCooks = mostRecent.totalCooks;

// Strategy 2: Use average (if multiple POs exist)
const avgCooks =
  productionOrders.reduce((sum, po) => sum + po.totalCooks, 0) /
  productionOrders.length;
```

#### Validation Rules

1. **Range Check**: Water per cook should be 300-800 gallons

   - Typical range based on production parameters
   - Values outside indicate potential errors

2. **Ratio Check**: Water-to-grain ratio should be 2.5:1 to 4:1

   ```javascript
   const waterPerCook = 500; // gallons
   const grainPerCook = 1666.67; // lbs (5000 lbs / 3 cooks)
   const ratio = waterPerCook / (grainPerCook / 8.34); // Convert lbs to gal
   // Should be between 2.5 and 4.0
   ```

3. **Production History**: Flag if no production orders found for BOM
   - Cannot determine cook count without production context
   - May need manual specification or default value

### 2.3 Yeast (Fermentation01 Operation)

**Item Groups**: `RM-YEA`

#### Normalization Method: Per-Fermenter Quantity

**Formula**:

```
normalized_quantity = total_yeast_quantity / number_of_fermenters
```

**Unit**: Pounds per fermenter (or appropriate yeast unit)

**Rationale**:

- Yeast quantities scale with number of fermenters
- BOM Calculator formula: `Actual = Recipe Quantity * Cook Count / FG Quantity`
- Each fermenter receives consistent yeast pitch

#### Example Calculation

**Input BOM** (from production order with 2 fermenters):

```javascript
{
  item: "Yeast-Distillers",
  quantity: 100,  // Total lbs for both fermenters
  units: "lbs"
}
```

**Production Context**:

```javascript
{
  productionOrderId: "PO-123",
  totalCooks: 3,
  // Assume 1.5 cooks per fermenter (3 cooks / 2 fermenters)
  fermenterCount: 2
}
```

**Normalization**:

```javascript
const yeastPerFermenter = 100 / 2; // = 50 lbs per fermenter
```

**Output Recipe BOM**:

```javascript
{
  item: "Yeast-Distillers",
  quantity: 50,                 // Lbs per fermenter
  operation: "Fermentation01",
  displayUnitsId: "pound-unit-id"
}
```

#### Determining Fermenter Count

**Challenge**: ProductionOrder model may not have explicit fermenterCount field.

**Solution**: Calculate from cook count and fermenter capacity

```javascript
// Typical ratio: 1.5 cooks per fermenter
const estimatedFermenters = Math.ceil(totalCooks / 1.5);

// Or use facility configuration
const fermenterCapacity = 1.5; // cooks per fermenter
const fermenterCount = Math.ceil(totalCooks / fermenterCapacity);
```

#### Validation Rules

1. **Range Check**: Yeast per fermenter should be 20-100 lbs

   - Typical pitch rates for distillery fermentation
   - Outside range indicates unusual formulation

2. **Pitch Rate Check**: Yeast-to-grain ratio should be reasonable
   ```javascript
   const yeastPerFermenter = 50; // lbs
   const grainPerFermenter = 2500; // lbs (5000 / 2)
   const pitchRate = yeastPerFermenter / grainPerFermenter;
   // Should be 0.015 to 0.05 (1.5% to 5%)
   ```

### 2.4 Enzymes (Mashing01 Operation)

**Item Groups**: `RM-ENZ` (enzymes)

#### Normalization Method: Per-Metric-Ton of Grain

**Formula**:

```
normalized_quantity = (enzyme_quantity / total_grain_weight_lbs) * 2204.62
```

**Unit**: Grams per metric ton (or kg per metric ton)

**Rationale**:

- Enzyme dosing rates are standardized per metric ton of grain
- Industry standard for enzyme specifications
- Vendor dosing recommendations use metric tons

#### Example Calculation

**Input BOM** (from production with 5,000 lbs grain):

```javascript
{
  item: "Alpha-Amylase",
  quantity: 11.34,  // grams total
  units: "g"
}
```

**Production Context**:

```javascript
{
  totalGrainWeight: 5000; // lbs
}
```

**Normalization**:

```javascript
// Convert lbs to metric tons
const grainMetricTons = 5000 / 2204.62; // = 2.268 metric tons

// Calculate enzyme per metric ton
const enzymePerMetricTon = 11.34 / 2.268; // = 5.0 g/MT
```

**Output Recipe BOM**:

```javascript
{
  item: "Alpha-Amylase",
  quantity: 5.0,             // Grams per metric ton
  operation: "Mashing01",
  displayUnitsId: "gram-per-metric-ton-unit-id"
}
```

#### Validation Rules

1. **Range Check**: Enzyme dosing 2-20 g/MT typical

   - Alpha-amylase: 3-8 g/MT
   - Gluco-amylase: 5-15 g/MT
   - Outside range indicates potential error

2. **Vendor Spec Comparison**: Compare against known dosing rates
   ```javascript
   const knownDosingRates = {
     "Alpha-Amylase": { min: 3, max: 8, unit: "g/MT" },
     "Gluco-Amylase": { min: 5, max: 15, unit: "g/MT" },
   };
   ```

### 2.5 Barrels (Processing01 Operation)

**Item Groups**: `RM-BBL` (barrels)

#### Normalization Method: Keep Absolute Quantities

**Formula**:

```
normalized_quantity = barrel_count
```

**Unit**: Count (each)

**Rationale**:

- Barrels are discrete items, not scalable ingredients
- 1 barrel = 1 barrel (no normalization needed)
- Quantity represents barrel count per recipe batch

#### Example

**Input BOM**:

```javascript
{
  item: "53-Gallon-Char-4-Barrel",
  quantity: 1,
  units: "each"
}
```

**Output Recipe BOM** (no change):

```javascript
{
  item: "53-Gallon-Char-4-Barrel",
  quantity: 1,
  operation: "Processing01",
  displayUnitsId: "each-unit-id"
}
```

## 3. Implementation Guidelines

### 3.1 Migration Script Workflow

```javascript
async function migrateBomsToRecipeBoms(boms) {
  for (const bom of boms) {
    // Step 1: Match BOM to Recipe
    const recipe = await findRecipeForBom(bom);
    if (!recipe) {
      console.warn(`Skipping BOM ${bom.bomRevision}: No recipe match`);
      continue;
    }

    // Step 2: Extract production context
    const context = await getProductionContext(bom);

    // Step 3: Categorize and normalize items
    const normalizedItems = await normalizeAllItems(bom.bomItem, context);

    // Step 4: Validate results
    const validation = validateNormalizedItems(normalizedItems, recipe);
    if (!validation.isValid) {
      console.error(
        `Validation failed for ${bom.bomRevision}:`,
        validation.errors
      );
    }

    // Step 5: Create RecipeBOM and items
    await createRecipeBom(recipe, bom, normalizedItems);
  }
}
```

### 3.2 Production Context Extraction

```javascript
async function getProductionContext(bom) {
  const productionOrders = await prisma.productionOrder.findMany({
    where: { bomId: bom.id },
    select: {
      totalCooks: true,
      quantity: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (productionOrders.length === 0) {
    console.warn(`No production history for BOM ${bom.bomRevision}`);
    return {
      totalCooks: null,
      fermenterCount: null,
      useDefaults: true,
    };
  }

  // Use most recent production order
  const mostRecent = productionOrders[0];

  return {
    totalCooks: mostRecent.totalCooks,
    fermenterCount: Math.ceil(mostRecent.totalCooks / 1.5), // 1.5 cooks per fermenter
    useDefaults: false,
  };
}
```

### 3.3 Categorization Logic

```javascript
function categorizeItem(bomItem) {
  const itemGroup = bomItem.item?.itemGroup;
  const itemNumber = bomItem.item?.itemNumber?.toLowerCase();

  // Grains
  if (itemGroup?.startsWith("RM-GR-")) {
    return {
      category: "GRAIN",
      normalizeAs: "PERCENTAGE",
      operation: "Mashing01",
    };
  }

  // Water/Backset
  if (itemNumber?.includes("water") || itemNumber?.includes("backset")) {
    return {
      category: "LIQUID",
      normalizeAs: "PER_COOK",
      operation: "Mashing01",
    };
  }

  // Yeast
  if (itemGroup?.startsWith("RM-YEA")) {
    return {
      category: "YEAST",
      normalizeAs: "PER_FERMENTER",
      operation: "Fermentation01",
    };
  }

  // Enzymes
  if (itemGroup?.startsWith("RM-ENZ")) {
    return {
      category: "ENZYME",
      normalizeAs: "PER_METRIC_TON",
      operation: "Mashing01",
    };
  }

  // Barrels
  if (itemGroup?.startsWith("RM-BBL")) {
    return {
      category: "BARREL",
      normalizeAs: "ABSOLUTE",
      operation: "Processing01",
    };
  }

  // Default
  return {
    category: "OTHER",
    normalizeAs: "ABSOLUTE",
    operation: "Mashing01",
  };
}
```

### 3.4 Normalization Function

```javascript
function normalizeQuantity(bomItem, allBomItems, context) {
  const { normalizeAs } = categorizeItem(bomItem);

  switch (normalizeAs) {
    case "PERCENTAGE": {
      // Calculate total grain weight
      const grainItems = allBomItems.filter(
        (item) => categorizeItem(item).category === "GRAIN"
      );
      const totalGrainWeight = grainItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      if (totalGrainWeight === 0) {
        throw new Error("Total grain weight is zero");
      }

      return bomItem.quantity / totalGrainWeight;
    }

    case "PER_COOK": {
      if (!context.totalCooks) {
        console.warn(
          `No cook count for item ${bomItem.item.itemNumber}, using default 3`
        );
        return bomItem.quantity / 3; // Default fallback
      }
      return bomItem.quantity / context.totalCooks;
    }

    case "PER_FERMENTER": {
      if (!context.fermenterCount) {
        console.warn(`No fermenter count, using default 2`);
        return bomItem.quantity / 2; // Default fallback
      }
      return bomItem.quantity / context.fermenterCount;
    }

    case "PER_METRIC_TON": {
      const grainItems = allBomItems.filter(
        (item) => categorizeItem(item).category === "GRAIN"
      );
      const totalGrainLbs = grainItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      const grainMetricTons = totalGrainLbs / 2204.62;

      if (grainMetricTons === 0) {
        throw new Error("Total grain weight is zero for enzyme calculation");
      }

      return bomItem.quantity / grainMetricTons;
    }

    case "ABSOLUTE":
    default:
      return bomItem.quantity;
  }
}
```

## 4. Validation Framework

### 4.1 Validation Checks

```javascript
function validateNormalizedItems(normalizedItems, recipe) {
  const errors = [];
  const warnings = [];

  // Check 1: Grain bill sum
  const grainItems = normalizedItems.filter(
    (item) =>
      item.operation === "Mashing01" &&
      categorizeItem({ item: item }).category === "GRAIN"
  );

  const grainSum = grainItems.reduce((sum, item) => sum + item.quantity, 0);

  if (grainSum < 0.95 || grainSum > 1.05) {
    errors.push({
      type: "GRAIN_SUM_OUT_OF_RANGE",
      message: `Grain percentages sum to ${(grainSum * 100).toFixed(
        1
      )}%, expected 95-105%`,
      value: grainSum,
    });
  }

  // Check 2: Compare against mashBill
  if (recipe.mashBill) {
    const expectedPercentages = recipe.mashBill
      .split("-")
      .map((p) => parseFloat(p) / 100);

    const actualPercentages = grainItems
      .map((item) => item.quantity)
      .sort((a, b) => b - a); // Sort descending

    expectedPercentages.forEach((expected, idx) => {
      const actual = actualPercentages[idx] || 0;
      const diff = Math.abs(expected - actual);

      if (diff > 0.02) {
        // 2% tolerance
        warnings.push({
          type: "MASHBILL_MISMATCH",
          message: `Expected ${(expected * 100).toFixed(0)}%, got ${(
            actual * 100
          ).toFixed(0)}%`,
          expected,
          actual,
          difference: diff,
        });
      }
    });
  }

  // Check 3: Individual grain percentages
  grainItems.forEach((item) => {
    if (item.quantity < 0.01 || item.quantity > 1.0) {
      errors.push({
        type: "GRAIN_PERCENTAGE_OUT_OF_RANGE",
        message: `${item.item.itemNumber} has invalid percentage: ${(
          item.quantity * 100
        ).toFixed(1)}%`,
        itemNumber: item.item.itemNumber,
        value: item.quantity,
      });
    }
  });

  // Check 4: Water per cook range
  const waterItems = normalizedItems.filter(
    (item) =>
      item.operation === "Mashing01" &&
      (item.item.itemNumber?.toLowerCase().includes("water") ||
        item.item.itemNumber?.toLowerCase().includes("backset"))
  );

  waterItems.forEach((item) => {
    if (item.quantity < 300 || item.quantity > 800) {
      warnings.push({
        type: "WATER_QUANTITY_UNUSUAL",
        message: `${item.item.itemNumber} quantity ${item.quantity} gal/cook is outside typical range (300-800)`,
        itemNumber: item.item.itemNumber,
        value: item.quantity,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### 4.2 Reporting Validation Results

```javascript
function reportValidationResults(bomRevision, validation) {
  if (validation.isValid && validation.warnings.length === 0) {
    console.log(`✓ ${bomRevision}: All validations passed`);
    return;
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Validation Report: ${bomRevision}`);
  console.log("=".repeat(80));

  if (validation.errors.length > 0) {
    console.log("\n❌ ERRORS:");
    validation.errors.forEach((error) => {
      console.log(`   ${error.type}: ${error.message}`);
    });
  }

  if (validation.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    validation.warnings.forEach((warning) => {
      console.log(`   ${warning.type}: ${warning.message}`);
    });
  }

  console.log("");
}
```

## 5. Unit Standards Reference

### 5.1 RecipeBOM Unit Mappings

| Item Category | Normalized Unit | Display Unit         | Notes               |
| ------------- | --------------- | -------------------- | ------------------- |
| Grains        | Decimal (0-1)   | Percentage (%)       | 0.65 = 65%          |
| Water/Backset | Gallons         | Gallons per cook     | Per-cook basis      |
| Yeast         | Pounds          | Pounds per fermenter | Per-fermenter basis |
| Enzymes       | Grams           | Grams per metric ton | Industry standard   |
| Barrels       | Count           | Each                 | Absolute count      |

### 5.2 Conversion Factors

```javascript
const CONVERSION_FACTORS = {
  // Mass
  LBS_TO_KG: 0.45359237,
  KG_TO_LBS: 2.2046226218,
  LBS_TO_METRIC_TONS: 0.00045359237,
  METRIC_TONS_TO_LBS: 2204.62,

  // Volume
  GAL_TO_LITERS: 3.78541,
  LITERS_TO_GAL: 0.264172,

  // Production context
  COOKS_PER_FERMENTER: 1.5, // Typical facility ratio
  GAL_WATER_PER_LB_GRAIN: 0.5, // Typical mash ratio
};
```

## 6. Edge Cases & Fallback Strategies

### 6.1 Missing Production Context

**Problem**: BOM has no associated ProductionOrders

**Solution**:

```javascript
if (!context.totalCooks) {
  // Use facility defaults
  const DEFAULT_COOKS = 3;
  const DEFAULT_FERMENTERS = 2;

  console.warn(
    `Using default values for ${bom.bomRevision}: ` +
      `${DEFAULT_COOKS} cooks, ${DEFAULT_FERMENTERS} fermenters`
  );

  context.totalCooks = DEFAULT_COOKS;
  context.fermenterCount = DEFAULT_FERMENTERS;
}
```

### 6.2 Conflicting Production History

**Problem**: Multiple ProductionOrders with different cook counts

**Solution**:

```javascript
if (productionOrders.length > 1) {
  // Check for consistency
  const cookCounts = productionOrders.map((po) => po.totalCooks);
  const uniqueCounts = [...new Set(cookCounts)];

  if (uniqueCounts.length > 1) {
    console.warn(
      `BOM ${
        bom.bomRevision
      } used with varying cook counts: ${uniqueCounts.join(", ")}`
    );
    console.warn(`Using most recent: ${mostRecent.totalCooks} cooks`);
  }
}
```

### 6.3 Grain Bill Doesn't Sum to 100%

**Problem**: Normalized grain percentages sum to 87% or 113%

**Strategy 1**: Normalize to 100%

```javascript
if (grainSum < 0.95 || grainSum > 1.05) {
  console.warn(
    `Grain bill sums to ${(grainSum * 100).toFixed(1)}%, normalizing to 100%`
  );

  // Scale all percentages
  grainItems.forEach((item) => {
    item.quantity = item.quantity / grainSum;
  });
}
```

**Strategy 2**: Flag for manual review

```javascript
if (grainSum < 0.9 || grainSum > 1.1) {
  console.error(
    `Grain bill sum ${(grainSum * 100).toFixed(1)}% is too far from 100%`
  );
  console.error(`Manual review required for ${bom.bomRevision}`);

  // Skip this BOM
  return null;
}
```

### 6.4 Unknown Item Categories

**Problem**: Item doesn't match any known category pattern

**Solution**:

```javascript
const { category } = categorizeItem(bomItem);

if (category === "OTHER") {
  console.warn(
    `Unknown item category: ${bomItem.item.itemNumber} (${bomItem.item.itemGroup})`
  );
  console.warn(`Using absolute quantity: ${bomItem.quantity}`);

  // Keep absolute, but flag in metadata
  return {
    quantity: bomItem.quantity,
    metadata: {
      normalizationApplied: false,
      reason: "Unknown item category",
    },
  };
}
```

## 7. Testing & Verification

### 7.1 Test Cases

```javascript
describe("Recipe BOM Normalization", () => {
  test("should normalize 3250 lbs corn to 65% when total grain is 5000 lbs", () => {
    const bomItems = [
      { item: { itemGroup: "RM-GR-COR" }, quantity: 3250 },
      { item: { itemGroup: "RM-GR-RYE" }, quantity: 1000 },
      { item: { itemGroup: "RM-GR-WHT" }, quantity: 500 },
      { item: { itemGroup: "RM-GR-BRY" }, quantity: 250 },
    ];

    const normalized = normalizeQuantity(bomItems[0], bomItems, {});
    expect(normalized).toBeCloseTo(0.65, 2);
  });

  test("should normalize 1500 gal water to 500 gal/cook for 3 cooks", () => {
    const waterItem = {
      item: { itemNumber: "Water" },
      quantity: 1500,
    };

    const normalized = normalizeQuantity(waterItem, [], { totalCooks: 3 });
    expect(normalized).toBe(500);
  });

  test("should validate grain bill sums to 100%", () => {
    const grainItems = [
      { quantity: 0.65, operation: "Mashing01" },
      { quantity: 0.2, operation: "Mashing01" },
      { quantity: 0.1, operation: "Mashing01" },
      { quantity: 0.05, operation: "Mashing01" },
    ];

    const validation = validateNormalizedItems(grainItems, {});
    expect(validation.isValid).toBe(true);
  });
});
```

### 7.2 Comparison with Known Recipes

```javascript
async function verifyAgainstKnownRecipes() {
  const knownRecipes = [
    {
      name: "BHK-00-95-00-05-R01",
      mashBill: "95-0-0-5",
      expectedGrains: {
        Corn: 0.95,
        Malt: 0.05,
      },
    },
    {
      name: "RYE-00-51-00-39-10",
      mashBill: "51-39-10",
      expectedGrains: {
        Rye: 0.51,
        Corn: 0.39,
        Malt: 0.1,
      },
    },
  ];

  for (const known of knownRecipes) {
    const recipe = await prisma.recipe.findFirst({
      where: { Recipe: known.name },
    });

    const recipeBoms = await prisma.recipeBom.findMany({
      where: { recipes: { some: { id: recipe.id } } },
      include: { recipeBomITem: { include: { item: true } } },
    });

    // Verify grain percentages match expected
    const actualGrains = {};
    recipeBoms[0].recipeBomITem
      .filter((item) => item.operation === "Mashing01")
      .forEach((item) => {
        actualGrains[item.item.itemName] = item.quantity;
      });

    Object.entries(known.expectedGrains).forEach(([grain, expectedPct]) => {
      const actualPct = actualGrains[grain] || 0;
      const diff = Math.abs(expectedPct - actualPct);

      if (diff > 0.02) {
        console.error(
          `${known.name}: ${grain} mismatch - expected ${expectedPct}, got ${actualPct}`
        );
      } else {
        console.log(`✓ ${known.name}: ${grain} matches (${actualPct})`);
      }
    });
  }
}
```

## 8. Migration Execution Checklist

Before running the migration with normalization:

- [ ] Review this specification document
- [ ] Verify categorization logic covers all item types in database
- [ ] Test normalization on sample BOM in dry-run mode
- [ ] Verify validation checks are comprehensive
- [ ] Backup existing RecipeBOM/RecipeBOMItem data
- [ ] Run migration with `--verbose` flag first
- [ ] Review validation report for errors/warnings
- [ ] Compare results against known recipes
- [ ] Execute migration with `--execute` flag
- [ ] Verify grain bills in UI (Recipe Management page)
- [ ] Test production order BOM calculation with normalized recipes

## 9. Appendix: Example Migration Output

```
================================================================================
Recipe BOM Migration with Normalization
================================================================================

Processing BOM: BOM-BHK-00-95-00-05-R01-001
├─ Matched Recipe: BHK-00-95-00-05-R01
├─ Production Context:
│  ├─ Total Cooks: 3
│  └─ Fermenters: 2
├─ Normalizing 12 items:
│  ├─ [GRAIN] Corn (RM-GR-COR): 4750 lbs → 0.95 (95%)
│  ├─ [GRAIN] Malt (RM-GR-BRY): 250 lbs → 0.05 (5%)
│  ├─ [LIQUID] Water: 1500 gal → 500 gal/cook
│  ├─ [LIQUID] Backset: 900 gal → 300 gal/cook
│  ├─ [YEAST] Yeast: 100 lbs → 50 lbs/fermenter
│  ├─ [ENZYME] Alpha-Amylase: 11.34 g → 5.0 g/MT
│  └─ [BARREL] 53-Gal-Barrel: 1 → 1 (no change)
├─ Validation:
│  ├─ ✓ Grain bill sum: 100.0%
│  ├─ ✓ Mashbill comparison: Expected [95, 5], Got [95, 5]
│  ├─ ✓ Water per cook in range: 500 gal
│  └─ ✓ All checks passed
└─ ✓ Created RecipeBOM with 12 items

Summary:
  BOMs processed: 119
  RecipeBOMs created: 119
  Validation errors: 0
  Validation warnings: 3

Warnings:
  1. BOM-XYZ: Water quantity 850 gal/cook outside typical range
  2. BOM-ABC: No production history, used default values
  3. BOM-DEF: Grain bill sum 98%, normalized to 100%
```

## 10. References

- **Recipe Generation Service**: `backend/src/recipe/recipe.generation.ts`
- **BOM Calculator Documentation**: `docs/bom-calculator.md`
- **Units Model**: `backend/prisma/schema.prisma`
- **Grain Bill Calculation**: See Recipe.mashBill field format
