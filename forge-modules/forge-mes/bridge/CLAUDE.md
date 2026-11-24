# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory, the Forge MES module of the forge repository. The repository's rules are in the root `CLAUDE.md`; read it first.

## Repository Overview

This directory is the Forge MES module: a **Turborepo workspace** migrated from `WhiskeyHouse/whk-mes` on 2026-10-15. It is a manufacturing execution system for whiskey production, from raw material receipt through finished goods, with traceability and ERP integration.

## Where this module stands in Forge

- **This code is the interim MES bridge.** forge-mes is to be rewritten in Go (`docs/decisions/forge-mes-go.md` in the repository root, signed 2026-11-03) and is not built yet. Until then the NestJS backend here speaks the Forge spoke contract: `backend/src/forge/` registers with the hub and streams `ContextualRecord`s over gRPC (`forge.v1.AdapterService`). The hub-side half is `src/forge/adapters/forge_mes/`, and the module's FACTS spec is `specs/forge-mes.facts.json`.
- **The frontend is interim too.** Every Forge user interface will be rendered by forge-display from the modules' FVTS specs; no module ships its own UI. This Next.js frontend is the MES user interface only until forge-display exists. Do not build new product surface on it without the owner's word.
- **The backend's link to the hub is held to the one-clock rules.** It exchanges time with the hub on every Register, Health and Ingest, and the hub refuses it when its clock is outside the declared tolerance class. `docs/integration/forge-core-integration.md` describes the link.
- Open problems in this module are in the root `BACKLOG.md`, section "Forge MES module".

## Workspace Structure

```
backend/    # NestJS + Prisma + GraphQL (@forge-mes/backend)
frontend/   # Next.js 14 + React 18 (@forge-mes/frontend)
shared/     # Shared TypeScript types and utilities (@forge-mes/shared)
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
- **Auth**: `auth` - JWT + Role-based access control
- **Forge hub link**: `forge` - the spoke side of the hub contract (registration, health, ingest, write-back)
- **Audit**: `audit` - Comprehensive audit logging with `AuditContextInterceptor`

**Database Schema**: 84 Prisma models in `backend/prisma/schema.prisma`

**Important Patterns**:
- Prisma generates base resolvers/services - extend them in module files
- Use `ClsModule` for request context (audit trails, user tracking)
- All mutations should trigger audit logs via `AuditContextInterceptor`
- GraphQL API at `/graphql` with Apollo Server
- CORS configured for `http://localhost:3000` and `http://localhost:4000`

### Frontend (Next.js)

**Location**: `frontend/`

**Tech Stack**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, shadcn/ui, Apollo Client, Zustand

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
npm run test:e2e -- e2e/specific-test.spec.ts
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
- **E2E**: Playwright tests in `frontend/e2e/`

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

## What CI checks here

The `mes-module` job in the repository's `.github/workflows/ci.yml` installs from `package-lock.json` (`npm ci`), builds `shared`, generates the Prisma client and then runs:

- the backend type check and the frontend type check, both blocking. The frontend compiles under `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature`; fix an error in the code, do not relax a flag;
- backend jest on `src/forge` only, the bridge's link to the hub, blocking. The old application's other backend tests are not run in CI and are not to be fixed: forge-mes is to be written in Go and that code does not carry over (the owner, 2026-11-23; root `BACKLOG.md` FB-036).

Things that have cost time here:

- A local type check means nothing unless the packages were installed from the lock file first. Ask the owner before installing.
- Starting Next.js, which the frontend's jest does, rewrites `package-lock.json` (FB-132). Restore the lock file afterwards.
- `shared/node_modules` is committed (FB-130). Do not stage changes under it.
- The frontend's own unit tests fail in ten tests and CI does not run them (FB-131).
- Read an environment variable by name in the frontend only after declaring it in `frontend/types/env.d.ts`; the dotted form is what Next.js inlines at build time.

## Documentation

Extensive docs in `docs/` directory:
- `docs/mes-phase-1-initiative-overview.md` - Project context
- `docs/features/order-management/` - Order management details
- `docs/features/recipe-management/` - Recipe system
- `docs/architecture/mes-data-model.md` - Database design
- `docs/integration/` - Integration patterns

**ERD**: Generated at `backend/prisma/ERD.svg` via `npm run docs:erd`
