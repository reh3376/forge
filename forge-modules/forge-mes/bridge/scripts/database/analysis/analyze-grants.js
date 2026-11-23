const fs = require('fs');
const path = require('path');

// Read the grants.json file
const grantsPath = path.join(__dirname, '..', '..', '..', 'apps', 'whk-recipe-configuration', 'src', 'grants.json');
const grants = JSON.parse(fs.readFileSync(grantsPath, 'utf8'));

console.log(`Total grants entries: ${grants.length}`);
console.log('=' .repeat(50));

// Count unique combinations
const combinations = new Map();
const roles = new Set();
const resources = new Set();
const actions = new Set();
const attributes = new Set();

grants.forEach(grant => {
  const { role, resource, action, attributes: attr } = grant;
  
  // Track individual values
  roles.add(role);
  resources.add(resource);
  actions.add(action);
  attributes.add(attr);
  
  // Create combination key
  const key = `${role}|${resource}|${action}|${attr}`;
  combinations.set(key, (combinations.get(key) || 0) + 1);
});

console.log(`Unique roles: ${roles.size}`);
console.log(`Unique resources: ${resources.size}`);
console.log(`Unique actions: ${actions.size}`);
console.log(`Unique attributes: ${attributes.size}`);
console.log(`Unique combinations: ${combinations.size}`);
console.log('=' .repeat(50));

// Show roles
console.log('\nROLES:');
Array.from(roles).sort().forEach(role => {
  const count = grants.filter(g => g.role === role).length;
  console.log(`  ${role}: ${count} grants`);
});

// Show resources
console.log('\nRESOURCES:');
Array.from(resources).sort().forEach(resource => {
  const count = grants.filter(g => g.resource === resource).length;
  console.log(`  ${resource}: ${count} grants`);
});

// Show actions
console.log('\nACTIONS:');
Array.from(actions).sort().forEach(action => {
  const count = grants.filter(g => g.action === action).length;
  console.log(`  ${action}: ${count} grants`);
});

// Show attributes
console.log('\nATTRIBUTES:');
Array.from(attributes).sort().forEach(attr => {
  const count = grants.filter(g => g.attributes === attr).length;
  console.log(`  ${attr}: ${count} grants`);
});

// Show duplicates (combinations that appear more than once)
console.log('\nDUPLICATE COMBINATIONS:');
const duplicates = Array.from(combinations.entries())
  .filter(([key, count]) => count > 1)
  .sort((a, b) => b[1] - a[1]);

if (duplicates.length > 0) {
  duplicates.forEach(([key, count]) => {
    const [role, resource, action, attr] = key.split('|');
    console.log(`  ${count}x: ${role} -> ${resource} -> ${action} -> ${attr}`);
  });
} else {
  console.log('  No duplicate combinations found');
}

// Calculate theoretical minimum size
console.log('\n' + '=' .repeat(50));
console.log('OPTIMIZATION ANALYSIS:');
console.log(`Current file size: ${grants.length} entries`);
console.log(`Unique combinations: ${combinations.size} entries`);
console.log(`Potential reduction: ${grants.length - combinations.size} entries (${((grants.length - combinations.size) / grants.length * 100).toFixed(1)}%)`);

// Analyze role patterns
console.log('\nROLE PATTERN ANALYSIS:');
const roleResourceActions = new Map();

grants.forEach(grant => {
  const key = `${grant.role}|${grant.resource}`;
  if (!roleResourceActions.has(key)) {
    roleResourceActions.set(key, new Set());
  }
  roleResourceActions.get(key).add(`${grant.action}:${grant.attributes}`);
});

// Find roles that have identical permissions
const permissionPatterns = new Map();
roles.forEach(role => {
  const rolePermissions = grants
    .filter(g => g.role === role)
    .map(g => `${g.resource}|${g.action}|${g.attributes}`)
    .sort()
    .join('||');
  
  if (!permissionPatterns.has(rolePermissions)) {
    permissionPatterns.set(rolePermissions, []);
  }
  permissionPatterns.get(rolePermissions).push(role);
});

console.log('\nROLES WITH IDENTICAL PERMISSIONS:');
permissionPatterns.forEach((roleList, pattern) => {
  if (roleList.length > 1) {
    console.log(`  ${roleList.join(', ')} - have identical permissions`);
  }
});

// Generate optimized structure suggestion
console.log('\n' + '=' .repeat(50));
console.log('SUGGESTED OPTIMIZATION STRUCTURE:');

// Group roles by permission patterns
const roleGroups = new Map();
permissionPatterns.forEach((roleList, pattern) => {
  if (roleList.length > 1) {
    roleGroups.set(roleList[0], roleList);
  }
});

console.log('\nRole inheritance suggestion:');
roleGroups.forEach((roles, baseRole) => {
  console.log(`  ${baseRole} (base): ${roles.slice(1).join(', ')} inherit from ${baseRole}`);
});

// Calculate matrix efficiency
const totalPossibleCombinations = roles.size * resources.size * actions.size * attributes.size;
console.log(`\nMatrix efficiency: ${combinations.size}/${totalPossibleCombinations} = ${(combinations.size / totalPossibleCombinations * 100).toFixed(2)}% of possible combinations used`); 