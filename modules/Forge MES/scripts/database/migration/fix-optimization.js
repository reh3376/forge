const fs = require('fs');
const path = require('path');

// Read the grants.json file
const grantsPath = path.join(__dirname, 'src', 'grants.json');
const grants = JSON.parse(fs.readFileSync(grantsPath, 'utf8'));

console.log('FIXED GRANTS OPTIMIZATION GENERATOR');
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

// Group roles by their exact permission sets, but handle unique permissions
const rolePermissions = new Map();
const uniquePermissions = new Map(); // Track permissions unique to specific roles

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

// Find permissions that are unique to specific roles
const allPermissions = new Map();
grants.forEach(grant => {
  const permKey = `${grant.resource}:${grant.action}:${grant.attributes}`;
  if (!allPermissions.has(permKey)) {
    allPermissions.set(permKey, []);
  }
  allPermissions.get(permKey).push(grant.role);
});

// Identify unique permissions (permissions that only one role has)
const uniquePerms = new Map();
allPermissions.forEach((roleList, permKey) => {
  if (roleList.length === 1) {
    const role = roleList[0];
    if (!uniquePerms.has(role)) {
      uniquePerms.set(role, []);
    }
    uniquePerms.get(role).push(permKey);
  }
});

console.log('\nUnique permissions found:');
uniquePerms.forEach((perms, role) => {
  console.log(`  ${role}: ${perms.join(', ')}`);
});

console.log('\nRole Groups (roles with identical permissions):');
const roleGroups = [];
rolePermissions.forEach((roleList, permissionKey) => {
  console.log(`Group ${roleGroups.length + 1}: ${roleList.join(', ')}`);
  roleGroups.push(roleList);
});

// Generate optimized structure
console.log('\n' + '=' .repeat(50));
console.log('FIXED OPTIMIZED GRANTS STRUCTURE');
console.log('=' .repeat(50));

// Create role hierarchy
const optimizedStructure = {
  roleHierarchy: {},
  basePermissions: {},
  uniquePermissions: {}
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

// Extract base permissions for each base role (excluding unique permissions)
baseRoles.forEach(role => {
  const allRolePermissions = grants.filter(g => g.role === role);
  const uniqueRolePerms = uniquePerms.get(role) || [];
  
  // Filter out unique permissions from base permissions
  const basePerms = allRolePermissions.filter(p => {
    const permKey = `${p.resource}:${p.action}:${p.attributes}`;
    return !uniqueRolePerms.includes(permKey);
  });
  
  optimizedStructure.basePermissions[role] = basePerms.map(p => ({
    resource: p.resource,
    action: p.action,
    attributes: p.attributes
  }));
  
  // Store unique permissions separately
  if (uniqueRolePerms.length > 0) {
    const uniqueRolePermissions = allRolePermissions.filter(p => {
      const permKey = `${p.resource}:${p.action}:${p.attributes}`;
      return uniqueRolePerms.includes(permKey);
    });
    
    optimizedStructure.uniquePermissions[role] = uniqueRolePermissions.map(p => ({
      resource: p.resource,
      action: p.action,
      attributes: p.attributes
    }));
  }
});

// Generate the optimized grants file
const optimizedGrants = {
  roleHierarchy: optimizedStructure.roleHierarchy,
  basePermissions: optimizedStructure.basePermissions,
  uniquePermissions: optimizedStructure.uniquePermissions
};

// Calculate savings
const originalSize = grants.length;
const basePermSize = Object.values(optimizedStructure.basePermissions).reduce((sum, perms) => sum + perms.length, 0);
const uniquePermSize = Object.values(optimizedStructure.uniquePermissions).reduce((sum, perms) => sum + perms.length, 0);
const optimizedSize = basePermSize + uniquePermSize;
const savings = originalSize - optimizedSize;
const savingsPercent = (savings / originalSize * 100).toFixed(1);

console.log(`\nOptimization Results:`);
console.log(`Original: ${originalSize} entries`);
console.log(`Base permissions: ${basePermSize} entries`);
console.log(`Unique permissions: ${uniquePermSize} entries`);
console.log(`Optimized total: ${optimizedSize} entries`);
console.log(`Savings: ${savings} entries (${savingsPercent}%)`);

// Write the optimized structure
fs.writeFileSync(
  path.join(__dirname, 'optimized-grants-fixed.json'),
  JSON.stringify(optimizedGrants, null, 2)
);

console.log('\nFixed optimized grants written to: optimized-grants-fixed.json');

// Generate updated TypeScript service for the new system
const serviceCode = `import { Injectable } from '@nestjs/common';

interface Permission {
  resource: string;
  action: string;
  attributes: string;
}

interface OptimizedGrants {
  roleHierarchy: Record<string, string[]>;
  basePermissions: Record<string, Permission[]>;
  uniquePermissions: Record<string, Permission[]>;
}

@Injectable()
export class OptimizedPermissionService {
  private grants: OptimizedGrants;

  constructor() {
    // Load the optimized grants
    this.grants = require('../optimized-grants-fixed.json');
  }

  /**
   * Get all permissions for a role, including inherited and unique permissions
   */
  getPermissionsForRole(role: string): Permission[] {
    const baseRole = this.findBaseRole(role);
    const basePermissions = this.grants.basePermissions[baseRole] || [];
    const uniquePermissions = this.grants.uniquePermissions[role] || [];
    
    return [...basePermissions, ...uniquePermissions];
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

  /**
   * Get unique permissions for a specific role
   */
  getUniquePermissions(role: string): Permission[] {
    return this.grants.uniquePermissions[role] || [];
  }
}
`;

fs.writeFileSync(
  path.join(__dirname, 'src', 'auth', 'optimized-permission-fixed.service.ts'),
  serviceCode
);

console.log('Generated fixed TypeScript service: src/auth/optimized-permission-fixed.service.ts');

console.log('\n' + '=' .repeat(50));
console.log('FIXED OPTIMIZATION COMPLETE!');
console.log('=' .repeat(50)); 