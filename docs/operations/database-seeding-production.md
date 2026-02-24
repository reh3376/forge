# Production Database Seeding Guide

## Overview

This document outlines the process for seeding essential data in the WhiskeyHouse Recipe Configuration production database. The seeding process includes loading ERP units and enzyme system configurations required for the recipe management and enzyme dosing systems.

## Prerequisites

- Access to the production database
- Prisma client properly configured
- Required environment variables set
- Backup of production database (recommended)

## Seeding Components

### 1. ERP Units Seeding

**Purpose**: Load standardized units of measurement from ERP system into the MES database.

**Script Location**: `scripts/database/seeding/load-erp-units.ts`

**What it seeds**:
- 20 standardized units across 6 categories:
  - **Barrel** (2 units): Barrel (bbl), Gallon (gal)
  - **Each** (1 unit): Each (ea)
  - **Mass (Enz|Yea)** (3 units): Kilogram (kg), Pound (lb), Container10kg (ctr10)
  - **Mass (Pound)** (8 units): Pound (lb), Ounce (oz), Kilogram (kg), Barley/Rye/Corn/Wheat Bushels, Short Ton
  - **Time** (1 unit): Hour (hr)
  - **Volume (Gallon)** (5 units): Gallon (gal), Milliliter (ml), Liter (l), 9Liter (9le), Barrel53 (bbl)

**Features**:
- Conflict detection and prevention
- Preview mode for safety
- Comprehensive logging
- Transaction safety

### 2. Enzyme System Configurations

**Purpose**: Initialize system configuration values required by the enzyme dosing service.

**Script Location**: `scripts/seed.enzyme.systemconfig.ts`

**What it seeds**:
- `ENZYME_METRIC_TON_DIVISOR`: 2205 (conversion factor for pounds to metric tons)
- `ENZYME_CACHE_TTL_MINUTES`: 60 (cache time-to-live in minutes)
- `ENZYME_CALCULATION_PRECISION`: 3 (decimal precision for calculations)
- `ENZYME_CITRIC_EXCLUSION_ENABLED`: true (exclude citric acid from calculations)

**Features**:
- Upsert functionality (create or update)
- Comprehensive logging
- Verification script included

### 3. Item Group Configurations

**Purpose**: Create standardized item group categories used by the inventory management system.

**Script Location**: `scripts/seed.prod.itemGroups.ts`

**What it seeds**:
- 12 item group categories based on actual usage in Items table:
  - **Raw Material Grains** (4 groups): RM-GR-COR (Corn), RM-GR-RYE (Rye), RM-GR-BRY (Barley), RM-GR-WHT (Wheat)
  - **Raw Materials** (3 groups): RM-ENZ (Enzymes), RM-YEA (Yeast), RM-BBL (Barrels)
  - **Components** (1 group): CP-BBL (Component Barrels)
  - **Finished Goods** (4 groups): FG-BBL (Filled Barrels), FG-SST (Stainless Steel Totes), FG-IBC (IBC Containers), FG-DRM (Drums)

**Features**:
- Upsert functionality (create or update)
- Description updates for existing groups
- Comprehensive logging
- Based on actual item group usage in database

### 4. Bin Configurations

**Purpose**: Configure which grain types can be stored in which silos for the milling process.

**Script Location**: `scripts/seed.prod.binConfigurations.ts`

**What it seeds**:
- 12 bin configurations (3 silos × 4 grain types):
  - **Silos**: SIL-110, SIL-115, SIL-120
  - **Grain Types**: RM-GR-COR (Corn), RM-GR-RYE (Rye), RM-GR-BRY (Barley), RM-GR-WHT (Wheat)
  - Each silo is configured to handle all 4 grain types

**Features**:
- Duplicate prevention (checks for existing configurations)
- Comprehensive logging and verification
- Summary report by silo
- Links silos (Assets) to grain types (ItemGroups)

**NPM Script**: `npm run prod:seed:binConfigurations`

**Expected Outcome**: 12 bin configurations created, enabling flexible grain storage across all silos

## Production Seeding Process

### Step 1: Pre-Seeding Verification

1. **Database Backup**
   ```bash
   # Create backup before seeding
   pg_dump -h <host> -U <user> -d <database> > pre-seeding-backup.sql
   ```

2. **Environment Check**
   ```bash
   # Verify database connection
   npx prisma db execute --stdin <<< "SELECT 1;"
   ```

3. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

### Step 2: Units Seeding

1. **Preview Units to be Loaded**
   ```bash
   npx ts-node scripts/database/seeding/load-erp-units.ts --preview
   ```

2. **Check for Existing Units**
   - The script automatically detects conflicts
   - Will show existing units and prevent duplicates

3. **Load Units (if needed)**
   ```bash
   npx ts-node scripts/database/seeding/load-erp-units.ts --force
   ```

**Expected Outcome**: 
- If units already exist: Script will detect conflicts and exit safely
- If units don't exist: 20 units will be loaded successfully
- All units marked as ERP units (`mesConfiguredUnit: false`)

### Step 3: Enzyme Configuration Seeding

