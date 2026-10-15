// Simple test to check optimized grants generation
const fs = require('fs');

console.log('🔍 Testing Optimized Grants Generation...\n');

// Read the optimized grants file directly
const optimizedGrants = JSON.parse(fs.readFileSync('optimized-grants.json', 'utf8'));

console.log('📊 Optimized Grants Stats:');
console.log(`Total entries: ${optimizedGrants.length}`);

// Count ProductionOrder permissions
const productionOrderPerms = optimizedGrants.filter(grant => grant.resource === 'ProductionOrder');
console.log(`ProductionOrder permissions: ${productionOrderPerms.length}`);

// Group by role
const roleGroups = {};
productionOrderPerms.forEach(perm => {
  if (!roleGroups[perm.role]) {
    roleGroups[perm.role] = [];
  }
  roleGroups[perm.role].push(perm.action);
});

console.log('\n🔐 ProductionOrder Permissions by Role:');
Object.keys(roleGroups).forEach(role => {
  console.log(`${role}: ${roleGroups[role].join(', ')}`);
});

// Check if read:any exists for all roles
console.log('\n✅ Roles with read:any permission:');
Object.keys(roleGroups).forEach(role => {
  const hasReadAny = roleGroups[role].includes('read:any');
  console.log(`${role}: ${hasReadAny ? '✅' : '❌'}`);
});

// Test the ACL module loading
console.log('\n🚀 Testing ACL Module...');
try {
  // This will test if the module can be loaded
  const { createOptimizedRolesBuilder } = require('./src/auth/acl.module.ts');
  console.log('❌ Cannot require TypeScript file directly');
} catch (error) {
  console.log('❌ Expected error loading TypeScript file:', error.message);
}

console.log('\n💡 The issue might be:');
console.log('1. User role is not what we expect');
console.log('2. Authentication is failing');
console.log('3. The optimized service has a bug in role resolution');
console.log('4. The grants are not being loaded correctly at runtime'); 