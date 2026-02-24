# Grants Optimization Migration Guide

## Overview
This optimization reduces the grants.json file from 2698 entries to 740 entries (72.6% reduction) by using role inheritance.

## Role Groups Identified
1. **admin** (base role)
   - Inheriting roles: manager, operator, supervisor
2. **eTAdmin** (base role)
   - Inheriting roles: eTDeveloper, operationDistilleryOperator, operationsDistilleryLeadership, operationsDistilleryShiftlead, operationsDistillerySupervisor
3. **user** (base role)
   - Inheriting roles: none

## Migration Steps

### 1. Backup Current System
```bash
cp src/grants.json src/grants.json.backup
cp src/auth/acl.module.ts src/auth/acl.module.ts.backup
```

### 2. Install New Files
- `optimized-grants.json` - New optimized grants structure
- `src/auth/optimized-permission.service.ts` - Service to handle role inheritance
- `src/auth/acl.module.optimized.ts` - Updated ACL module

### 3. Update ACL Module
Replace the import in `src/auth/acl.module.ts`:
```typescript
// Old
import grants from "../grants.json";

// New  
import { OptimizedPermissionService } from "./optimized-permission.service";
```

### 4. Test the Migration
Run your test suite to ensure no permissions are broken.

### 5. Update Amplication Configuration
Update your Amplication project to generate the new optimized structure instead of the flat grants.json.

## Benefits
- **File size**: Reduced by 72.6%
- **Memory usage**: Significantly lower
- **Maintainability**: Much easier to manage roles
- **Performance**: Faster application startup
- **Flexibility**: Easy to add new roles or modify permissions

## Rollback Plan
If issues arise, restore the backup files:
```bash
cp src/grants.json.backup src/grants.json
cp src/auth/acl.module.ts.backup src/auth/acl.module.ts
```
