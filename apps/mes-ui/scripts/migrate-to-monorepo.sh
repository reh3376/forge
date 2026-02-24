#!/bin/bash

# Monorepo Migration Script for WHK MES
# This script helps migrate the current frontend to a monorepo structure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MONOREPO_NAME="whk-mes-monorepo"
FRONTEND_NAME="@whk/frontend"
BACKEND_NAME="@whk/backend"
SHARED_TYPES_NAME="@whk/shared-types"

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  WHK MES Monorepo Migration${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a git repository. Please run this script from your mes-ui repository root."
        exit 1
    fi
    
    # Check if we have uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        print_warning "You have uncommitted changes. Please commit or stash them before proceeding."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check if Node.js and npm are installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ before proceeding."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm before proceeding."
        exit 1
    fi
    
    print_info "Prerequisites check passed!"
}

create_monorepo_structure() {
    print_step "Creating monorepo structure..."
    
    # Get the parent directory
    CURRENT_DIR=$(pwd)
    PARENT_DIR=$(dirname "$CURRENT_DIR")
    MONOREPO_DIR="$PARENT_DIR/$MONOREPO_NAME"
    
    # Create monorepo directory
    if [ -d "$MONOREPO_DIR" ]; then
        print_warning "Monorepo directory already exists: $MONOREPO_DIR"
        read -p "Remove existing directory and continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$MONOREPO_DIR"
        else
            exit 1
        fi
    fi
    
    mkdir -p "$MONOREPO_DIR"
    cd "$MONOREPO_DIR"
    
    # Initialize git
    git init
    
    # Create directory structure
    mkdir -p apps/frontend
    mkdir -p apps/backend
    mkdir -p packages/shared-types
    mkdir -p tools
    mkdir -p docs
    
    print_info "Monorepo structure created at: $MONOREPO_DIR"
}

copy_frontend_code() {
    print_step "Copying frontend code..."
    
    # Copy all files from current directory to apps/frontend
    cp -r "$CURRENT_DIR"/* "$MONOREPO_DIR/apps/frontend/" 2>/dev/null || true
    cp -r "$CURRENT_DIR"/.[^.]* "$MONOREPO_DIR/apps/frontend/" 2>/dev/null || true
    
    # Remove git directory from frontend
    rm -rf "$MONOREPO_DIR/apps/frontend/.git"
    
    print_info "Frontend code copied to apps/frontend"
}

create_root_package_json() {
    print_step "Creating root package.json..."
    
    cat > "$MONOREPO_DIR/package.json" << 'EOF'
{
  "name": "whk-mes-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces",
    "dev:frontend": "npm run dev --workspace=@whk/frontend",
    "dev:backend": "npm run dev --workspace=@whk/backend",
    "build": "npm run build --workspaces",
    "build:frontend": "npm run build --workspace=@whk/frontend",
    "build:backend": "npm run build --workspace=@whk/backend",
    "test": "npm run test --workspaces",
    "test:frontend": "npm run test --workspace=@whk/frontend",
    "test:backend": "npm run test --workspace=@whk/backend",
    "lint": "npm run lint --workspaces",
    "clean": "npm run clean --workspaces && rm -rf node_modules",
    "install:all": "npm install",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "migrate:frontend": "./scripts/migrate-to-monorepo.sh"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "husky": "^8.0.0",
    "lint-staged": "^13.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
EOF
    
    print_info "Root package.json created"
}

update_frontend_package_json() {
    print_step "Updating frontend package.json..."
    
    # Update the name in frontend package.json
    cd "$MONOREPO_DIR/apps/frontend"
    
    # Use node to update package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.name = '@whk/frontend';
        pkg.scripts.clean = 'rm -rf .next node_modules';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    "
    
    print_info "Frontend package.json updated"
}

create_shared_types_package() {
    print_step "Creating shared types package..."
    
    cd "$MONOREPO_DIR/packages/shared-types"
    
    cat > package.json << 'EOF'
{
  "name": "@whk/shared-types",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF
    
    # Create basic TypeScript config
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
    
    # Create src directory and basic types
    mkdir -p src
    cat > src/index.ts << 'EOF'
// Shared types for WHK MES
export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  // Add more shared types as needed
}

// Re-export all types
export * from './user';
export * from './recipe';
EOF
    
    cat > src/user.ts << 'EOF'
export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  id: string;
  name: string;
  permissions: string[];
}
EOF
    
    cat > src/recipe.ts << 'EOF'
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeParameter {
  id: string;
  name: string;
  value: string | number | boolean;
  type: 'string' | 'number' | 'boolean';
}
EOF
    
    print_info "Shared types package created"
}

create_root_configs() {
    print_step "Creating root configuration files..."
    
    cd "$MONOREPO_DIR"
    
    # Root TypeScript config
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@whk/shared-types": ["packages/shared-types/src"],
      "@whk/frontend/*": ["apps/frontend/*"],
      "@whk/backend/*": ["apps/backend/*"]
    }
  },
  "references": [
    { "path": "./apps/frontend" },
    { "path": "./packages/shared-types" }
  ]
}
EOF
    
    # ESLint config
    cat > .eslintrc.js << 'EOF'
module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  env: {
    node: true,
    es2020: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['apps/frontend/**/*'],
      extends: ['next/core-web-vitals'],
    },
    {
      files: ['apps/backend/**/*'],
      extends: ['@typescript-eslint/recommended'],
    },
  ],
}
EOF
    
    # Prettier config
    cat > .prettierrc << 'EOF'
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
EOF
    
    # Docker compose
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  frontend:
    build:
      context: ./apps/frontend
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3000/api
      - NEXT_PUBLIC_GRAPHQL_URL=http://backend:3000/graphql
    depends_on:
      - backend
    networks:
      - whk-network

  backend:
    build:
      context: ./apps/backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/whk_mes
    depends_on:
      - db
    networks:
      - whk-network

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=whk_mes
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - whk-network

