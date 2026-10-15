const fs = require('fs');
const path = require('path');

// Load original grants
const originalGrants = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'grants.json'), 'utf8'));

// Load fixed optimized grants
const optimizedGrants = JSON.parse(fs.readFileSync(path.join(__dirname, 'optimized-grants-fixed.json'), 'utf8'));

console.log('FIXED GRANTS OPTIMIZATION VERIFICATION');
console.log('=' .repeat(50));

// Function to expand optimized grants to full grant list
function expandOptimizedGrants(optimized) {
  const expandedGrants = [];
  
  // Get all roles (base roles + inheriting roles)
  const allRoles = new Set();
  
  // Add base roles
  Object.keys(optimized.basePermissions).forEach(role => allRoles.add(role));
  
  // Add inheriting roles
  Object.values(optimized.roleHierarchy).forEach(inheritingRoles => {
    inheritingRoles.forEach(role => allRoles.add(role));
  });
  
  // Generate grants for each role
  allRoles.forEach(role => {
    // Find base role for this role
    let baseRole = role;
    
    // Check if this role inherits from another
    for (const [base, inheriting] of Object.entries(optimized.roleHierarchy)) {
      if (inheriting.includes(role)) {
        baseRole = base;
        break;
      }
    }
    
    // Get base permissions for base role
    const basePermissions = optimized.basePermissions[baseRole] || [];
    
    // Get unique permissions for this specific role
    const uniquePermissions = optimized.uniquePermissions[role] || [];
    
    // Add base permissions
    basePermissions.forEach(permission => {
      expandedGrants.push({
        role: role,
        resource: permission.resource,
        action: permission.action,
        attributes: permission.attributes
      });
    });
    
    // Add unique permissions
    uniquePermissions.forEach(permission => {
      expandedGrants.push({
        role: role,
        resource: permission.resource,
        action: permission.action,
        attributes: permission.attributes
      });
    });
  });
  
  return expandedGrants;
}

// Expand optimized grants
const expandedGrants = expandOptimizedGrants(optimizedGrants);

console.log(`Original grants: ${originalGrants.length}`);
console.log(`Fixed optimized grants (expanded): ${expandedGrants.length}`);

// Create comparable sets
function createGrantKey(grant) {
  return `${grant.role}|${grant.resource}|${grant.action}|${grant.attributes}`;
}

const originalSet = new Set(originalGrants.map(createGrantKey));
const expandedSet = new Set(expandedGrants.map(createGrantKey));

// Find differences
const onlyInOriginal = [...originalSet].filter(key => !expandedSet.has(key));
const onlyInExpanded = [...expandedSet].filter(key => !originalSet.has(key));

console.log('\nVERIFICATION RESULTS:');
console.log('=' .repeat(30));

if (onlyInOriginal.length === 0 && onlyInExpanded.length === 0) {
  console.log('✅ SUCCESS: Fixed optimized grants produce identical permissions!');
  console.log(`✅ All ${originalGrants.length} permissions are preserved`);
} else {
  console.log('❌ MISMATCH: Differences found between original and optimized grants');
  
  if (onlyInOriginal.length > 0) {
    console.log(`\n❌ Missing in optimized (${onlyInOriginal.length}):`);
    onlyInOriginal.slice(0, 10).forEach(key => {
      const [role, resource, action, attributes] = key.split('|');
      console.log(`   ${role} -> ${resource} -> ${action} -> ${attributes}`);
    });
    if (onlyInOriginal.length > 10) {
      console.log(`   ... and ${onlyInOriginal.length - 10} more`);
    }
  }
  
  if (onlyInExpanded.length > 0) {
    console.log(`\n❌ Extra in optimized (${onlyInExpanded.length}):`);
    onlyInExpanded.slice(0, 10).forEach(key => {
      const [role, resource, action, attributes] = key.split('|');
      console.log(`   ${role} -> ${resource} -> ${action} -> ${attributes}`);
    });
    if (onlyInExpanded.length > 10) {
      console.log(`   ... and ${onlyInExpanded.length - 10} more`);
    }
  }
}

// Performance comparison
console.log('\nPERFORMANCE COMPARISON:');
console.log('=' .repeat(30));

const originalSize = JSON.stringify(originalGrants).length;
const optimizedSize = JSON.stringify(optimizedGrants).length;
const sizeSavings = originalSize - optimizedSize;
const sizeSavingsPercent = (sizeSavings / originalSize * 100).toFixed(1);

console.log(`Original file size: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`Fixed optimized file size: ${(optimizedSize / 1024).toFixed(1)} KB`);
console.log(`Size savings: ${(sizeSavings / 1024).toFixed(1)} KB (${sizeSavingsPercent}%)`);

// Structure analysis
console.log('\nSTRUCTURE ANALYSIS:');
console.log('=' .repeat(25));

console.log(`Base permissions: ${Object.keys(optimizedGrants.basePermissions).length} roles`);
Object.entries(optimizedGrants.basePermissions).forEach(([role, perms]) => {
  console.log(`  ${role}: ${perms.length} permissions`);
});

console.log(`\nUnique permissions: ${Object.keys(optimizedGrants.uniquePermissions).length} roles`);
Object.entries(optimizedGrants.uniquePermissions).forEach(([role, perms]) => {
  console.log(`  ${role}: ${perms.length} unique permissions`);
});

console.log(`\nRole inheritance:`);
Object.entries(optimizedGrants.roleHierarchy).forEach(([baseRole, inheritingRoles]) => {
  console.log(`  ${baseRole} -> ${inheritingRoles.join(', ')}`);
});

console.log('\n' + '=' .repeat(50));
if (onlyInOriginal.length === 0 && onlyInExpanded.length === 0) {
  console.log('🎉 FIXED OPTIMIZATION VERIFIED SUCCESSFULLY!');
  console.log('The fixed optimized grants system is ready for deployment.');
  console.log(`\n📊 Summary:`);
  console.log(`   • Reduced from ${originalGrants.length} to ${Object.values(optimizedGrants.basePermissions).reduce((sum, perms) => sum + perms.length, 0) + Object.values(optimizedGrants.uniquePermissions).reduce((sum, perms) => sum + perms.length, 0)} entries`);
  console.log(`   • File size reduced by ${sizeSavingsPercent}%`);
  console.log(`   • Maintains 100% permission compatibility`);
  console.log(`   • Supports role inheritance and unique permissions`);
} else {
  console.log('⚠️  FIXED OPTIMIZATION NEEDS REVIEW');
  console.log('Please check the differences above before proceeding.');
} 