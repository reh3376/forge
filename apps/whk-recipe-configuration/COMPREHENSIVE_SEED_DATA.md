# Comprehensive Database Seed Data Documentation

This document provides a complete overview of the comprehensive seed data created for the whiskey house recipe management and scheduling system.

## Overview

The comprehensive seed data package includes:

- **Core Configuration Data**: Recipe parameters, test parameters, units, system configurations
- **Production Data**: Mashing protocols, recipes, BOMs, ingredients
- **Scheduling Infrastructure**: Schedule orders, production orders, assets, queues
- **Robust FK Linking**: Properly linked foreign key relationships across all tables

## Migration Files Created

### 1. 20250904000001_seed_mashing_protocols

**Purpose**: Seeds mashing protocols and steps for different whiskey types

**Data Created**:

- 6 Master Mashing Protocols:

  - Rye Bourbon Master Protocol
  - Wheated Bourbon Master Protocol
  - Four Grain Bourbon Master Protocol
  - Rye Whiskey Master Protocol
  - Wheat Whiskey Master Protocol
  - Malt Whiskey Master Protocol

- 40+ Mashing Protocol Steps with:
  - Temperature setpoints
  - Time durations
  - Heat/cool/agitator control settings
  - Operator prompt messages
  - Step sequencing

**Key Features**:

- Template-based protocols for different whiskey categories
- Proper temperature ramping and hold sequences
- Ingredient addition timing aligned with process steps
- Industry-standard mashing profiles

### 2. 20250904000002_seed_items_and_recipes

**Purpose**: Seeds items, recipes, recipe groups, and recipe BOMs

**Data Created**:

- **Vendors** (4):

  - Prairie Grain Cooperative (grains)
  - Lallemand Distilling (yeast)
  - Novozymes Biologicals (enzymes)
  - Independent Stave Company (barrels)

- **Customers** (2):

  - House Brand Whiskey
  - Premium Private Label Co

- **Items** (13 core items):

  - Raw Materials: Corn, Rye, Wheat, Malted Barley
  - Yeast: DistilaMax MW
  - Enzymes: Liquozyme SC DS, SAN Super 240L
  - Process: Water, Citric Acid
  - Packaging: 53-gal and 30-gal Oak Barrels
  - Finished Goods: Premium Rye Bourbon, Wheated Bourbon, 95% Rye Whiskey

- **Recipe Groups** (3):

  - High Rye Bourbon Recipe Group
  - Wheated Bourbon Recipe Group
  - Rye Whiskey Recipe Group

- **Master Recipes** (3):

  - High Rye Bourbon (75% Corn, 21% Rye, 4% Malt)
  - Wheated Bourbon (68% Corn, 16% Wheat, 16% Malt)
  - High Rye Whiskey (51% Rye, 35% Corn, 14% Malt)

- **Recipe BOMs and BOM Items**:
  - Proper grain bills with accurate percentages
  - Water ratios calculated for mash consistency
  - Enzyme dosages based on grain weight
  - Yeast quantities for fermentation

### 3. 20250904000003_seed_recipe_bom_step_links

**Purpose**: Links Recipe BOM Items to specific Mashing Protocol Steps

**Data Created**:

- **Recipe BOM Item to Mashing Step Links**:

  - Water added in initial step
  - Primary grains added at optimal temperatures
  - Secondary grains added in proper sequence
  - Malt added for enzyme conversion
  - Enzymes added during saccharification

- **Procedural Framework**:
  - Unit Procedures: Mashing01, Fermentation01, Distillation01
  - Operations: Cook, FermenterSet, Fermenter, StillRun
  - Recipe to Unit Procedure relationships

**Key Features**:

- Ingredient timing aligned with process steps
- Temperature-optimized addition sequences
- Proper enzyme conversion workflow
- Scalable procedural framework

### 4. 20250904000004_seed_scheduling_data

**Purpose**: Seeds comprehensive scheduling infrastructure

**Data Created**:

- **Assets** (15 production assets):

  - Production and Packaging Areas
  - Line 1 with equipment hierarchy
  - Mash Tuns (2), Fermenters (4), Still Column (1)
  - Storage Silos for each grain type

- **Schedule Order Queues** (5):

  - Prioritized scheduling queues
  - Area assignments for production flow

- **Schedule Orders** (3 quarterly production runs):

  - Q1 2025 Rye Bourbon: 400 barrels, 38-day timeline
  - Q1 2025 Wheated Bourbon: 350 barrels, 38-day timeline
  - Q2 2025 High Rye Whiskey: 250 barrels, 37-day timeline

- **Production Orders** (3):

  - Detailed production specifications
  - Material requirements calculated
  - Timeline and capacity planning

- **BOMs and BOM Items**:
  - Production-scale material quantities
  - Proper unit conversions
  - Cost and yield calculations

### 5. 20250904000005_fix_foreign_key_relationships

**Purpose**: Ensures robust foreign key linking across all tables

**Data Fixed**:

- Vendor-Item relationships
- Customer-Order relationships
- Asset hierarchy (parent-child)
- Recipe-RecipeBom relationships
- Production Order-Schedule Order links
- Unit relationships and conversions
- Recipe Group memberships

