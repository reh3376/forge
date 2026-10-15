# Forge MES — Manufacturing Execution System module

> **Forge module** · spoke of the Forge hub (forge-core) · adapter id `forge-mes` · FACTS spec `specs/forge-mes.facts.json`
>
> This directory is the Forge MES module. It was migrated from `WhiskeyHouse/whk-mes` on 2026-10-15; forge-mes replaces whk-mes. Every Forge module has two main sections, a backend and a frontend:
>
> | Section | Path | Stack | Role |
> |---|---|---|---|
> | **backend** | `backend/` | NestJS 10, Prisma (84 models), GraphQL, RabbitMQ, MQTT | MES domain logic plus the integration with forge-core. The hub-side spoke contract lives in the forge repo at `src/forge/adapters/forge_mes/` (manifest, context mapping, entity mappers) and transport is the gRPC `AdapterService`. |
> | **frontend** | `frontend/` | Next.js 15, React 18, Apollo Client | Operator and planner UI. |
> | shared | `shared/` | TypeScript | Types shared by backend and frontend, published in-workspace as `@forge-mes/shared`. |
>
> Hub relationship: forge-mes connects only to the hub, never to other spokes. Data leaves as `ContextualRecord`s over gRPC, domain events go to the Forge broker and to the UNS topics the OT module consumes (`recipe/next`, `changeover/state`, `queue/*`), and persistence targets the hub-owned `mod_mes` schema. Governance (FACTS, FxTS) is documented in the forge repo root.
>
> Workspace commands: `npm install`, then `npm run dev:backend`, `npm run dev:frontend`, `npm run build`, `npm test`.

---

# WhiskeyHouse Manufacturing Execution System (MES)

A comprehensive manufacturing execution system for whiskey production built with NestJS, Prisma ORM, and GraphQL. This system provides end-to-end production management from raw material receipt through finished goods, with complete traceability and ERP integration.

## MES Phase 1 Initiative

The MES Phase 1 initiative represents a comprehensive transformation of WhiskeyHouse's production operations, digitizing and automating core manufacturing processes while establishing robust traceability and integration with ERP systems.

### 🎯 Initiative Status: **66% Complete** (16/24 projects)
- ✅ **Completed**: 8 projects
- 🔄 **In Progress**: 8 projects  
- 🧪 **Testing**: 1 project
- ⏳ **Planned**: 7 projects

### 🏗️ Core Functional Areas

#### Order Management
- **Production Orders (PrOs)**: Individual production units with complete specifications
- **Schedule Orders (SchOs)**: Production grouping and resource allocation
- **Production Order Wizard**: Comprehensive order creation with automatic item generation

#### Recipe Management  
- **Master Recipes**: Recipe definitions with BOM and mashing protocols
- **Active Recipe Instances**: Live production recipe instantiation and modification
- **Recipe Parameters**: Operation-specific parameter management

#### Schedule Management
- **Queue-Based Scheduling**: Index-based production sequencing
- **Timeline Management**: Automated phase timing and resource planning
- **Deviation Tracking**: Real-time progress monitoring and reporting

#### Integration
- **NetSuite ERP**: Bidirectional data synchronization
- **RabbitMQ Messaging**: Asynchronous system communication
- **Equipment Interface**: MQTT-based real-time data collection

### 📋 Key Features Implemented
- 50+ Prisma database models with comprehensive relationships
- Production order lifecycle management with automatic item number generation
- Queue-based scheduling with real-time timeline calculation
- Recipe management with active instance modification capabilities
- Complete inventory and lot traceability
- Quality management and testing integration
- Role-based access control with optimized permission system
- Comprehensive audit logging and change tracking

### 📚 Documentation
- [**Initiative Overview**](./docs/mes-phase-1-initiative-overview.md) - Complete initiative context and objectives
- [**Implementation Status**](./docs/mes-phase-1-implementation-status.md) - Current progress and milestones
- [**Order Management**](./docs/features/order-management/README.md) - Production and schedule order management
- [**Recipe Management**](./docs/features/recipe-management/active-recipe-instances.md) - Recipe system and instances
- [**Schedule Management**](./docs/features/scheduling/queue-index-management.md) - Queue-based scheduling system
- [**Data Model**](./docs/architecture/mes-data-model.md) - Comprehensive database schema
- [**NetSuite Integration**](./docs/integration/netsuite-integration.md) - ERP integration patterns
- [**RabbitMQ Messaging**](./docs/integration/rabbitmq-messaging.md) - Messaging infrastructure

---

## Technical Overview

## Technology Stack

- NestJS - Backend framework
- Prisma - ORM and database management
- GraphQL - API query language
- Docker - Containerization
- PM2 - Process manager
- Jest - Testing framework

## Prerequisites

- Node.js (>= 18.x)
- npm or yarn
- Docker and Docker Compose
- PM2 (for production deployment)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/whk-recipe-configuration.git
cd whk-recipe-configuration
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Install dotenv-vault CLI if you haven't already
npm install -g dotenv-vault

# Pull environment variables
npx dotenv-vault pull
```

## Database Setup

This service uses Prisma as the ORM. Here are the key database commands:

```bash
# Generate Prisma client
npm run prisma:generate

# Development: Initialize database with initial migration
npm run db:dev:init

# Development: Clean database
npm run db:dev:clean

# Production: Deploy migrations
npm run db:prod:deploy
```

## Development

Start the development server:

```bash
# Watch mode
npm run start:dev:watch

# Debug mode
npm run start:dev:debug

# With Docker
npm run docker:dev
```

### Seeding Data

```bash
# Seed development data
npm run dev:seed

# Seed production data
npm run prod:seed

# Seed specific data types
npm run prod:seed:tests
npm run prod:seed:assets
npm run prod:seed:unit
npm run prod:seed:recipeParameters
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:dev:fix

# Format code
npm run format:dev
```

## Production Deployment

```bash
# Build the application
npm run build

# Start with PM2
npm run prod:start
```

### Docker Deployment

```bash
# Build container
npm run package:dev:container

# Start services
npm run compose:dev:up

# Stop services
npm run compose:dev:down
```

## Testing

```bash
# Run tests
npm test
```

## Project Structure

```
src/
├── controllers/    # Route controllers
├── models/        # Data models and types
├── resolvers/     # GraphQL resolvers
├── services/      # Business logic
├── validators/    # Custom validators
└── prisma/        # Database schema and migrations
```

## Environment Variables

This project uses dotenv-vault for secure environment variable management. Contact the development team for access to the environment variables.

Required environment variables include:
- DATABASE_URL
- JWT_SECRET
- AZURE_KEYVAULT_URL
- Other service-specific variables

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Specify your license]

## Support

For support, please contact the development team or create an issue in the repository.

## Forge core integration

The backend registers with the forge-core hub over gRPC (`forge.v1.AdapterService`) and streams every domain event as a `ContextualRecord`. It is opt-in: set `FORGE_HUB_ENABLED=true` and `FORGE_HUB_GRPC_URL=<hub-host>:50051`. The hub writes back through the spoke-hosted half of the same service (`Write`/`Discover`/`Health` on `FORGE_SPOKE_GRPC_BIND`, default port 50052): changeover commands are exposed as `mes.changeover.<area>.<command>` tags. Session state, queue depth, circuit state and the write-back server are exposed at `GET /api/forge/status`. Details, the full environment table and the `mod_mes` persistence plan: [docs/integration/forge-core-integration.md](docs/integration/forge-core-integration.md).
