#!/usr/bin/env node

/**
 * Repository Reorganization Script
 * 
 * This script reorganizes the WhiskeyHouse MES repository structure
 * by moving JavaScript scripts and Markdown documentation into a
 * more logical and maintainable structure.
 * 
 * Usage: node scripts/reorganize-repository.js [--dry-run] [--force]
 * 
 * Options:
 *   --dry-run: Show what would be moved without actually moving files
 *   --force: Overwrite existing files if they exist
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🔄 Repository Reorganization Script');
console.log('===================================');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
console.log(`Force: ${FORCE ? 'YES' : 'NO'}`);
console.log(`Root: ${ROOT_DIR}`);
console.log('');

// Define the new directory structure
const NEW_STRUCTURE = {
  'docs': {
    'architecture': [],
    'features': {
      'authentication': [],
      'recipe-management': [],
      'enzyme-dosing': [],
      'mqtt-integration': [],
      'scheduling': []
    },
    'operations': {
      'database-maintenance': [],
      'deployment': [],
      'monitoring': []
    },
    'development': [],
    'api': []
  },
  'scripts': {
    'database': {
      'analysis': [],
      'migration': [],
      'seeding': [],
      'maintenance': []
    },
    'testing': {
      'auth': [],
      'api': [],
      'integration': []
    },
    'development': [],
    'deployment': [],
    'analysis': []
  },
  'tools': {
    'task-management': [],
    'linting': [],
    'docker': []
  }
};

// Define file mappings (source -> destination)
const FILE_MAPPINGS = {
  // Documentation files
  'database-fix-instructions.md': 'docs/operations/database-maintenance/fix-instructions.md',
  'bad-data-analysis.md': 'docs/operations/database-maintenance/bad-data-analysis.md',
  'HEALTH_ENDPOINTS.md': 'docs/operations/database-maintenance/health-endpoints.md',
  'MQTT_FIXES_SUMMARY.md': 'docs/features/mqtt-integration/fixes-summary.md',
  'README_BOM_Duplicate_Check.md': 'docs/features/recipe-management/bom-duplicate-check.md',
  'scripts/enzyme-dosing-frontend-requirements.md': 'docs/features/enzyme-dosing/frontend-requirements.md',
  'scripts/uns-mqtt-prd.txt': 'docs/features/mqtt-integration/uns-mqtt-specification.md',
  'docs/bom-calculator-service.md': 'docs/features/recipe-management/bom-calculator.md',
  'docs/message-acknowledgment.md': 'docs/features/mqtt-integration/message-acknowledgment.md',
  'docs/pull_request_template.md': 'docs/operations/deployment/pull-request-template.md',
  
  // Task management files
  'scripts/prd.txt': 'tools/task-management/prd.txt',
  'scripts/task-complexity-report.json': 'tools/task-management/task-complexity-report.json',
  'scripts/example_prd.txt': 'tools/task-management/example-prd.txt',
  
  // Root level scripts
  'recipe-search-implementation.ts': 'docs/features/recipe-management/search-implementation.md',
  
  // Permission/grants analysis scripts
  'backend/analyze-grants.js': 'scripts/database/analysis/analyze-grants.js',
  'backend/debug-permissions.js': 'scripts/testing/auth/debug-permissions.js',
  'backend/test-permissions-simple.js': 'scripts/testing/auth/test-permissions-simple.js',
  'backend/test-roles-complete.js': 'scripts/testing/auth/test-roles-complete.js',
  'backend/test-all-roles.js': 'scripts/testing/auth/test-all-roles.js',
  'backend/migrate-to-optimized-grants.js': 'scripts/database/migration/migrate-to-optimized-grants.js',
  'backend/verify-grants-system.js': 'scripts/database/analysis/verify-grants-system.js',
  'backend/rollback-grants-system.js': 'scripts/database/migration/rollback-grants-system.js',
  'backend/fix-optimization.js': 'scripts/database/migration/fix-optimization.js',
  'backend/generate-optimized-grants.js': 'scripts/database/analysis/generate-optimized-grants.js',
  'backend/verify-fixed-optimization.js': 'scripts/database/analysis/verify-fixed-optimization.js',
  'backend/verify-optimization.js': 'scripts/database/analysis/verify-optimization.js',
  
  // Documentation from apps
  'backend/OPTIMIZED_GRANTS_IMPLEMENTATION.md': 'docs/features/authentication/optimized-grants-implementation.md',
  'backend/IMPLEMENTATION_SUMMARY.md': 'docs/features/authentication/implementation-summary.md',
  'backend/GRANTS_ANALYSIS_SUMMARY.md': 'docs/features/authentication/grants-analysis-summary.md',
  'backend/GRANTS_MIGRATION_GUIDE.md': 'docs/features/authentication/grants-migration-guide.md',
  'backend/AUDIT_RESULTS.md': 'docs/operations/monitoring/audit-results.md',
  
  // JWT auth test script
  'frontend/scripts/test-jwt-auth.js': 'scripts/testing/auth/test-jwt-auth.js',
  
  // Deployment scripts
  'backend/deploy.sh': 'scripts/deployment/deploy.sh'
};

/**
 * Create directory structure
 */
