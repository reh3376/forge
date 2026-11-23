const fs = require('fs');
const path = require('path');

// Load original grants
const originalGrants = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'grants.json'), 'utf8'));

// Load optimized grants
const optimizedGrants = JSON.parse(fs.readFileSync(path.join(__dirname, 'optimized-grants.json'), 'utf8'));

console.log('GRANTS OPTIMIZATION VERIFICATION');
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
    
    // Get permissions for base role
    const permissions = optimized.basePermissions[baseRole] || [];
    
    // Add grants for this role
    permissions.forEach(permission => {
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
console.log(`Optimized grants (expanded): ${expandedGrants.length}`);

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
  console.log('✅ SUCCESS: Optimized grants produce identical permissions!');
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
console.log(`Optimized file size: ${(optimizedSize / 1024).toFixed(1)} KB`);
console.log(`Size savings: ${(sizeSavings / 1024).toFixed(1)} KB (${sizeSavingsPercent}%)`);

// Memory usage simulation
const originalMemory = originalGrants.length * 4; // Rough estimate: 4 properties per grant
const optimizedMemory = Object.keys(optimizedGrants.basePermissions).length * 
                        Object.values(optimizedGrants.basePermissions).reduce((sum, perms) => sum + perms.length, 0) * 4;

console.log(`\nEstimated memory usage:`);
console.log(`Original: ~${(originalMemory / 1024).toFixed(1)} KB`);
console.log(`Optimized: ~${(optimizedMemory / 1024).toFixed(1)} KB`);
console.log(`Memory savings: ~${((originalMemory - optimizedMemory) / 1024).toFixed(1)} KB`);

// Role analysis
console.log('\nROLE ANALYSIS:');
console.log('=' .repeat(20));

const originalRoles = [...new Set(originalGrants.map(g => g.role))];
const optimizedBaseRoles = Object.keys(optimizedGrants.basePermissions);
const optimizedInheritingRoles = Object.values(optimizedGrants.roleHierarchy).flat();

console.log(`Original roles: ${originalRoles.length}`);
console.log(`Optimized base roles: ${optimizedBaseRoles.length}`);
console.log(`Optimized inheriting roles: ${optimizedInheritingRoles.length}`);
console.log(`Total optimized roles: ${optimizedBaseRoles.length + optimizedInheritingRoles.length}`);

// Verify all original roles are covered
const allOptimizedRoles = [...optimizedBaseRoles, ...optimizedInheritingRoles];
const missingRoles = originalRoles.filter(role => !allOptimizedRoles.includes(role));

if (missingRoles.length === 0) {
  console.log('✅ All original roles are covered in optimized structure');
} else {
  console.log(`❌ Missing roles: ${missingRoles.join(', ')}`);
}

console.log('\n' + '=' .repeat(50));
if (onlyInOriginal.length === 0 && onlyInExpanded.length === 0 && missingRoles.length === 0) {
  console.log('🎉 OPTIMIZATION VERIFIED SUCCESSFULLY!');
  console.log('The optimized grants system is ready for deployment.');
} else {
  console.log('⚠️  OPTIMIZATION NEEDS REVIEW');
  console.log('Please check the differences above before proceeding.');
} 