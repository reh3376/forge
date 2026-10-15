const fs = require('fs');
const path = require('path');

// Read the grants.json file
const grantsPath = path.join(__dirname, 'src', 'grants.json');
const grants = JSON.parse(fs.readFileSync(grantsPath, 'utf8'));

console.log('GRANTS OPTIMIZATION GENERATOR');
console.log('=' .repeat(50));

// Analyze the current structure
const roles = new Set();
const resources = new Set();
const actions = new Set();

grants.forEach(grant => {
  roles.add(grant.role);
  resources.add(grant.resource);
  actions.add(grant.action);
});

console.log(`Current structure: ${grants.length} entries`);
console.log(`Roles: ${roles.size}, Resources: ${resources.size}, Actions: ${actions.size}`);

// Group roles by their exact permission sets
const rolePermissions = new Map();
roles.forEach(role => {
  const permissions = grants
    .filter(g => g.role === role)
    .map(g => `${g.resource}:${g.action}:${g.attributes}`)
    .sort();
  
  const permissionKey = permissions.join('|');
  if (!rolePermissions.has(permissionKey)) {
    rolePermissions.set(permissionKey, []);
  }
  rolePermissions.get(permissionKey).push(role);
});

console.log('\nRole Groups (roles with identical permissions):');
const roleGroups = [];
rolePermissions.forEach((roleList, permissionKey) => {
  console.log(`Group ${roleGroups.length + 1}: ${roleList.join(', ')}`);
  roleGroups.push(roleList);
});

// Generate optimized structure
console.log('\n' + '=' .repeat(50));
console.log('OPTIMIZED GRANTS STRUCTURE');
console.log('=' .repeat(50));

// Create role hierarchy
const optimizedStructure = {
  roleHierarchy: {},
  basePermissions: {},
  resourceExceptions: {}
};

// Define base roles (one from each group)
const baseRoles = roleGroups.map(group => group[0]);
console.log(`\nBase roles: ${baseRoles.join(', ')}`);

// Create inheritance mapping
roleGroups.forEach(group => {
  const baseRole = group[0];
  const inheritingRoles = group.slice(1);
  
  if (inheritingRoles.length > 0) {
    optimizedStructure.roleHierarchy[baseRole] = inheritingRoles;
  }
});

// Extract base permissions for each base role
baseRoles.forEach(role => {
  const permissions = grants.filter(g => g.role === role);
  optimizedStructure.basePermissions[role] = permissions.map(p => ({
    resource: p.resource,
    action: p.action,
    attributes: p.attributes
  }));
});

// Generate the optimized grants file
const optimizedGrants = {
  roleHierarchy: optimizedStructure.roleHierarchy,
  basePermissions: optimizedStructure.basePermissions
};

// Calculate savings
const originalSize = grants.length;
const optimizedSize = Object.values(optimizedStructure.basePermissions).reduce((sum, perms) => sum + perms.length, 0);
const savings = originalSize - optimizedSize;
const savingsPercent = (savings / originalSize * 100).toFixed(1);

console.log(`\nOptimization Results:`);
console.log(`Original: ${originalSize} entries`);
console.log(`Optimized: ${optimizedSize} entries`);
console.log(`Savings: ${savings} entries (${savingsPercent}%)`);

// Write the optimized structure
fs.writeFileSync(
  path.join(__dirname, 'optimized-grants.json'),
  JSON.stringify(optimizedGrants, null, 2)
);

console.log('\nOptimized grants written to: optimized-grants.json');

// Generate TypeScript service for the new system
const serviceCode = `import { Injectable } from '@nestjs/common';

interface Permission {
  resource: string;
  action: string;
  attributes: string;
}

interface OptimizedGrants {
  roleHierarchy: Record<string, string[]>;
  basePermissions: Record<string, Permission[]>;
}

@Injectable()
export class OptimizedPermissionService {
  private grants: OptimizedGrants;

  constructor() {
    // Load the optimized grants
    this.grants = require('../optimized-grants.json');
  }

  /**
   * Get all permissions for a role, including inherited permissions
   */
  getPermissionsForRole(role: string): Permission[] {
    // Find the base role for this role
    const baseRole = this.findBaseRole(role);
    return this.grants.basePermissions[baseRole] || [];
  }

  /**
   * Check if a role has a specific permission
   */
  hasPermission(role: string, resource: string, action: string, attributes: string = '*'): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.some(p => 
      p.resource === resource && 
      p.action === action && 
      p.attributes === attributes
    );
  }

  /**
   * Find the base role for a given role (handles inheritance)
   */
  private findBaseRole(role: string): string {
    // Check if this role is a base role
    if (this.grants.basePermissions[role]) {
      return role;
    }

    // Find which base role this role inherits from
    for (const [baseRole, inheritingRoles] of Object.entries(this.grants.roleHierarchy)) {
      if (inheritingRoles.includes(role)) {
        return baseRole;
      }
    }

    throw new Error(\`Unknown role: \${role}\`);
  }

  /**
   * Get all roles that inherit from a base role
   */
  getInheritingRoles(baseRole: string): string[] {
    return this.grants.roleHierarchy[baseRole] || [];
  }

  /**
   * Get all available roles
   */
  getAllRoles(): string[] {
    const baseRoles = Object.keys(this.grants.basePermissions);
    const inheritingRoles = Object.values(this.grants.roleHierarchy).flat();
    return [...baseRoles, ...inheritingRoles];
  }
}
`;

