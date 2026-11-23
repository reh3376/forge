#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFYING OPTIMIZED GRANTS SYSTEM');
console.log('=' .repeat(40));

// Check if required files exist
const requiredFiles = [
  'src/auth/optimized-permission.service.ts',
  'src/auth/acl.module.ts',
  'src/grants.json.backup'
];

let allFilesExist = true;

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please run the migration script again.');
  process.exit(1);
}

// Check ACL module content
const aclModulePath = path.join(__dirname, 'src', 'auth', 'acl.module.ts');
const aclContent = fs.readFileSync(aclModulePath, 'utf8');

console.log('\n🔧 Checking ACL module configuration:');
const hasOptimizedService = aclContent.includes('OptimizedPermissionService');
const hasCreateOptimizedRolesBuilder = aclContent.includes('createOptimizedRolesBuilder');
const hasModuleDecorator = aclContent.includes('@Module');

console.log(`   ${hasOptimizedService ? '✅' : '❌'} Uses OptimizedPermissionService`);
console.log(`   ${hasCreateOptimizedRolesBuilder ? '✅' : '❌'} Has createOptimizedRolesBuilder function`);
console.log(`   ${hasModuleDecorator ? '✅' : '❌'} Has @Module decorator`);

// Check optimized service content
const servicePath = path.join(__dirname, 'src', 'auth', 'optimized-permission.service.ts');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

console.log('\n⚙️  Checking OptimizedPermissionService:');
const hasBasePermissions = serviceContent.includes('basePermissions');
const hasRoleInheritance = serviceContent.includes('roleInheritance');
const hasGenerateFullGrants = serviceContent.includes('generateFullGrants');
const hasGetPermissionsForRole = serviceContent.includes('getPermissionsForRole');

console.log(`   ${hasBasePermissions ? '✅' : '❌'} Has basePermissions structure`);
console.log(`   ${hasRoleInheritance ? '✅' : '❌'} Has roleInheritance structure`);
console.log(`   ${hasGenerateFullGrants ? '✅' : '❌'} Has generateFullGrants method`);
console.log(`   ${hasGetPermissionsForRole ? '✅' : '❌'} Has getPermissionsForRole method`);

// Count roles and permissions in the service
const adminMatches = (serviceContent.match(/"admin":/g) || []).length;
const operatorMatches = (serviceContent.match(/"operationsDistilleryOperator":/g) || []).length;
const inheritanceMatches = (serviceContent.match(/"eTAdmin":|"eTDeveloper":|"operationDistilleryOperator":/g) || []).length;

console.log('\n📊 Permission structure analysis:');
console.log(`   Admin role definitions: ${adminMatches}`);
console.log(`   Operator role definitions: ${operatorMatches}`);
console.log(`   Role inheritance entries: ${inheritanceMatches}`);

// Estimate file size reduction
const originalSize = fs.existsSync(path.join(__dirname, 'src', 'grants.json.backup')) 
  ? fs.statSync(path.join(__dirname, 'src', 'grants.json.backup')).size 
  : 0;
const optimizedSize = fs.statSync(servicePath).size;
const reduction = originalSize > 0 ? ((1 - optimizedSize / originalSize) * 100).toFixed(1) : 'N/A';

console.log('\n📈 File size comparison:');
console.log(`   Original grants.json: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`   Optimized service: ${(optimizedSize / 1024).toFixed(1)} KB`);
console.log(`   Size reduction: ${reduction}%`);

// Final verification
const allChecksPass = hasOptimizedService && hasCreateOptimizedRolesBuilder && hasModuleDecorator &&
                     hasBasePermissions && hasRoleInheritance && hasGenerateFullGrants && hasGetPermissionsForRole;

console.log('\n' + '=' .repeat(40));
if (allChecksPass) {
  console.log('✅ VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('\n🚀 Next steps:');
  console.log('   1. Restart your application');
  console.log('   2. Check startup logs for optimization stats');
  console.log('   3. Test your application functionality');
  console.log('   4. Monitor for any permission-related issues');
} else {
  console.log('❌ VERIFICATION FAILED!');
  console.log('\n🔧 Recommended actions:');
  console.log('   1. Run: node rollback-grants-system.js');
  console.log('   2. Check for any file corruption');
  console.log('   3. Re-run: node migrate-to-optimized-grants.js');
  process.exit(1);
}
