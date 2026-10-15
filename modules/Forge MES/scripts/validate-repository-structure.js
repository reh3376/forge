#!/usr/bin/env node

/**
 * Repository Structure Validation Script
 * 
 * This script analyzes the current repository structure and identifies:
 * - JavaScript/TypeScript files that need to be organized
 * - Markdown documentation that needs to be categorized
 * - Missing documentation or scripts
 * - Potential organizational improvements
 * 
 * Usage: node scripts/validate-repository-structure.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🔍 Repository Structure Validation');
console.log('==================================');
console.log(`Analyzing: ${ROOT_DIR}`);
console.log('');

// File type patterns
const PATTERNS = {
  scripts: /\.(js|ts)$/,
  docs: /\.md$/,
  config: /\.(json|yml|yaml|toml)$/,
  docker: /(Dockerfile|docker-compose)/,
  git: /^\.git/,
  node: /node_modules/,
  build: /\.(next|dist|build)/
};

// Categories for organization
const CATEGORIES = {
  authentication: ['auth', 'jwt', 'permission', 'grant', 'role', 'security'],
  database: ['db', 'database', 'migration', 'seed', 'sql', 'prisma'],
  testing: ['test', 'spec', 'mock', 'debug'],
  deployment: ['deploy', 'docker', 'helm', 'k8s'],
  recipe: ['recipe', 'bom', 'ingredient'],
  mqtt: ['mqtt', 'broker', 'message'],
  enzyme: ['enzyme', 'dosing'],
  scheduling: ['schedule', 'queue', 'order'],
  analysis: ['analyze', 'audit', 'report', 'stats']
};

/**
 * Recursively scan directory for files
 */
