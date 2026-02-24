# Enzyme Item Number Standards

## Overview

This document establishes the standardized format for enzyme item numbers and ERP IDs to ensure consistency across the system and **explicitly prohibits the use of random number generation** for enzyme items.

## ⚠️ CRITICAL RULE: NO RANDOM GENERATION

**NEVER use random number generators, UUIDs, CUIDs, or any random identifiers for enzyme item numbers or ERP IDs.**

All enzyme identifiers must follow the predefined standardized format outlined in this document.

## Standardized Format

### Item Number Format

```
ENZ-{FACILITY}-{SEQUENCE}-Enzyme ({PRODUCT_NAME})
```

### ERP ID Format

```
ENZ-{FACILITY}-{SEQUENCE}-ERP
```

### Components

- **ENZ**: Fixed prefix for all enzyme items
- **FACILITY**: 3-letter facility code
  - `UNI`: Universal (used across all facilities)
  - `GUS`: Gustafson-specific enzymes
  - Additional facility codes as needed
- **SEQUENCE**: 2-digit sequential number (01, 02, 03, etc.)
- **PRODUCT_NAME**: The actual enzyme product name in parentheses

## Current Enzyme Items

### Liquifaction Enzymes

| Item Number                              | ERP ID          | Product Name        | Description                                        |
| ---------------------------------------- | --------------- | ------------------- | -------------------------------------------------- |
| `ENZ-UNI01-Enzyme (Termamyl SC DS)`      | `ENZ-UNI01-ERP` | Termamyl SC DS      | Alpha amylase enzyme for liquefaction process      |
| `ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)` | `ENZ-UNI04-ERP` | Liquozyme PRO HP DI | Pullulanase enzyme for liquefaction process        |
| `ENZ-UNI05-Enzyme (Amylex 6T)`           | `ENZ-UNI05-ERP` | Amylex 6T           | Alpha amylase enzyme for liquefaction process      |
| `ENZ-UNI06-Enzyme (Alphalase THP)`       | `ENZ-UNI06-ERP` | Alphalase THP       | Thermostable alpha amylase enzyme for liquefaction |

### Saccharification Enzymes

| Item Number                           | ERP ID          | Product Name     | Description                                           |
| ------------------------------------- | --------------- | ---------------- | ----------------------------------------------------- |
| `ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)` | `ENZ-UNI02-ERP` | Saczyme Pro 1.5X | Glucoamylase enzyme for saccharification process      |
| `ENZ-UNI07-Enzyme (Saczyme Yield)`    | `ENZ-UNI07-ERP` | Saczyme Yield    | High-yield glucoamylase enzyme for saccharification   |
| `ENZ-UNI08-Enzyme (Diazyme SSF)`      | `ENZ-UNI08-ERP` | Diazyme SSF      | Simultaneous saccharification and fermentation enzyme |
| `ENZ-GUS02-Enzyme (Diazyme SSF2)`     | `ENZ-GUS02-ERP` | Diazyme SSF2     | Enhanced SSF enzyme for improved fermentation         |

### Viscosity Enzymes

| Item Number                      | ERP ID          | Product Name | Description                                   |
| -------------------------------- | --------------- | ------------ | --------------------------------------------- |
| `ENZ-UNI03-Enzyme (Viscoferm)`   | `ENZ-UNI03-ERP` | Viscoferm    | Beta glucanase enzyme for viscosity reduction |
| `ENZ-GUS01-Enzyme (Laminex C2K)` | `ENZ-GUS01-ERP` | Laminex C2K  | Beta glucanase enzyme for viscosity control   |

## Implementation Guidelines

### 1. No Random Generation

- **NEVER** use random number generators for enzyme item numbers
- **NEVER** use UUIDs, CUIDs, or other random identifiers for item numbers
- **ALWAYS** use the predefined standardized format

### 2. Migration Scripts

- Run `enzyme-item-creation.migration.ts` BEFORE enzyme configuration migrations
- This ensures all required enzyme items exist with consistent identifiers
- The script will create missing items or update existing ones to match standards

### 3. New Enzyme Addition Process

When adding new enzymes:

1. **Determine facility code** (UNI for universal, facility-specific codes for others)
2. **Assign next sequential number** in the facility series
3. **Follow naming convention** exactly
4. **Update this documentation** with the new enzyme
5. **Update migration scripts** if needed

### 4. Database Constraints

- `erpId` must be unique across all items
- `itemNumber` should be unique and follow the standard format
- `itemGroup` should be set to "ENZ" for all enzyme items
- `itemType` should be "Raw Material"
- `itemClass` should be "Enzyme"

## Validation Rules

### Item Number Validation

```typescript
// Valid enzyme item number pattern
const enzymeItemNumberPattern = /^ENZ-[A-Z]{3}\d{2}-Enzyme \(.+\)$/;

// Example validation function
function validateEnzymeItemNumber(itemNumber: string): boolean {
  return enzymeItemNumberPattern.test(itemNumber);
}
```

### ERP ID Validation

```typescript
// Valid enzyme ERP ID pattern
const enzymeErpIdPattern = /^ENZ-[A-Z]{3}\d{2}-ERP$/;

// Example validation function
function validateEnzymeErpId(erpId: string): boolean {
  return enzymeErpIdPattern.test(erpId);
}
```

## Migration Order

1. **enzyme-item-creation.migration.ts** - Creates/updates enzyme items with standard identifiers
2. **001-migrate-enzyme-data.migration.ts** - Creates enzyme configurations
3. **002-advanced-enzyme-migration.migration.ts** - Advanced enzyme configuration setup

## Troubleshooting

### Common Issues

1. **"Item not found" errors in migration**

   - Solution: Run the enzyme item creation migration first

2. **Duplicate item number conflicts**

   - Solution: Check for existing items and update to use standard format

3. **Random identifiers in test data**
   - Solution: Use predefined test identifiers that follow the same pattern

### Verification Queries

```sql
-- Check all enzyme items follow standard format
SELECT itemNumber, erpId, itemName
FROM "Item"
WHERE itemGroup = 'ENZ'
AND (
  itemNumber !~ '^ENZ-[A-Z]{3}[0-9]{2}-Enzyme \(.+\)$'
  OR erpId !~ '^ENZ-[A-Z]{3}[0-9]{2}-ERP$'
);

-- Count enzyme items by facility
SELECT
  SUBSTRING(erpId FROM 5 FOR 3) as facility,
  COUNT(*) as count
FROM "Item"
WHERE itemGroup = 'ENZ'
GROUP BY SUBSTRING(erpId FROM 5 FOR 3);
```

## Contact

For questions about enzyme item standards or to request new enzyme additions, contact the development team.

---

**Last Updated**: January 2025  
**Version**: 1.0
