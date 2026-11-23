#!/usr/bin/env node

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

console.log('\n🔄 Rollback completed. Please restart your application.');
