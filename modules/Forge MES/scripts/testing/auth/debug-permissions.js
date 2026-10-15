const { OptimizedPermissionService } = require('./src/auth/optimized-permission.service');

console.log('🔍 Debugging ProductionOrder Permissions...\n');

const service = new OptimizedPermissionService();

// Get all roles
const allRoles = service.getAllRoles();
console.log('📋 Available Roles:', allRoles);

// Check ProductionOrder permissions for each role
console.log('\n🔐 ProductionOrder Permissions by Role:');
allRoles.forEach(role => {
  const permissions = service.getPermissionsForRole(role);
  const productionOrderPerms = permissions.filter(p => p.resource === 'ProductionOrder');
  
  console.log(`\n${role}:`);
  if (productionOrderPerms.length > 0) {
    productionOrderPerms.forEach(perm => {
      console.log(`  ✅ ${perm.action}:${perm.attributes}`);
    });
  } else {
    console.log('  ❌ No ProductionOrder permissions');
  }
});

// Test specific permission checks
console.log('\n🧪 Testing hasPermission() method:');
const testRoles = ['admin', 'manager', 'operator', 'user'];
const testActions = ['read', 'create', 'update', 'delete'];

testRoles.forEach(role => {
  console.log(`\n${role}:`);
  testActions.forEach(action => {
    const hasPermission = service.hasPermission(role, 'ProductionOrder', action);
    console.log(`  ${action}: ${hasPermission ? '✅' : '❌'}`);
  });
});

// Show optimization stats
console.log('\n📊 Optimization Stats:');
console.log(service.getOptimizationStats()); 