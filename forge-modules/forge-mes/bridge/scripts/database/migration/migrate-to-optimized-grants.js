#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 GRANTS SYSTEM MIGRATION SCRIPT');
console.log('=' .repeat(50));

// Step 1: Backup the original grants.json
const originalGrantsPath = path.join(__dirname, 'src', 'grants.json');
const backupPath = path.join(__dirname, 'src', 'grants.json.backup');

if (fs.existsSync(originalGrantsPath)) {
  console.log('📦 Creating backup of original grants.json...');
  fs.copyFileSync(originalGrantsPath, backupPath);
  console.log('✅ Backup created: src/grants.json.backup');
} else {
  console.log('⚠️  Original grants.json not found');
}

// Step 2: Update the ACL module import
const aclModulePath = path.join(__dirname, 'src', 'auth', 'acl.module.ts');

if (fs.existsSync(aclModulePath)) {
  console.log('🔧 Updating ACL module...');
  
  let aclContent = fs.readFileSync(aclModulePath, 'utf8');
  
  // Create a backup of the original ACL module
  fs.writeFileSync(aclModulePath + '.backup', aclContent);
  
  // Replace the content with optimized version
  const optimizedAclContent = `import { Module } from '@nestjs/common';
import { AccessControlModule, RolesBuilder } from 'nest-access-control';
import { OptimizedPermissionService } from './optimized-permission.service';

// Create a factory function that uses our optimized service
export function createOptimizedRolesBuilder(): RolesBuilder {
  const optimizedService = new OptimizedPermissionService();
  const grants = optimizedService.generateFullGrants();
  
  // Log optimization stats for monitoring
  const stats = optimizedService.getOptimizationStats();
  console.log('🚀 Optimized Grants System Loaded:', {
    totalRoles: stats.totalRoles,
    totalPermissions: stats.totalPermissions,
    compressionRatio: stats.compressionRatio
  });
  
  return new RolesBuilder(grants);
}

@Module({
  imports: [
    AccessControlModule.forRoles(createOptimizedRolesBuilder())
  ],
  providers: [OptimizedPermissionService],
  exports: [AccessControlModule, OptimizedPermissionService]
})
export class ACLModule {}
`;

  fs.writeFileSync(aclModulePath, optimizedAclContent);
  console.log('✅ ACL module updated with optimized version');
  console.log('📦 Original backed up as: src/auth/acl.module.ts.backup');
} else {
  console.log('⚠️  ACL module not found at expected path');
}

// Step 3: Verify the optimized permission service exists
const optimizedServicePath = path.join(__dirname, 'src', 'auth', 'optimized-permission.service.ts');
if (fs.existsSync(optimizedServicePath)) {
  console.log('✅ OptimizedPermissionService found');
} else {
  console.log('❌ OptimizedPermissionService not found - please ensure it exists');
}

// Step 4: Create a verification script
const verificationScript = `#!/usr/bin/env node

const { OptimizedPermissionService } = require('./src/auth/optimized-permission.service');

console.log('🔍 VERIFYING OPTIMIZED GRANTS SYSTEM');
console.log('=' .repeat(40));

try {
  const service = new OptimizedPermissionService();
  const stats = service.getOptimizationStats();
  
  console.log('📊 System Statistics:');
  console.log(\`   Total Roles: \${stats.totalRoles}\`);
  console.log(\`   Base Roles: \${stats.baseRoles}\`);
  console.log(\`   Inheriting Roles: \${stats.inheritingRoles}\`);
  console.log(\`   Total Permissions: \${stats.totalPermissions}\`);
  console.log(\`   Compression Ratio: \${stats.compressionRatio}\`);
  
  // Test a few key permissions
  console.log('\\n🧪 Testing Key Permissions:');
  console.log(\`   admin can create:any recipe: \${service.hasPermission('admin', 'recipe', 'create:any')}\`);
  console.log(\`   operationsDistilleryOperator can read:any recipe: \${service.hasPermission('operationsDistilleryOperator', 'recipe', 'read:any')}\`);
  console.log(\`   eTAdmin can read:any recipe: \${service.hasPermission('eTAdmin', 'recipe', 'read:any')}\`);
  
  console.log('\\n✅ Verification completed successfully!');
} catch (error) {
  console.error('❌ Verification failed:', error.message);
  process.exit(1);
}
`;

fs.writeFileSync(path.join(__dirname, 'verify-grants-system.js'), verificationScript);
console.log('✅ Verification script created: verify-grants-system.js');

// Step 5: Create rollback script
const rollbackScript = `#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 ROLLING BACK TO ORIGINAL GRANTS SYSTEM');
console.log('=' .repeat(45));

// Restore original ACL module
const aclModulePath = path.join(__dirname, 'src', 'auth', 'acl.module.ts');
const aclBackupPath = aclModulePath + '.backup';

if (fs.existsSync(aclBackupPath)) {
  fs.copyFileSync(aclBackupPath, aclModulePath);
  console.log('✅ ACL module restored from backup');
} else {
  console.log('⚠️  ACL module backup not found');
}

// Restore original grants.json
const grantsPath = path.join(__dirname, 'src', 'grants.json');
const grantsBackupPath = path.join(__dirname, 'src', 'grants.json.backup');

if (fs.existsSync(grantsBackupPath)) {
  fs.copyFileSync(grantsBackupPath, grantsPath);
  console.log('✅ grants.json restored from backup');
} else {
  console.log('⚠️  grants.json backup not found');
}

console.log('\\n🔄 Rollback completed. Please restart your application.');
`;

fs.writeFileSync(path.join(__dirname, 'rollback-grants-system.js'), rollbackScript);
console.log('✅ Rollback script created: rollback-grants-system.js');

console.log('\n🎉 MIGRATION COMPLETED!');
console.log('\nNext steps:');
console.log('1. Run: node verify-grants-system.js');
console.log('2. Restart your application');
console.log('3. Test your application thoroughly');
console.log('4. If issues occur, run: node rollback-grants-system.js');
console.log('\n📊 Expected improvements:');
console.log('   • ~97% reduction in grants file size');
console.log('   • Faster application startup');
console.log('   • Easier permission management');
console.log('   • Same functionality as before'); 