# WHK Recipe Configuration Monorepo

This repository is structured as a monorepo using npm workspaces, containing both frontend and backend applications for the WHK Recipe Configuration system.

## Repository Structure

```
whk-recipe-configuration/
├── apps/
│   ├── whk-recipe-configuration/  # Backend (NestJS)
│   ├── mes-ui/                    # Frontend (Next.js)
│   └── shared/                    # Shared code (types, utils, constants)
├── docs/                          # Documentation
├── scripts/                       # Utility scripts
└── tools/                         # Development tools
```

## Workspaces

This monorepo contains the following workspaces:

1. **Backend (`@forge-mes/backend`)**
   - Located in `backend`
   - NestJS application with GraphQL support
   - Uses Prisma for database access

2. **Frontend (`@forge-mes/frontend`)**
   - Located in `frontend`
   - Next.js application with React
   - Uses Apollo Client for GraphQL

3. **Shared (`@forge-mes/shared`)**
   - Located in `shared`
   - Contains shared types, utilities, and constants
   - Used by both frontend and backend

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Docker and Docker Compose (for local development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/whk-recipe-configuration.git
   cd whk-recipe-configuration
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development environment:
   ```bash
   npm run dev
   ```

This will start the following:
- Shared package in watch mode
- Backend server on port 3000
- Frontend development server on port 4000

### Available Scripts

#### Root-level Scripts

- `npm run dev` - Start all applications in development mode
- `npm run build` - Build all applications
- `npm run test` - Run tests for all applications
- `npm run lint` - Run linting for all applications

#### Workspace-specific Scripts

- `npm run dev:backend` - Start backend in development mode
- `npm run dev:frontend` - Start frontend in development mode
- `npm run dev:shared` - Start shared package in watch mode
- `npm run build:backend` - Build backend
- `npm run build:frontend` - Build frontend
- `npm run build:shared` - Build shared package
- `npm run test:backend` - Run backend tests
- `npm run test:frontend` - Run frontend tests
- `npm run test:shared` - Run shared package tests
- `npm run test:frontend:e2e` - Run frontend E2E tests
- `npm run lint:backend` - Run backend linting
- `npm run lint:frontend` - Run frontend linting
- `npm run lint:shared` - Run shared package linting

#### Database Scripts

- `npm run db:deploy` - Deploy database migrations
- `npm run db:migrate` - Create a new migration
- `npm run db:studio` - Open Prisma Studio

#### Docker Scripts

- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services
- `npm run docker:logs` - View Docker logs

## Development Guidelines

### Importing from Shared Package

To import from the shared package, use the following import syntax:

```typescript
// In backend
import { formatDate, API_ENDPOINTS } from '@forge-mes/shared';

// In frontend
import { formatDate, API_ENDPOINTS } from '@forge-mes/shared';
```

### Adding Dependencies

When adding dependencies, make sure to add them to the correct workspace:

```bash
# Add dependency to backend
cd backend
npm install some-package

# Add dependency to frontend
cd frontend
npm install some-package

# Add dependency to shared
cd shared
npm install some-package
```

### Managing Versions

We use `syncpack` to ensure consistent dependency versions across workspaces:

```bash
# Check for version inconsistencies
npx syncpack list-mismatches

# Fix version inconsistencies
npx syncpack fix-mismatches
```

## CI/CD Integration

The monorepo is configured for CI/CD using GitHub Actions. The workflows are located in `.github/workflows/`.

## Further Documentation

- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)
- [API Documentation](./docs/api/README.md)
- [Architecture Documentation](./docs/architecture/README.md) 