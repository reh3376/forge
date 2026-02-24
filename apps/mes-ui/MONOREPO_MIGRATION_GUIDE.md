# Monorepo Migration Guide

This guide outlines how to migrate your MES UI frontend into a monorepo structure with your backend.

## 🎯 Recommended Approach: Workspace-Based Monorepo

### 1. Create New Monorepo Repository

```bash
# Create new repository
mkdir whk-mes-monorepo
cd whk-mes-monorepo
git init

# Create workspace structure
mkdir -p apps/frontend
mkdir -p apps/backend
mkdir -p packages/shared
mkdir -p tools
```

### 2. Root Package.json Configuration

Create `package.json` in the root:

```json
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
    "dev:frontend": "npm run dev --workspace=apps/frontend",
    "dev:backend": "npm run dev --workspace=apps/backend",
    "build": "npm run build --workspaces",
    "build:frontend": "npm run build --workspace=apps/frontend",
    "build:backend": "npm run build --workspace=apps/backend",
    "test": "npm run test --workspaces",
    "lint": "npm run lint --workspaces",
    "clean": "npm run clean --workspaces && rm -rf node_modules",
    "install:all": "npm install",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down"
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
```

### 3. Migration Steps

#### Step 1: Move Frontend Code

```bash
# Copy your current mes-ui content to apps/frontend
cp -r /path/to/current/mes-ui/* apps/frontend/
cd apps/frontend

# Update package.json name
# Change "name": "mes-ui" to "name": "@whk/frontend"
```

#### Step 2: Update Frontend Package.json

```json
{
  "name": "@whk/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p ${PORT:-4000}",
    "build": "next build",
    "start": "next start -p ${PORT:-4000}",
    "lint": "next lint",
    "test": "jest",
    "test:e2e": "playwright test",
    "clean": "rm -rf .next node_modules"
  },
  "dependencies": {
    // ... your existing dependencies
  },
  "devDependencies": {
    // ... your existing devDependencies
  }
}
```

#### Step 3: Move Backend Code

```bash
# Copy your backend code to apps/backend
cp -r /path/to/backend/* apps/backend/
cd apps/backend

# Update backend package.json name to "@whk/backend"
```

#### Step 4: Create Shared Packages

```bash
# Create shared types package
mkdir -p packages/shared-types
cd packages/shared-types

# Create package.json for shared types
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
```

### 4. Root Configuration Files

#### Docker Compose for Monorepo

Create `docker-compose.yml` in root:

```yaml
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
```

#### Root TypeScript Configuration

Create `tsconfig.json` in root:

```json
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
    { "path": "./apps/backend" },
    { "path": "./packages/shared-types" }
  ]
}
```

#### ESLint Configuration

Create `.eslintrc.js` in root:

```javascript
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
```

### 5. GitHub Repository Setup

#### Option A: Create New Repository

```bash
# Create new repository on GitHub: whk-mes-monorepo
git remote add origin https://github.com/your-org/whk-mes-monorepo.git

# Initial commit
git add .
git commit -m "feat: initial monorepo setup with frontend and backend"
git push -u origin main
```

#### Option B: Migrate Existing Repository

```bash
# In your current mes-ui repository
git checkout -b monorepo-migration

# Create new structure
mkdir -p apps/frontend
git mv * apps/frontend/ 2>/dev/null || true
git mv .* apps/frontend/ 2>/dev/null || true

# Move back essential root files
git mv apps/frontend/.git* . 2>/dev/null || true
git mv apps/frontend/package-lock.json . 2>/dev/null || true

# Create root package.json and other configs
# ... (add the files above)

git add .
git commit -m "feat: migrate to monorepo structure"
git push origin monorepo-migration
```

### 6. Development Workflow

#### Local Development

```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend
npm run dev

# Or start individually
npm run dev:frontend
npm run dev:backend

# Build everything
npm run build

# Run tests
npm run test
```

#### Docker Development

```bash
# Build and start all services
npm run docker:up

# Stop all services
npm run docker:down
```

### 7. CI/CD Configuration

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test
      
      - name: Run linting
        run: npm run lint
      
      - name: Build frontend
        run: npm run build:frontend
      
      - name: Build backend
        run: npm run build:backend

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Build and push Docker images
        run: |
          docker build -t whk-mes-frontend ./apps/frontend
          docker build -t whk-mes-backend ./apps/backend
          # Add your deployment steps here
```

### 8. Update Frontend Configuration

Update `apps/frontend/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Update API proxy for monorepo structure
  async rewrites() {
    return [
      {
        source: '/api/graphql-proxy',
        destination: process.env.NODE_ENV === 'development' 
          ? 'http://localhost:3000/graphql'
          : 'http://backend:3000/graphql',
      },
    ];
  },
  
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
```

### 9. Benefits of This Approach

- **Unified Development**: Single repository for related code
- **Shared Dependencies**: Common packages and configurations
- **Atomic Commits**: Frontend and backend changes in single commits
- **Simplified CI/CD**: Single pipeline for entire application
- **Better Collaboration**: Easier code reviews across full stack
- **Shared Types**: Type safety between frontend and backend

### 10. Migration Checklist

- [ ] Create monorepo structure
- [ ] Move frontend code to `apps/frontend`
- [ ] Move backend code to `apps/backend`
- [ ] Create shared packages in `packages/`
- [ ] Update package.json files
- [ ] Configure root-level scripts
- [ ] Update Docker configurations
- [ ] Set up CI/CD pipeline
- [ ] Update documentation
- [ ] Test local development workflow
- [ ] Test Docker workflow
- [ ] Update deployment scripts

## Alternative: Git Subtrees (If Keeping Separate Repos)

If you prefer to keep separate repositories but want to combine them:

```bash
# In your main monorepo
git subtree add --prefix=apps/frontend https://github.com/your-org/mes-ui.git main --squash
git subtree add --prefix=apps/backend https://github.com/your-org/mes-backend.git main --squash

# To pull updates
git subtree pull --prefix=apps/frontend https://github.com/your-org/mes-ui.git main --squash
```

This approach maintains separate repositories while allowing monorepo development. 