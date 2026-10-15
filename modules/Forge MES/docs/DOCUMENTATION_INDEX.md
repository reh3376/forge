# WhiskeyHouse MES - Documentation Index

This document provides a comprehensive index of all documentation and scripts in the WhiskeyHouse MES repository after reorganization.

## 📁 Repository Structure Overview

```
whk-recipe-configuration/
├── 📚 docs/                    # All documentation
├── 🔧 scripts/                 # Utility scripts
├── 🛠️ tools/                   # Development tools
└── 📱 apps/                    # Application code
```

## 📚 Documentation (`docs/`)

### 🏗️ Architecture (`docs/architecture/`)
- **database-schema.md** - Database schema documentation
- **api-design.md** - API design principles and patterns
- **security-model.md** - Security architecture and authentication flow

### ⚡ Features (`docs/features/`)

#### 🔐 Authentication (`docs/features/authentication/`)
- **jwt-implementation.md** - JWT authentication implementation guide
- **permissions-system.md** - Role-based access control system
- **optimized-grants-implementation.md** - Optimized grants system implementation
- **implementation-summary.md** - Authentication implementation summary
- **grants-analysis-summary.md** - Grants system analysis results
- **grants-migration-guide.md** - Migration guide for grants system

#### 🧪 Recipe Management (`docs/features/recipe-management/`)
- **search-implementation.md** - Recipe search functionality implementation
- **bom-calculator.md** - Bill of Materials calculator service
- **bom-duplicate-check.md** - BOM duplicate detection system

#### 🧬 Enzyme Dosing (`docs/features/enzyme-dosing/`)
- **frontend-requirements.md** - Frontend requirements for enzyme dosing system

#### 📡 MQTT Integration (`docs/features/mqtt-integration/`)
- **uns-mqtt-specification.md** - UNS MQTT specification and requirements
- **message-acknowledgment.md** - MQTT message acknowledgment patterns
- **fixes-summary.md** - MQTT integration fixes and improvements

#### 📅 Scheduling (`docs/features/scheduling/`)
- **queue-management.md** - Production scheduling and queue management

### 🔧 Operations (`docs/operations/`)

#### 🗄️ Database Maintenance (`docs/operations/database-maintenance/`)
- **bad-data-analysis.md** - Analysis of data quality issues
- **fix-instructions.md** - Database fix procedures and scripts
- **health-endpoints.md** - Database health monitoring endpoints

#### 🚀 Deployment (`docs/operations/deployment/`)
- **pull-request-template.md** - Pull request template and guidelines

#### 📊 Monitoring (`docs/operations/monitoring/`)
- **audit-results.md** - Security and compliance audit results

### 👨‍💻 Development (`docs/development/`)
- **setup-guide.md** - Development environment setup
- **testing-guide.md** - Testing procedures and best practices
- **contribution-guide.md** - Contribution guidelines and standards

### 🔌 API (`docs/api/`)
- **graphql-schema.md** - GraphQL schema documentation
- **rest-endpoints.md** - REST API endpoint documentation

## 🔧 Scripts (`scripts/`)

### 🗄️ Database (`scripts/database/`)

#### 📊 Analysis (`scripts/database/analysis/`)
- **analyze-grants.js** - Analyze grants system for optimization opportunities
- **verify-grants-system.js** - Verify grants system integrity
- **generate-optimized-grants.js** - Generate optimized grants configuration
- **verify-optimization.js** - Verify grants optimization results
- **verify-fixed-optimization.js** - Verify fixed optimization implementation

#### 🔄 Migration (`scripts/database/migration/`)
- **migrate-to-optimized-grants.js** - Migrate to optimized grants system
- **rollback-grants-system.js** - Rollback grants system changes
- **fix-optimization.js** - Fix grants optimization issues

#### 🌱 Seeding (`scripts/database/seeding/`)
- **seed-development.ts** - Development environment data seeding
- **seed-production.ts** - Production environment data seeding
- **custom-seed.ts** - Custom seeding scripts

#### 🧹 Maintenance (`scripts/database/maintenance/`)
- **check-data-integrity.js** - Data integrity checking utilities
- **cleanup-orphaned-records.js** - Clean up orphaned database records

### 🧪 Testing (`scripts/testing/`)

