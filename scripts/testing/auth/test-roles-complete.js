#!/usr/bin/env node

console.log('🧪 COMPREHENSIVE ROLES TEST');
console.log('=' .repeat(50));

const { execSync } = require('child_process');

try {
  const testScript = `
    import { OptimizedPermissionService } from './src/auth/optimized-permission.service';
    import { createOptimizedRolesBuilder } from './src/auth/acl.module';
    
    console.log('✅ Imports successful');
    
    // Test OptimizedPermissionService
    const service = new OptimizedPermissionService();
    const rolesBuilder = createOptimizedRolesBuilder();
    
    // Test all expected roles from database
    const expectedRoles = [
      'admin', 'user', 'test', 'eTAdmin', 'eTDeveloper', 'manager', 
      'operationDistilleryOperator', 'operationsDistilleryLeadership', 
      'operationsDistilleryShiftlead', 'operationsDistillerySupervisor', 
      'operationsDistilleryTechnician', 'operationsDistilleryTechnician2', 
      'operationsDistilleryTechnician3', 'operator', 'supervisor'
    ];
    
    console.log('🔍 Testing all expected roles...');
    let allRolesFound = true;
    
    for (const role of expectedRoles) {
      try {
        const permissions = service.getPermissionsForRole(role);
        const hasProductionOrdersAccess = service.hasPermission(role, 'productionOrders', 'read');
        console.log(\`✅ \${role}: \${permissions.length} permissions, productionOrders access: \${hasProductionOrdersAccess}\`);
      } catch (error) {
        console.log(\`❌ \${role}: ERROR - \${error.message}\`);
        allRolesFound = false;
      }
    }
    
    if (allRolesFound) {
      console.log('\\n🎉 ALL ROLES FOUND AND WORKING!');
    } else {
      console.log('\\n❌ SOME ROLES ARE MISSING OR BROKEN!');
      process.exit(1);
    }
    
    // Test specific user role that was causing the error
    console.log('\\n🎯 Testing specific "user" role for productionOrders access...');
    const userPermissions = service.getPermissionsForRole('user');
    const userHasProductionOrders = service.hasPermission('user', 'productionOrders', 'read');
    console.log(\`User role has \${userPermissions.length} permissions\`);
    console.log(\`User can access productionOrders: \${userHasProductionOrders}\`);
    
    // Test RolesBuilder compatibility
    console.log('\\n🔧 Testing RolesBuilder compatibility...');
    const grants = service.generateFullGrants();
    console.log(\`Generated \${grants.length} grant entries for RolesBuilder\`);
    
    // Test that RolesBuilder can handle the user role
    const userGrants = grants.filter(g => g.role === 'user');
    console.log(\`User role has \${userGrants.length} grants in RolesBuilder format\`);
    
    console.log('\\n📊 Final optimization stats:');
    const stats = service.getOptimizationStats();
    console.log(JSON.stringify(stats, null, 2));
  `;

  const result = execSync(`npx ts-node -e "${testScript}"`, { 
    encoding: 'utf8',
    cwd: process.cwd()
  });
  
  console.log(result);
  console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
  
} catch (error) {
  console.error('❌ TEST FAILED:', error.message);
  if (error.stdout) console.log('STDOUT:', error.stdout);
  if (error.stderr) console.log('STDERR:', error.stderr);
  process.exit(1);
} 