volumes:
  postgres_data:

networks:
  whk-network:
    driver: bridge
EOF
    
    # Gitignore
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.*

# Production builds
.next/
out/
dist/
build/

# Environment variables
.env*
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Docker
.dockerignore

# Testing
test-results/
playwright-report/
EOF
    
    print_info "Root configuration files created"
}

create_github_workflow() {
    print_step "Creating GitHub Actions workflow..."
    
    mkdir -p "$MONOREPO_DIR/.github/workflows"
    
    cat > "$MONOREPO_DIR/.github/workflows/ci.yml" << 'EOF'
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Run tests
        run: npm run test
      
      - name: Build shared types
        run: npm run build --workspace=@whk/shared-types
      
      - name: Build frontend
        run: npm run build:frontend
        env:
          NEXT_PUBLIC_API_URL: http://localhost:3000/api
          NEXT_PUBLIC_GRAPHQL_URL: http://localhost:3000/graphql

  docker-build:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Build frontend Docker image
        run: docker build -t whk-mes-frontend ./apps/frontend
      
      # Add backend build when ready
      # - name: Build backend Docker image
      #   run: docker build -t whk-mes-backend ./apps/backend
EOF
    
    print_info "GitHub Actions workflow created"
}

create_documentation() {
    print_step "Creating documentation..."
    
    cd "$MONOREPO_DIR"
    
    cat > README.md << 'EOF'
# WHK MES Monorepo

This monorepo contains the Whiskey House Manufacturing Execution System (MES) frontend and backend applications.

## 🏗 Project Structure

```
whk-mes-monorepo/
├── apps/
│   ├── frontend/          # Next.js frontend application
│   └── backend/           # Backend API (to be added)
├── packages/
│   └── shared-types/      # Shared TypeScript types
├── tools/                 # Build tools and utilities
├── docs/                  # Documentation
└── scripts/               # Utility scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm 9+
- Docker (optional)

### Installation

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev

# Or start individually
npm run dev:frontend
npm run dev:backend
```

### Docker Development

```bash
# Build and start all services
npm run docker:up

# Stop all services
npm run docker:down
```

## 📦 Workspaces

### Frontend (`@whk/frontend`)
- **Technology**: Next.js 15, React 19, TypeScript
- **Port**: 4000
- **Location**: `apps/frontend/`

### Backend (`@whk/backend`)
- **Technology**: TBD
- **Port**: 3000
- **Location**: `apps/backend/`

### Shared Types (`@whk/shared-types`)
- **Purpose**: Shared TypeScript definitions
- **Location**: `packages/shared-types/`

## 🛠 Available Scripts

- `npm run dev` - Start all development servers
- `npm run build` - Build all applications
- `npm run test` - Run all tests
- `npm run lint` - Lint all code
- `npm run clean` - Clean all build artifacts

## 🔧 Development Workflow

1. **Install dependencies**: `npm run install:all`
2. **Start development**: `npm run dev:frontend`
3. **Make changes** in the appropriate workspace
4. **Test changes**: `npm run test`
5. **Build for production**: `npm run build`

## 📚 Documentation

- [Frontend Documentation](./apps/frontend/README.md)
- [Backend Documentation](./apps/backend/README.md) (coming soon)
- [Shared Types](./packages/shared-types/README.md)
- [Migration Guide](./MONOREPO_MIGRATION_GUIDE.md)

## 🚢 Deployment

### Docker

```bash
# Build and deploy with Docker Compose
docker-compose up -d --build
```

### Manual Deployment

```bash
# Build all applications
npm run build

# Deploy frontend
cd apps/frontend && npm run start

# Deploy backend (when ready)
cd apps/backend && npm run start
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm run test`
4. Run linting: `npm run lint`
5. Create a pull request

## 📄 License

Private - Whiskey House Manufacturing
EOF
    
    # Create workspace-specific READMEs
    cat > "$MONOREPO_DIR/packages/shared-types/README.md" << 'EOF'
# Shared Types (@whk/shared-types)

This package contains shared TypeScript type definitions used across the WHK MES frontend and backend applications.

## Usage

```typescript
import { User, Recipe } from '@whk/shared-types'

const user: User = {
  id: '1',
  email: 'user@example.com',
  name: 'John Doe',
  roles: ['operator'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```

## Development

```bash
# Build types
npm run build

# Watch for changes
npm run dev

# Clean build artifacts
npm run clean
```

## Adding New Types

1. Create a new file in `src/` (e.g., `src/equipment.ts`)
2. Export your types
3. Add the export to `src/index.ts`
4. Run `npm run build` to compile
EOF
    
    print_info "Documentation created"
}