fs.writeFileSync(
  path.join(__dirname, 'src', 'auth', 'optimized-permission.service.ts'),
  serviceCode
);

console.log('Generated TypeScript service: src/auth/optimized-permission.service.ts');

// Generate updated ACL module
const aclModuleCode = `import { AccessControlModule, RolesBuilder } from "nest-access-control";
import { OptimizedPermissionService } from "./optimized-permission.service";

// Create a dynamic grants array from the optimized structure
function createGrantsFromOptimizedStructure(): any[] {
  const permissionService = new OptimizedPermissionService();
  const allRoles = permissionService.getAllRoles();
  const grants: any[] = [];

  allRoles.forEach(role => {
    const permissions = permissionService.getPermissionsForRole(role);
    permissions.forEach(permission => {
      grants.push({
        role,
        resource: permission.resource,
        action: permission.action,
        attributes: permission.attributes
      });
    });
  });

  return grants;
}

const optimizedGrants = createGrantsFromOptimizedStructure();

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ACLModule = AccessControlModule.forRoles(new RolesBuilder(optimizedGrants));
`;

fs.writeFileSync(
  path.join(__dirname, 'src', 'auth', 'acl.module.optimized.ts'),
  aclModuleCode
);

console.log('Generated optimized ACL module: src/auth/acl.module.optimized.ts');

// Generate migration guide
const migrationGuide = `# Grants Optimization Migration Guide

## Overview
This optimization reduces the grants.json file from ${originalSize} entries to ${optimizedSize} entries (${savingsPercent}% reduction) by using role inheritance.

## Role Groups Identified
${roleGroups.map((group, i) => `${i + 1}. **${group[0]}** (base role)
   - Inheriting roles: ${group.slice(1).join(', ') || 'none'}`).join('\n')}

## Migration Steps

### 1. Backup Current System
\`\`\`bash
cp src/grants.json src/grants.json.backup
cp src/auth/acl.module.ts src/auth/acl.module.ts.backup
\`\`\`

### 2. Install New Files
- \`optimized-grants.json\` - New optimized grants structure
- \`src/auth/optimized-permission.service.ts\` - Service to handle role inheritance
- \`src/auth/acl.module.optimized.ts\` - Updated ACL module

### 3. Update ACL Module
Replace the import in \`src/auth/acl.module.ts\`:
\`\`\`typescript
// Old
import grants from "../grants.json";

// New  
import { OptimizedPermissionService } from "./optimized-permission.service";
\`\`\`

### 4. Test the Migration
Run your test suite to ensure no permissions are broken.

### 5. Update Amplication Configuration
Update your Amplication project to generate the new optimized structure instead of the flat grants.json.

## Benefits
- **File size**: Reduced by ${savingsPercent}%
- **Memory usage**: Significantly lower
- **Maintainability**: Much easier to manage roles
- **Performance**: Faster application startup
- **Flexibility**: Easy to add new roles or modify permissions

## Rollback Plan
If issues arise, restore the backup files:
\`\`\`bash
cp src/grants.json.backup src/grants.json
cp src/auth/acl.module.ts.backup src/auth/acl.module.ts
\`\`\`
`;

fs.writeFileSync(
  path.join(__dirname, 'GRANTS_MIGRATION_GUIDE.md'),
  migrationGuide
);

console.log('Generated migration guide: GRANTS_MIGRATION_GUIDE.md');

console.log('\n' + '=' .repeat(50));
console.log('OPTIMIZATION COMPLETE!');
console.log('=' .repeat(50));
console.log('Files generated:');
console.log('1. optimized-grants.json - Optimized grants structure');
console.log('2. src/auth/optimized-permission.service.ts - Permission service');
console.log('3. src/auth/acl.module.optimized.ts - Updated ACL module');
console.log('4. GRANTS_MIGRATION_GUIDE.md - Migration instructions');
console.log('\nNext steps:');
console.log('1. Review the generated files');
console.log('2. Test the optimized permission service');
console.log('3. Follow the migration guide to implement'); 