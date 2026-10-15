# Database Seeding Quick Reference

## TL;DR - Production Seeding Commands

### Prerequisites
```bash
# 1. Backup database first!
pg_dump -h <host> -U <user> -d <database> > backup.sql

# 2. Generate Prisma client
npx prisma generate
```

### Units Seeding
```bash
# Preview what will be loaded
npx ts-node scripts/database/seeding/load-erp-units.ts --preview

# Load units (if needed)
npx ts-node scripts/database/seeding/load-erp-units.ts --force
```

### Enzyme Configuration Seeding
```bash
# Seed enzyme configurations
npm run prod:seed:enzyme-configs

# Verify configurations
npm run verify:enzyme-configs
```

### Item Group Seeding
```bash
# Seed item groups
npm run prod:seed:itemGroups
```

### Bin Configuration Seeding
```bash
# Seed bin configurations
npm run prod:seed:binConfigurations
```

### Verification
```sql
-- Check units count
SELECT COUNT(*) as total_units FROM "Units";

-- Check enzyme configs
SELECT "configKey", "configValue" FROM "SystemConfiguration" WHERE "configKey" LIKE 'ENZYME_%';

-- Check item groups
SELECT COUNT(*) as total_item_groups FROM "ItemGroup";

-- Verify item group coverage
SELECT i."itemGroup", COUNT(*) as item_count,
       CASE WHEN ig."name" IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM "Item" i LEFT JOIN "ItemGroup" ig ON i."itemGroup" = ig."name"
WHERE i."itemGroup" IS NOT NULL GROUP BY i."itemGroup", ig."name";

-- Check bin configurations
SELECT COUNT(*) as total_bin_configurations FROM "MillingBinConfiguration";

-- Verify bin configuration coverage
SELECT 
  a.name as silo_name,
  ig.name as grain_type,
  mbc.id,
  mbc."createdAt"
FROM "MillingBinConfiguration" mbc
JOIN "Asset" a ON mbc."binId" = a.id
JOIN "ItemGroup" ig ON mbc."itemGroupId" = ig.id
ORDER BY a.name, ig.name;
```

## What Gets Seeded

### Units (20 total)
- **Barrel**: bbl, gal
- **Each**: ea  
- **Mass**: kg, lb, ctr10, oz, bushels, tons
- **Time**: hr
- **Volume**: ml, l, 9le, bbl

### Enzyme Configs (4 total)
- `ENZYME_METRIC_TON_DIVISOR`: 2205
- `ENZYME_CACHE_TTL_MINUTES`: 60
- `ENZYME_CALCULATION_PRECISION`: 3
- `ENZYME_CITRIC_EXCLUSION_ENABLED`: true

### Item Groups (12 total)
- **Raw Material Grains**: RM-GR-COR, RM-GR-RYE, RM-GR-BRY, RM-GR-WHT
- **Raw Materials**: RM-ENZ, RM-YEA, RM-BBL
- **Components**: CP-BBL
- **Finished Goods**: FG-BBL, FG-SST, FG-IBC, FG-DRM

### Bin Configurations (12 total)
- **Silos**: SIL-110, SIL-115, SIL-120
- **Grain Types**: RM-GR-COR, RM-GR-RYE, RM-GR-BRY, RM-GR-WHT
- **Configuration**: Each silo configured for all 4 grain types

## Safety Features
- ✅ Conflict detection prevents duplicates
- ✅ Preview mode for safety
- ✅ Transaction rollback on failure
- ✅ Comprehensive logging

## Troubleshooting
- **TypeScript errors**: Run `npx prisma generate`
- **Conflicts detected**: This is normal - data already exists
- **Permission errors**: Check database credentials
- **Script not found**: Ensure you're in the correct directory

---
📖 **Full Documentation**: [docs/operations/database-seeding-production.md](./database-seeding-production.md) 