finalize_setup() {
    print_step "Finalizing setup..."
    
    cd "$MONOREPO_DIR"
    
    # Copy this migration script to the new repo
    mkdir -p scripts
    cp "$CURRENT_DIR/scripts/migrate-to-monorepo.sh" scripts/ 2>/dev/null || true
    
    # Initial git commit
    git add .
    git commit -m "feat: initial monorepo setup with frontend migration

- Migrated frontend from mes-ui repository
- Created shared-types package for type safety
- Set up workspace-based monorepo structure
- Added Docker configuration
- Created GitHub Actions CI/CD pipeline
- Added comprehensive documentation"
    
    print_info "Initial git commit created"
}

print_success() {
    echo ""
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Migration Complete! 🎉${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "${BLUE}Your monorepo has been created at:${NC}"
    echo -e "${YELLOW}$MONOREPO_DIR${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. cd $MONOREPO_DIR"
    echo "2. npm run install:all"
    echo "3. npm run dev:frontend"
    echo "4. Add your backend code to apps/backend/"
    echo "5. Create a new GitHub repository and push:"
    echo "   git remote add origin https://github.com/your-org/whk-mes-monorepo.git"
    echo "   git push -u origin main"
    echo ""
    echo -e "${BLUE}Available commands:${NC}"
    echo "- npm run dev:frontend    # Start frontend development"
    echo "- npm run build:frontend  # Build frontend for production"
    echo "- npm run test:frontend   # Run frontend tests"
    echo "- npm run docker:up       # Start with Docker"
    echo ""
    echo -e "${YELLOW}Don't forget to update your environment variables!${NC}"
}

# Main execution
main() {
    print_header
    
    check_prerequisites
    create_monorepo_structure
    copy_frontend_code
    create_root_package_json
    update_frontend_package_json
    create_shared_types_package
    create_root_configs
    create_github_workflow
    create_documentation
    finalize_setup
    
    print_success
}

# Run the script
main "$@" 