function scanDirectory(dir, relativePath = '') {
  const results = {
    scripts: [],
    docs: [],
    configs: [],
    others: []
  };

  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const itemRelativePath = path.join(relativePath, item);
      
      // Skip certain directories
      if (PATTERNS.git.test(item) || 
          PATTERNS.node.test(item) || 
          PATTERNS.build.test(item) ||
          item.startsWith('.')) {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const subResults = scanDirectory(fullPath, itemRelativePath);
        results.scripts.push(...subResults.scripts);
        results.docs.push(...subResults.docs);
        results.configs.push(...subResults.configs);
        results.others.push(...subResults.others);
      } else {
        const fileInfo = {
          path: itemRelativePath,
          name: item,
          size: stat.size,
          category: categorizeFile(item, itemRelativePath)
        };
        
        if (PATTERNS.scripts.test(item)) {
          results.scripts.push(fileInfo);
        } else if (PATTERNS.docs.test(item)) {
          results.docs.push(fileInfo);
        } else if (PATTERNS.config.test(item) || PATTERNS.docker.test(item)) {
          results.configs.push(fileInfo);
        } else {
          results.others.push(fileInfo);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not scan ${dir}: ${error.message}`);
  }
  
  return results;
}

/**
 * Categorize a file based on its name and path
 */
function categorizeFile(filename, filepath) {
  const lowerName = filename.toLowerCase();
  const lowerPath = filepath.toLowerCase();
  const combined = `${lowerPath} ${lowerName}`;
  
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(keyword => combined.includes(keyword))) {
      return category;
    }
  }
  
  return 'uncategorized';
}

/**
 * Analyze and report findings
 */
function analyzeResults(results) {
  console.log('📊 ANALYSIS RESULTS');
  console.log('==================');
  
  // Scripts analysis
  console.log(`\n🔧 JavaScript/TypeScript Files (${results.scripts.length})`);
  console.log('-'.repeat(50));
  
  const scriptsByCategory = {};
  results.scripts.forEach(script => {
    if (!scriptsByCategory[script.category]) {
      scriptsByCategory[script.category] = [];
    }
    scriptsByCategory[script.category].push(script);
  });
  
  Object.entries(scriptsByCategory).forEach(([category, scripts]) => {
    console.log(`\n${category.toUpperCase()} (${scripts.length} files):`);
    scripts.forEach(script => {
      console.log(`  📄 ${script.path} (${(script.size / 1024).toFixed(1)}KB)`);
    });
  });
  
  // Documentation analysis
  console.log(`\n📚 Documentation Files (${results.docs.length})`);
  console.log('-'.repeat(50));
  
  const docsByCategory = {};
  results.docs.forEach(doc => {
    if (!docsByCategory[doc.category]) {
      docsByCategory[doc.category] = [];
    }
    docsByCategory[doc.category].push(doc);
  });
  
  Object.entries(docsByCategory).forEach(([category, docs]) => {
    console.log(`\n${category.toUpperCase()} (${docs.length} files):`);
    docs.forEach(doc => {
      console.log(`  📖 ${doc.path} (${(doc.size / 1024).toFixed(1)}KB)`);
    });
  });
  
  // Configuration files
  console.log(`\n⚙️ Configuration Files (${results.configs.length})`);
  console.log('-'.repeat(50));
  results.configs.forEach(config => {
    console.log(`  ⚙️ ${config.path} (${(config.size / 1024).toFixed(1)}KB)`);
  });
  
  return { scriptsByCategory, docsByCategory };
}

/**
 * Generate reorganization recommendations
 */
function generateRecommendations(scriptsByCategory, docsByCategory) {
  console.log('\n💡 REORGANIZATION RECOMMENDATIONS');
  console.log('=================================');
  
  // Scripts recommendations
  console.log('\n🔧 Scripts Organization:');
  Object.entries(scriptsByCategory).forEach(([category, scripts]) => {
    let targetDir = 'scripts/development/';
    
    switch (category) {
      case 'authentication':
        targetDir = 'scripts/testing/auth/';
        break;
      case 'database':
        targetDir = 'scripts/database/analysis/';
        break;
      case 'testing':
        targetDir = 'scripts/testing/';
        break;
      case 'deployment':
        targetDir = 'scripts/deployment/';
        break;
      case 'analysis':
        targetDir = 'scripts/analysis/';
        break;
    }
    
    console.log(`\n  ${category.toUpperCase()} → ${targetDir}`);
    scripts.forEach(script => {
      console.log(`    ${script.path} → ${targetDir}${script.name}`);
    });
  });
  
  // Documentation recommendations
  console.log('\n📚 Documentation Organization:');
  Object.entries(docsByCategory).forEach(([category, docs]) => {
    let targetDir = 'docs/development/';
    
    switch (category) {
      case 'authentication':
        targetDir = 'docs/features/authentication/';
        break;
      case 'database':
        targetDir = 'docs/operations/database-maintenance/';
        break;
      case 'recipe':
        targetDir = 'docs/features/recipe-management/';
        break;
      case 'mqtt':
        targetDir = 'docs/features/mqtt-integration/';
        break;
      case 'enzyme':
        targetDir = 'docs/features/enzyme-dosing/';
        break;
      case 'scheduling':
        targetDir = 'docs/features/scheduling/';
        break;
      case 'deployment':
        targetDir = 'docs/operations/deployment/';
        break;
      case 'analysis':
        targetDir = 'docs/operations/monitoring/';
        break;
    }
    
    console.log(`\n  ${category.toUpperCase()} → ${targetDir}`);
    docs.forEach(doc => {
      console.log(`    ${doc.path} → ${targetDir}${doc.name}`);
    });
  });
}

/**
 * Check for missing documentation
 */
function checkMissingDocumentation(scriptsByCategory) {
  console.log('\n❓ MISSING DOCUMENTATION CHECK');
  console.log('==============================');
  
  const expectedDocs = {
    'docs/development/setup-guide.md': 'Development environment setup',
    'docs/development/testing-guide.md': 'Testing procedures and best practices',
    'docs/architecture/database-schema.md': 'Database schema documentation',
    'docs/architecture/api-design.md': 'API design principles',
    'docs/features/authentication/permissions-system.md': 'Role-based access control',
    'docs/operations/deployment/deployment-guide.md': 'Deployment procedures'
  };
  
  Object.entries(expectedDocs).forEach(([docPath, description]) => {
    const fullPath = path.join(ROOT_DIR, docPath);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ❌ Missing: ${docPath} - ${description}`);
    } else {
      console.log(`  ✅ Exists: ${docPath}`);
    }
  });
}

/**
 * Main execution
 */
function main() {
  const results = scanDirectory(ROOT_DIR);
  const { scriptsByCategory, docsByCategory } = analyzeResults(results);
  
  generateRecommendations(scriptsByCategory, docsByCategory);
  checkMissingDocumentation(scriptsByCategory);
  
  console.log('\n🎯 NEXT STEPS');
  console.log('=============');
  console.log('1. Review the reorganization recommendations above');
  console.log('2. Run: node scripts/reorganize-repository.js --dry-run');
  console.log('3. If satisfied, run: node scripts/reorganize-repository.js');
  console.log('4. Create missing documentation files');
  console.log('5. Update team processes and CI/CD pipelines');
  
  console.log('\n📈 SUMMARY');
  console.log('==========');
  console.log(`Total scripts found: ${results.scripts.length}`);
  console.log(`Total documentation: ${results.docs.length}`);
  console.log(`Total config files: ${results.configs.length}`);
  console.log(`Categories identified: ${Object.keys(scriptsByCategory).length}`);
}

// Run the validation
main(); 