## Data Relationships and Dependencies

### Core Data Flow

```
Recipe Groups
    ↓
Master Recipes ← Mashing Protocols
    ↓              ↓
Recipe BOMs → Recipe BOM Items → Mashing Protocol Steps
    ↓
Production Orders ← Schedule Orders ← Schedule Order Queues
    ↓
Production BOM Items (scaled quantities)
```

### Key Foreign Key Relationships

- `Recipe.customerId` → `Customer.id`
- `Recipe.recipeGroupId` → `RecipeGroup.id`
- `Recipe.mashingProtocolId` → `MashingProtocol.id`
- `RecipeBomItem.recipeBomsId` → `RecipeBom.id`
- `RecipeBomItem.itemId` → `Item.id`
- `Item.vendorId` → `Vendor.id`
- `ProductionOrder.scheduleOrderId` → `ScheduleOrder.id`
- `ProductionOrder.customerId` → `Customer.id`
- `ScheduleOrder.scheduleOrderQueueId` → `ScheduleOrderQueue.id`
- `Asset.parentId` → `Asset.id` (hierarchy)

## Grain Bills and Formulations

### High Rye Bourbon

- **75% Corn** (1,500 lbs per cook)
- **21% Rye** (420 lbs per cook)
- **4% Malted Barley** (80 lbs per cook)
- **Water**: 4,920 gallons (2.46:1 liquid to grain ratio)
- **Total Grain Weight**: 2,000 lbs per cook

### Wheated Bourbon

- **68% Corn** (1,360 lbs per cook)
- **16% Wheat** (320 lbs per cook)
- **16% Malted Barley** (320 lbs per cook)
- **Water**: 4,920 gallons
- **Total Grain Weight**: 2,000 lbs per cook

### High Rye Whiskey

- **51% Rye** (1,020 lbs per cook)
- **35% Corn** (700 lbs per cook)
- **14% Malted Barley** (280 lbs per cook)
- **Water**: 4,920 gallons
- **Total Grain Weight**: 2,000 lbs per cook

## Production Scaling

### Schedule Order Calculations

- **Cook Size**: 2,000 lbs grain, 4,920 gallons liquid
- **Cooks Per Fermenter**: 3
- **Fermenter Capacity**: 15,000 gallons
- **Expected Yield**: ~65 proof gallons per barrel
- **Barrels Per Fermenter**: ~100

### Example: 400 Barrel Rye Bourbon Run

- **Total Grain Required**: 24,000 lbs (12 cooks × 2,000 lbs)
- **Total Water Required**: 59,040 gallons
- **Fermenters Used**: 4 (3 cooks each)
- **Production Timeline**: 38 days
  - Mashing: 7 days
  - Fermentation: 21 days
  - Distillation: 10 days

## Usage Instructions

### Running the Seed Script

```bash
# From the app root directory
cd apps/whk-recipe-configuration
./seed-comprehensive-data.sh
```

### Verification Queries

```sql
-- Check Recipe Parameters
SELECT COUNT(*) FROM "RecipeParameter" WHERE "schemaVersion" LIKE '202509%';

-- Check Mashing Protocols
SELECT name, "templateCategory" FROM "MashingProtocol" WHERE master = true;

-- Check Recipe BOMs
SELECT r."Recipe", rb.id, COUNT(rbi.id) as item_count
FROM "Recipe" r
JOIN "RecipeBom" rb ON r.id = ANY(rb.recipe)
JOIN "RecipeBomItem" rbi ON rb.id = rbi."recipeBomsId"
GROUP BY r."Recipe", rb.id;

-- Check Schedule Orders
SELECT name, status, "totalBarrels", "estimatedStart", "estimatedEnd"
FROM "ScheduleOrder"
ORDER BY "estimatedStart";

-- Check Production Orders
SELECT po.name, so.name as schedule_order, po."totalGrainWeight", po."plannedCooks"
FROM "ProductionOrder" po
JOIN "ScheduleOrder" so ON po."scheduleOrderId" = so.id;
```

### Data Customization

To customize the seeded data:

1. Modify the migration SQL files before running
2. Adjust grain bills, quantities, or timelines
3. Add additional recipes, products, or customers
4. Update asset configurations for your facility
5. Modify mashing protocols for your process

## Support and Maintenance

### Adding New Recipes

1. Create new entries in Recipe, RecipeGroup tables
2. Create corresponding RecipeBom and RecipeBomItem records
3. Link to appropriate MashingProtocol
4. Scale quantities for production

### Adding New Production Runs

1. Create ScheduleOrder with proper timing
2. Create linked ProductionOrder with scaled quantities
3. Create ProductionOrderRecipeInstance for tracking
4. Generate scaled BOM items for material planning

### Maintenance Scripts

Consider creating additional scripts for:

- Data validation and integrity checks
- Production scaling calculations
- Material requirement planning
- Schedule optimization

## Conclusion

This comprehensive seed data package provides a complete foundation for whiskey production management, including:

- Industry-standard recipes and processes
- Proper material calculations and scaling
- Robust scheduling infrastructure
- Complete traceability and foreign key integrity

The system is now ready for production use with realistic data that reflects actual distillery operations.
