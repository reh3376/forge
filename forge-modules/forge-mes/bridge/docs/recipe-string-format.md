# Recipe String Format Specification - PROPOSED

## Overview

This document defines the human-readable recipe string format used throughout the Whiskey House MES system, barrel printing, and operational documentation and records. The recipe string serves as a user-friendly identifier that provides at-a-glance information about a recipe's composition while the system database relationships hold the authoritative data.

## Format Evolution

### Previous Format (Deprecated)
```
{CUSTOMER}-{CORN%}-{RYE%}-{WHEAT%}-{MALT%}-R{REVISION}
```

**Example:** `WHK-68-11-00-21-R01`

Each percentage can be up to one decimal place precision and be from 0 - 100

**Limitations:**
- Fixed to exactly 4 grain types (Corn, Rye, Wheat, Malt)
- Cannot represent alternative grains (sorghum, barley, oats, etc.)
- Cannot represent multiple varieties of the same grain
- Assumes all percentages are integers (no decimals)
- Breaks down for non-traditional whiskey recipes, which are becoming more common

### Current Format (Recommended)
```
{CUSTOMER}-{DESCRIPTIVE_MASHBILL}-R{REVISION}
```

**Format Components:**
- `{CUSTOMER}`: 3-letter customer code (e.g., WHK, ABC, XYZ)
- `{DESCRIPTIVE_MASHBILL}`: Flexible grain composition using grain abbreviations and percentages
- `R{REVISION}`: Recipe revision number (R01, R02, etc.)

## Grain Abbreviations

| Grain Type | Abbreviation | Notes                         |
| ---------- | ------------ | ----------------------------- |
| Corn       | C            | Standard yellow dent corn     |
| Rye        | R            | Standard rye grain            |
| Malted Rye | Y            | Malted rye grain              |
| Wheat      | W            | Standard wheat                |
| Malt       | M            | Malted barley                 |
| Sorghum    | S            | Gluten-free grain alternative |
| Barley     | B            | Unmalted barley               |
| Specialty  | Z            | Specialty catch-all           |


**Variety Suffixes:** When multiple varieties of the same grain are used, append a number:
- R1, R2 for different rye varieties
- C1, C2 for different corn types
- M1, M2 for different malt types

## Examples

### Traditional Bourbon Recipes

**Rye Bourbon (3-grain)**
```
WHK-68.5C-10.5R-21M-R01
```
- Customer: WHK
- Mash bill: 68.5% Corn, 10.5% Rye, 21% Malt
- Revision: 1

**Wheated Bourbon (3-grain)**
```
ABC-70C-16W-14M-R01
```
- Customer: ABC
- Mash bill: 70% Corn, 16% Wheat, 14% Malt
- Revision: 1

**Four-Grain Bourbon**
```
XYZ-51C-24R-10W-15M-R01
```
- Customer: XYZ
- Mash bill: 51% Corn, 24% Rye, 10% Wheat, 15% Malt
- Revision: 1

### Multi-Variety Recipes

**Dual-Rye Bourbon**
```
XYZ-51C-24R1-24R2-10W-15M-R01
```
- Customer: XYZ
- Mash bill: 51% Corn, 24% Rye Variety 1, 24% Rye Variety 2, 10% Wheat, 15% Malt
- Revision: 1
- Note: Percentages sum to >100% to indicate two different rye sources

**Alternative interpretation (if percentages must sum to 100):**
```
XYZ-51C-12R1-12R2-10W-15M-R01
```
- Mash bill: 51% Corn, 12% Rye Variety 1, 12% Rye Variety 2, 10% Wheat, 15% Malt
- Total: 100%

### Alternative Grain Recipes

**100% Sorghum Whiskey**
```
ABC-100S-R01
```
- Customer: ABC
- Mash bill: 100% Sorghum
- Revision: 1

**Sorghum Bourbon**
```
GHI-51S-24R-15W-10M-R01
```
- Customer: GHI
- Mash bill: 51% Sorghum, 24% Rye, 15% Wheat, 10% Malt
- Revision: 1

**Oat Whiskey**
```
DEF-60O-30W-10M-R01
```
- Customer: DEF
- Mash bill: 60% Oats, 30% Wheat, 10% Malt
- Revision: 1