#### 🔐 Authentication (`scripts/testing/auth/`)
- **test-jwt-auth.js** - JWT authentication testing script
- **debug-permissions.js** - Debug permissions and roles
- **test-permissions-simple.js** - Simple permissions testing
- **test-roles-complete.js** - Comprehensive role testing
- **test-all-roles.js** - Test all roles functionality

#### 🔌 API (`scripts/testing/api/`)
- **test-graphql.js** - GraphQL API testing utilities
- **test-rest-endpoints.js** - REST API endpoint testing

#### 🔗 Integration (`scripts/testing/integration/`)
- **test-full-workflow.js** - End-to-end workflow testing

### 👨‍💻 Development (`scripts/development/`)
- **generate-types.js** - TypeScript type generation
- **validate-schema.js** - Schema validation utilities
- **setup-dev-env.js** - Development environment setup

### 🚀 Deployment (`scripts/deployment/`)
- **deploy.sh** - Deployment script
- **health-check.js** - Health check utilities
- **rollback.sh** - Rollback deployment script

### 📊 Analysis (`scripts/analysis/`)
- **performance-analysis.js** - Performance analysis utilities
- **security-audit.js** - Security audit scripts
- **code-quality-check.js** - Code quality analysis

## 🛠️ Tools (`tools/`)

### 📋 Task Management (`tools/task-management/`)
- **prd.txt** - Product Requirements Document
- **task-complexity-report.json** - Task complexity analysis report
- **example-prd.txt** - Example PRD template

### 🎨 Linting (`tools/linting/`)
- **.eslintrc.js** - ESLint configuration
- **.prettierrc.json** - Prettier configuration

### 🐳 Docker (`tools/docker/`)
- **Dockerfile** - Container configuration
- **docker-compose.yml** - Multi-container setup

## 🚀 Quick Start Guide

### For New Developers
1. Read `docs/development/setup-guide.md`
2. Review `docs/architecture/` for system understanding
3. Check `docs/features/` for specific feature documentation

### For Operations
1. Review `docs/operations/` for maintenance procedures
2. Use `scripts/database/analysis/` for system analysis
3. Follow `docs/operations/database-maintenance/` for data issues

### For Testing
1. Use scripts in `scripts/testing/` for various testing scenarios
2. Follow `docs/development/testing-guide.md` for best practices
3. Check `scripts/testing/auth/` for authentication testing

### For Deployment
1. Use `scripts/deployment/deploy.sh` for deployments
2. Follow `docs/operations/deployment/` guidelines
3. Monitor using `scripts/deployment/health-check.js`

## 📝 File Naming Conventions

- **Documentation**: `kebab-case.md`
- **Scripts**: `kebab-case.js` or `kebab-case.ts`
- **Directories**: `kebab-case`
- **README files**: `README.md` in each directory

## 🔍 Finding What You Need

### By Feature
- Authentication: `docs/features/authentication/` + `scripts/testing/auth/`
- Recipe Management: `docs/features/recipe-management/`
- Database: `docs/operations/database-maintenance/` + `scripts/database/`
- MQTT: `docs/features/mqtt-integration/`

### By Task Type
- **Analysis**: `scripts/database/analysis/` + `scripts/analysis/`
- **Testing**: `scripts/testing/` + `docs/development/testing-guide.md`
- **Deployment**: `scripts/deployment/` + `docs/operations/deployment/`
- **Maintenance**: `scripts/database/maintenance/` + `docs/operations/`

### By Role
- **Developer**: `docs/development/` + `scripts/development/`
- **DevOps**: `docs/operations/` + `scripts/deployment/`
- **DBA**: `docs/operations/database-maintenance/` + `scripts/database/`
- **QA**: `scripts/testing/` + `docs/development/testing-guide.md`

## 🔄 Migration Status

This index reflects the proposed reorganized structure. To implement:

1. Run `node scripts/reorganize-repository.js --dry-run` to preview changes
2. Run `node scripts/reorganize-repository.js` to execute reorganization
3. Update team processes and documentation
4. Update CI/CD pipelines to reference new locations

## 📞 Support

For questions about this documentation structure or specific files:
1. Check the relevant README.md in each directory
2. Review the specific documentation for your use case
3. Consult the team lead for architecture decisions 