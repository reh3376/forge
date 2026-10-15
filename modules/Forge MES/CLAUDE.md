# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Turborepo monorepo** for WhiskeyHouse Manufacturing Execution System (MES) - a comprehensive manufacturing execution system for whiskey production. The system manages end-to-end production from raw material receipt through finished goods, with complete traceability and ERP integration.

**MES Phase 1 Status**: 66% Complete (16/24 projects)

## Monorepo Structure

```
apps/
├── whk-recipe-configuration/  # Backend (NestJS + Prisma + GraphQL)
├── mes-ui/                     # Frontend (Next.js 15 + React 19)
└── shared/                     # Shared TypeScript types and utilities
```

## Common Commands

### Development

```bash
# Full stack development (all apps)
make dev                    # or: npx turbo dev

# Individual apps
make dev-backend           # Backend only (port 3000)
make dev-frontend          # Frontend only (port 4000)
make dev-shared            # Shared library watch mode

# Legacy npm scripts (if needed)
npm run dev:backend:debug  # Backend with debugger
```

### Building

```bash
make build                 # Build all apps
make build-backend         # Backend only
make build-frontend        # Frontend only
```

### Testing

```bash
make test                  # All tests
make test-backend          # Backend unit tests (Jest)
make test-frontend         # Frontend tests
make test-e2e              # Frontend E2E tests (Playwright)
```

### Database Operations

```bash
# Database setup (REQUIRED for first-time setup)
make db-dev                # Start PostgreSQL, Redis containers
make db-init               # Run migrations + seed data
make prisma-generate       # Generate Prisma client

# Database management
make db-migrate            # Run new migrations
make db-studio             # Open Prisma Studio
make db-seed               # Re-seed data

# Individual seed commands (from backend directory)
npm run seed:all           # All seed data
npm run seed:interactive   # Interactive seed CLI
npm run seed:verify        # Verify seed status
```

### Code Quality

```bash
make lint                  # Lint all apps
make lint-fix              # Auto-fix linting issues
make format                # Format with Prettier
```

### Utility Commands

```bash
make setup                 # First-time setup (install deps, generate Prisma)
make status                # Show running containers and ports
make ports                 # Check port usage (3000, 4000, 5432, 6379, 5672)
make clean                 # Clean build artifacts
make turbo-cache           # Clear Turborepo cache
```

## Architecture & Key Concepts

### Backend (NestJS)

**Location**: `backend/`

**Tech Stack**: NestJS, Prisma ORM, GraphQL (Apollo), PostgreSQL, Redis, RabbitMQ

**Module Organization**: Domain-driven modules with base classes:
- Each entity has a module folder (e.g., `src/productionOrder/`)
- `base/` subdirectories contain auto-generated Prisma code
- Custom logic goes in module-level files (`.service.ts`, `.resolver.ts`, `.controller.ts`)

**Key Modules**:
- **Order Management**: `productionOrder`, `scheduleOrder`, `scheduleOrderQueue` - Production order lifecycle with queue-based scheduling
- **Recipe Management**: `recipe`, `recipeBom`, `productionOrderRecipeInstance` - Master recipes and active instances
- **Inventory**: `inventory`, `lot`, `itemReceipt`, `inventoryTransfer` - Lot traceability
- **Integration**: `rabbitmq`, `sync` - NetSuite ERP sync, RabbitMQ messaging
- **Real-time**: `mqtt` - Equipment interface via MQTT
- **Auth**: `auth`, `acl` - JWT + Role-based access control
- **Audit**: `audit` - Comprehensive audit logging with `AuditContextInterceptor`

**Database Schema**: 50+ Prisma models in `backend/prisma/schema.prisma`

**Important Patterns**:
- Prisma generates base resolvers/services - extend them in module files
- Use `ClsModule` for request context (audit trails, user tracking)
- All mutations should trigger audit logs via `AuditContextInterceptor`
- GraphQL API at `/graphql` with Apollo Server
- CORS configured for `http://localhost:3000` and `http://localhost:4000`

### Frontend (Next.js)

**Location**: `frontend/`

**Tech Stack**: Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, shadcn/ui, Apollo Client, Zustand

**Key Libraries**:
- **GraphQL**: `@apollo/client` for API queries/mutations
- **Auth**: `@azure/msal-react` for Microsoft Entra ID
- **Forms**: `react-hook-form` + `zod` validation
- **UI Components**: Radix UI primitives + TailwindCSS
- **Real-time**: `socket.io-client` for WebSockets
- **State**: Zustand for global state

**Important Notes**:
- Frontend runs on port **4000** (not 3000)
- Backend GraphQL endpoint: `http://localhost:3000/graphql`
- Uses Next.js App Router (not Pages Router)

### Shared Library

**Location**: `shared/`

**Purpose**: TypeScript types, Zod schemas, utilities shared between frontend and backend

**Build**: TypeScript watch mode compiles to `dist/` - both apps import from `@forge-mes/shared`