### High-Malt/Single Malt Recipes

**Single Malt**
```
WHK-100M-R01
```
- Customer: WHK
- Mash bill: 100% Malt
- Revision: 1

**High-Malt Bourbon**
```
ABC-52C-48M-R01
```
- Customer: ABC
- Mash bill: 52% Corn, 48% Malt
- Revision: 1

### Complex Multi-Grain Recipes

**Five-Grain Whiskey**
```
XYZ-40C-20R-15W-15M-10O-R01
```
- Customer: XYZ
- Mash bill: 40% Corn, 20% Rye, 15% Wheat, 15% Malt, 10% Oats
- Revision: 1

**Experimental Recipe with Multiple Varieties**
```
WHK-45C1-20C2-15R1-10R2-5W-5M-R01
```
- Customer: WHK
- Mash bill: 45% Corn Variety 1, 20% Corn Variety 2, 15% Rye Variety 1, 10% Rye Variety 2, 5% Wheat, 5% Malt
- Revision: 1

## Ordering Conventions

**Recommended ordering** (for consistency and readability):
1. Primary grain first (largest percentage)
2. Secondary grains in descending percentage order
3. If using varieties, keep varieties of the same grain together (R1, R2, R3)

**Example - Good:**
```
WHK-70C-15R1-10R2-5M-R01  ✓
```

**Example - Avoid:**
```
WHK-5M-15R1-70C-10R2-R01  ✗ (hard to read)
```

## Decimal Precision

- Support up to **one decimal place** for percentages
- Use decimals when necessary for precision: `68.5C` not `69C`
- Omit `.0` for whole numbers: `70C` not `70.0C`

## Revision Management

- Start all new recipes at `R01`
- Increment revision for material changes to the recipe
- Revisions are zero-padded: R01, R02, ..., R10, R11, etc.

**Minor tweaks** (same mash bill, parameter adjustments): Consider keeping same revision
**Major changes** (different grain sources, mash bill changes): Increment revision

## Usage Guidelines

### Recipe String Generation
The recipe string is **generated automatically** from the BOM (Bill of Materials) and should not be manually edited. The generation logic:
1. Extracts grain items from the recipe BOM
2. Calculates percentages based on grain weights
3. Creates abbreviations based on grain types
4. Applies variety suffixes if multiple sources of same grain exist
5. Formats into the standard pattern

### Recipe String Parsing
For **new recipes**, the string is informational only. Always query the database for:
- Exact grain percentages
- Specific grain varieties and sources
- BOM item details
- Recipe parameters

For **legacy recipes** (pre-2025), parsing logic exists to extract mash bill percentages, but this assumes the old 4-grain format.

## Database Storage

The recipe string is stored in the `Recipe.Recipe` field as a String:
```prisma
model Recipe {
  Recipe       String  // e.g., "WHK-68.5C-10.5R-21M-R01"
  // ... other fields
}
```

**Important:** The recipe string serves as a **unique identifier** and **human-readable label**. The authoritative recipe data resides in:
- `BomItem` records (actual grain items and quantities)
- `RecipeParameter` records (process parameters)
- `MashingProtocol` records (production steps)
There is a database primary key (PK - `id`) and unique global identified (`globalId`) that serve as the critical data point for systemic reference to a recipe
## Migration Notes

### Existing Recipes
- Legacy recipes with the old format (`WHK-68-11-00-21-R01`) remain valid
- Parsing logic handles both formats
- New revisions of legacy recipes should use the new format

### Code References
- Recipe generation: `backend/src/recipe/recipe.generation.ts`
- Mash bill parsing: `getNormalizedMashBillValues()` method
- Database schema: `backend/prisma/schema.prisma`

## Benefits of New Format

1. **Flexibility**: Supports any grain type and any number of grains
2. **Precision**: Decimal percentages for exact formulations
3. **Clarity**: Grain abbreviations make composition clear at a glance
4. **Future-proof**: Easily accommodates new grain types and varieties
5. **Consistency**: Works with automated systems that use DB relationships
6. **Backward compatible**: Old format recipes still work