1. **Load Enzyme Configurations**
   ```bash
   npm run prod:seed:enzyme-configs
   ```

2. **Verify Configurations**
   ```bash
   npm run verify:enzyme-configs
   ```

**Expected Outcome**:
- 4 system configuration entries created/updated
- All configurations marked as active
- Verification confirms all required configurations present

### Step 4: Item Group Seeding

1. **Load Item Groups**
   ```bash
   npm run prod:seed:itemGroups
   ```

**Expected Outcome**:
- 12 item group categories created
- All item groups used by existing Items are properly defined
- Covers Raw Materials, Components, and Finished Goods categories

### Step 5: Bin Configurations Seeding

1. **Load Bin Configurations**
   ```bash
   npm run prod:seed:binConfigurations
   ```

**Expected Outcome**:
- 12 bin configurations created
- All bin configurations used by existing Items are properly defined
- Covers all silos and grain types

### Step 6: Post-Seeding Verification

1. **Verify Units Count**
   ```sql
   SELECT COUNT(*) as total_units, 
          COUNT(CASE WHEN "mesConfiguredUnit" = false THEN 1 END) as erp_units 
   FROM "Units";
   ```

2. **Verify Enzyme Configurations**
   ```sql
   SELECT "configKey", "configValue", "active" 
   FROM "SystemConfiguration" 
   WHERE "configKey" LIKE 'ENZYME_%';
   ```

3. **Verify Item Groups**
   ```sql
   SELECT COUNT(*) as total_item_groups FROM "ItemGroup";
   
   -- Verify all item groups used by Items are covered
   SELECT 
     i."itemGroup",
     COUNT(*) as item_count,
     CASE WHEN ig."name" IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
   FROM "Item" i
   LEFT JOIN "ItemGroup" ig ON i."itemGroup" = ig."name"
   WHERE i."itemGroup" IS NOT NULL AND i."itemGroup" != ''
   GROUP BY i."itemGroup", ig."name"
   ORDER BY i."itemGroup";
   ```

4. **Verify Bin Configurations**
   ```sql
   SELECT COUNT(*) as total_bin_configurations FROM "BinConfiguration";
   
   -- Verify all bin configurations used by Items are covered
   SELECT 
     b."binConfiguration",
     COUNT(*) as item_count,
     CASE WHEN ig."name" IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
   FROM "Item" i
   LEFT JOIN "BinConfiguration" b ON i."binConfiguration" = b."name"
   LEFT JOIN "ItemGroup" ig ON b."grainType" = ig."name"
   WHERE i."binConfiguration" IS NOT NULL AND i."binConfiguration" != ''
   GROUP BY b."binConfiguration", ig."name"
   ORDER BY b."binConfiguration";
   ```

5. **Check Application Health**
   - Verify enzyme dosing service can access configurations
   - Test recipe management with new units
   - Confirm no application errors

## Troubleshooting

### Common Issues

1. **TypeScript Compilation Errors**
   - Ensure Prisma client is generated: `npx prisma generate`
   - Check TypeScript types match database schema

2. **Conflict Detection**
   - Units script detects existing data and prevents duplicates
   - This is expected behavior for production safety

3. **Permission Issues**
   - Verify database user has INSERT/UPDATE permissions
   - Check connection string and credentials

4. **Transaction Failures**
   - Scripts use transactions for safety
   - Any failure will rollback changes automatically

### Recovery Procedures

1. **If Seeding Fails Partially**
   ```bash
   # Check what was actually inserted
   SELECT * FROM "Units" WHERE "createdBy" = 'system-seeder';
   SELECT * FROM "SystemConfiguration" WHERE "createdBy" = 'system-seeder';
   ```

2. **If Rollback Needed**
   ```bash
   # Restore from backup
   psql -h <host> -U <user> -d <database> < pre-seeding-backup.sql
   ```

## Production Deployment Checklist

- [ ] Database backup created
- [ ] Environment variables verified
- [ ] Prisma client generated
- [ ] Units preview executed successfully
- [ ] Units seeding completed (or confirmed existing)
- [ ] Enzyme configurations seeded
- [ ] Enzyme configurations verified
- [ ] Item groups seeded
- [ ] Bin configurations seeded
- [ ] Post-seeding verification completed
- [ ] Application health check passed
- [ ] Documentation updated

## Maintenance Notes

- **Units**: Once seeded, units should not need re-seeding unless new ERP units are added
- **Enzyme Configurations**: Can be re-run safely due to upsert functionality
- **Monitoring**: Monitor application logs for any issues with unit conversions or enzyme calculations

## Related Scripts

- `scripts/database/seeding/load-erp-units.ts` - Units seeding script
- `scripts/seed.enzyme.systemconfig.ts` - Enzyme configuration seeding
- `scripts/verify-enzyme-configs.ts` - Enzyme configuration verification
- `scripts/test-enzyme-config-seed.ts` - Development testing script

## Contact Information

For issues with production seeding, contact the development team or database administrators.

---

**Last Updated**: June 3, 2025  
**Version**: 1.0  
**Status**: Production Ready 