function createDirectoryStructure(structure, basePath = '') {
  const currentPath = path.join(ROOT_DIR, basePath);
  
  if (!DRY_RUN) {
    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath, { recursive: true });
      console.log(`📁 Created directory: ${basePath || '.'}`);
    }
  } else {
    console.log(`📁 Would create directory: ${basePath || '.'}`);
  }
  
  for (const [key, value] of Object.entries(structure)) {
    const newPath = path.join(basePath, key);
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      createDirectoryStructure(value, newPath);
    } else {
      const fullPath = path.join(ROOT_DIR, newPath);
      if (!DRY_RUN) {
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          console.log(`📁 Created directory: ${newPath}`);
        }
      } else {
        console.log(`📁 Would create directory: ${newPath}`);
      }
    }
  }
}

/**
 * Move a file from source to destination
 */
function moveFile(source, destination) {
  const sourcePath = path.join(ROOT_DIR, source);
  const destPath = path.join(ROOT_DIR, destination);
  const destDir = path.dirname(destPath);
  
  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠️  Source file not found: ${source}`);
    return false;
  }
  
  // Check if destination already exists
  if (fs.existsSync(destPath) && !FORCE) {
    console.log(`⚠️  Destination exists (use --force to overwrite): ${destination}`);
    return false;
  }
  
  if (!DRY_RUN) {
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Move the file
    fs.renameSync(sourcePath, destPath);
    console.log(`✅ Moved: ${source} → ${destination}`);
  } else {
    console.log(`📋 Would move: ${source} → ${destination}`);
  }
  
  return true;
}

/**
 * Create README files for each directory
 */
function createReadmeFiles() {
  const readmeContent = {
    'docs/README.md': `# Documentation

This directory contains all project documentation organized by category:

- **architecture/**: System architecture and design documents
- **features/**: Feature-specific documentation and implementation guides
- **operations/**: Operational procedures, maintenance, and monitoring
- **development/**: Development guides and setup instructions
- **api/**: API documentation and schemas

## Navigation

Each subdirectory contains its own README with specific guidance for that area.
`,
    'docs/features/README.md': `# Feature Documentation

This directory contains documentation for specific features:

- **authentication/**: JWT, permissions, and security implementation
- **recipe-management/**: Recipe search, BOM calculator, and related features
- **enzyme-dosing/**: Enzyme dosing system requirements and implementation
- **mqtt-integration/**: MQTT broker integration and messaging
- **scheduling/**: Production scheduling and queue management
`,
    'scripts/README.md': `# Utility Scripts

This directory contains utility scripts organized by purpose:

- **database/**: Database analysis, migration, seeding, and maintenance
- **testing/**: Authentication, API, and integration testing utilities
- **development/**: Development utilities and code generation
- **deployment/**: Deployment and infrastructure scripts
- **analysis/**: Performance, security, and code quality analysis

## Usage

Most scripts include usage instructions in their headers. Run with \`--help\` for options.
`,
    'scripts/database/README.md': `# Database Scripts

Database-related utility scripts:

- **analysis/**: Scripts for analyzing grants, permissions, and data quality
- **migration/**: Database migration and schema update scripts
- **seeding/**: Development and production data seeding scripts
- **maintenance/**: Data cleanup and integrity checking scripts

## Safety

Always backup your database before running migration or maintenance scripts.
`,
    'tools/README.md': `# Development Tools

Development tools and configurations:

- **task-management/**: Task Master PRDs and complexity reports
- **linting/**: Code quality and formatting configurations
- **docker/**: Container configurations and deployment files
`
  };
  
  for (const [filePath, content] of Object.entries(readmeContent)) {
    const fullPath = path.join(ROOT_DIR, filePath);
    const dir = path.dirname(fullPath);
    
    if (!DRY_RUN) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      if (!fs.existsSync(fullPath) || FORCE) {
        fs.writeFileSync(fullPath, content);
        console.log(`📝 Created README: ${filePath}`);
      }
    } else {
      console.log(`📝 Would create README: ${filePath}`);
    }
  }
}

/**
 * Update package.json scripts to reference new locations
 */
function updatePackageJsonScripts() {
  const packageJsonPaths = [
    'package.json',
    'frontend/package.json',
    'backend/package.json'
  ];
  
  packageJsonPaths.forEach(pkgPath => {
    const fullPath = path.join(ROOT_DIR, pkgPath);
    
    if (fs.existsSync(fullPath)) {
      if (!DRY_RUN) {
        const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        
        // Update script paths (this would need to be customized based on actual scripts)
        if (pkg.scripts) {
          // Example updates - customize based on your actual package.json scripts
          Object.keys(pkg.scripts).forEach(scriptName => {
            let script = pkg.scripts[scriptName];
            
            // Update common path patterns
            script = script.replace(/scripts\/([^\/]+)\.js/g, 'scripts/development/$1.js');
            script = script.replace(/apps\/whk-recipe-configuration\/([^\/]+)\.js/g, 'scripts/database/analysis/$1.js');
            
            pkg.scripts[scriptName] = script;
          });
          
          fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2));
          console.log(`📦 Updated package.json: ${pkgPath}`);
        }
      } else {
        console.log(`📦 Would update package.json: ${pkgPath}`);
      }
    }
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Phase 1: Creating directory structure...');
    createDirectoryStructure(NEW_STRUCTURE);
    
    console.log('\nPhase 2: Creating README files...');
    createReadmeFiles();
    
    console.log('\nPhase 3: Moving files...');
    let movedCount = 0;
    let skippedCount = 0;
    
    for (const [source, destination] of Object.entries(FILE_MAPPINGS)) {
      if (moveFile(source, destination)) {
        movedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log('\nPhase 4: Updating package.json scripts...');
    updatePackageJsonScripts();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`Files moved: ${movedCount}`);
    console.log(`Files skipped: ${skippedCount}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN - No changes made' : 'EXECUTED - Changes applied'}`);
    
    if (DRY_RUN) {
      console.log('\n💡 To execute the reorganization, run:');
      console.log('   node scripts/reorganize-repository.js');
      console.log('\n💡 To force overwrite existing files, run:');
      console.log('   node scripts/reorganize-repository.js --force');
    } else {
      console.log('\n✅ Repository reorganization completed!');
      console.log('\n📋 Next steps:');
      console.log('1. Review the moved files and update any broken internal links');
      console.log('2. Update CI/CD pipelines to reference new script locations');
      console.log('3. Update team documentation about the new structure');
      console.log('4. Test that all scripts still work from their new locations');
    }
    
  } catch (error) {
    console.error('❌ Error during reorganization:', error.message);
    process.exit(1);
  }
}

// Run the script
main(); 