## Development Workflow

### First-Time Setup

```bash
make setup                 # Install dependencies, generate Prisma client
make db-dev                # Start Docker containers (PostgreSQL, Redis)
make db-init               # Run migrations and seed data
make dev                   # Start all apps
```

**Ports**:
- Backend: `http://localhost:3000`
- GraphQL Playground: `http://localhost:3000/graphql`
- Frontend: `http://localhost:4000`
- Prisma Studio: `npx prisma studio` (port 5555)

### Making Database Changes

1. Edit `backend/prisma/schema.prisma`
2. Run `make prisma-generate` to update Prisma client
3. Create migration: `cd backend && npm run db:dev:migrate-save -- --name "description"`
4. Migration files in `backend/prisma/migrations/`

**IMPORTANT**: Prisma generates base classes in `base/` directories - **never edit these directly**. Extend them in module-level files.

### Running Single Tests

```bash
# Backend
cd backend
npm test -- path/to/test.spec.ts

# Frontend
cd frontend
npm test -- path/to/test.spec.tsx
npm run test:e2e -- tests/specific-test.spec.ts
```

## Integration Points

### NetSuite ERP
- Bidirectional sync via `sync` module
- Production orders, inventory, items synchronized
- RabbitMQ messaging for async operations

### Equipment (MQTT)
- Real-time data collection from brewery equipment
- `mqtt` provider module handles subscriptions
- UNS (Unified Namespace) architecture via `unsConfiguration`

### RabbitMQ
- Message broker for system events
- Module: `backend/src/rabbitmq/`
- Used for ERP sync, real-time updates

## Key Business Logic

### Production Order Lifecycle
1. **Production Order (PrO)** created via wizard (`productionOrder` module)
2. Automatic item number generation for NetSuite
3. Added to **Schedule Order Queue** with index-based sequencing
4. **Active Recipe Instance** created from master recipe
5. Timeline calculation for phase timing
6. Real-time tracking via MQTT + WebSockets

### Recipe System
- **Master Recipes**: Template definitions in `recipe` module
- **Active Instances**: Live production copies in `productionOrderRecipeInstance`
- **Recipe Parameters**: Operation-specific parameters linked to recipes
- **BOM Management**: Bill of materials with lot traceability

### Queue-Based Scheduling
- `scheduleOrderQueue` manages production sequence
- Index-based ordering (not timestamp-based)
- Real-time timeline calculation
- Deviation tracking against planned schedules

## Environment Variables

**Managed via**: `dotenv-vault` (requires vault access)

**Key Variables**:
- `DATABASE_URL` / `DB_URL` - PostgreSQL connection
- `REDIS_HOST`, `REDIS_PORT` - Redis cache
- `ENTRA_*` - Microsoft Entra ID auth
- `APP_JWT_SECRET` - JWT signing
- `CORS_ORIGINS` - Allowed CORS origins
- `MQTT_*` - Equipment connectivity

Setup: `npx dotenv-vault pull`

## Testing Strategy

- **Backend**: Jest unit tests, supertest for E2E
- **Frontend**: Jest + React Testing Library for components, Playwright for E2E
- **Test Data**: Seeding scripts in `backend/scripts/seed/`
- **E2E**: Playwright tests in `frontend/tests/`

## Turborepo Specifics

- **Caching**: Turbo caches build/test outputs in `.turbo/`
- **Task Dependencies**: Defined in `turbo.json` (e.g., `build` depends on `prisma:generate`)
- **Filtering**: Use `--filter=<app-name>` for app-specific commands
- **Parallel Execution**: Turbo runs independent tasks in parallel automatically

**Clear cache**: `make turbo-cache` or `rm -rf .turbo`

## Coding Standards

### Backend
- Domain-driven module structure
- Extend Prisma base classes (don't modify generated code)
- Use DTOs for validation (class-validator)
- GraphQL resolvers return Prisma types
- Always trigger audit logs for data mutations
- Use `ClsModule` for request context

### Frontend
- Functional components with hooks
- Tailwind utility classes (shadcn/ui patterns)
- Form validation with Zod schemas
- Apollo Client for GraphQL queries
- Keep business logic in custom hooks
- Use TypeScript strict mode

### Shared
- Export shared types/schemas for both apps
- Zod schemas for runtime validation
- No runtime dependencies (keep lightweight)

## Submodules

**Note**: The repository contains a submodule at `backend/submodules/whk-script-library` (currently shown as modified in git status). Coordinate with team on submodule updates.

## Documentation

Extensive docs in `docs/` directory:
- `docs/mes-phase-1-initiative-overview.md` - Project context
- `docs/features/order-management/` - Order management details
- `docs/features/recipe-management/` - Recipe system
- `docs/architecture/mes-data-model.md` - Database design
- `docs/integration/` - Integration patterns

**ERD**: Generated at `backend/prisma/ERD.svg` via `npm run docs:erd`
