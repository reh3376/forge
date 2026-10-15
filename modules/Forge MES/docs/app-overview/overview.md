# WHK MES Documentation

This document provides an overview of the WHK Manufacturing Execution System (MES) application. It outlines the technology stack, core application structure, and key concepts such as data synchronisation and authentication.

## Technology Stack

- **Node.js & NestJS** – Backend framework used to build the server API.
- **GraphQL** – Primary API layer exposed by the server for the admin UI and other clients.
- **Prisma ORM** with **PostgreSQL** – Provides the database layer and migration system.
- **RabbitMQ** – Used for asynchronous message passing and synchronisation with external systems.
- **Redis** – Cache provider integrated via NestJS `CacheModule`.
- **OpenTelemetry** – Application tracing and monitoring.
- **React & React‑Admin** – Front‑end framework for the admin UI (see `apps/whk-recipe-configuration-admin`).
- **Docker** and **PM2** – Deployment and process management utilities.

## Repository Layout

```
apps/
├── whk-recipe-configuration          # Backend service (NestJS)
├── whk-recipe-configuration-admin    # React admin UI
└── whk-mes                           # Documentation (this folder)
```

The backend service is located under `backend`. It exposes a GraphQL API and listens to RabbitMQ messages for data synchronisation. The admin UI resides in `apps/whk-recipe-configuration-admin` and communicates with the backend using the GraphQL endpoint.

## Backend Structure

Key directories inside `backend/src`:

- `auth/` – JWT authentication, user validation and ACL utilities.
- `rabbitmq/` – Message queue integration and the `MessageQueueService` for reliable message delivery.
- `sync/` – The `SyncService` that processes incoming RabbitMQ events to create or update database records.
- Various domain modules (e.g. `item`, `customer`, `purchaseOrder`, etc.) that encapsulate controllers, resolvers and services for each entity.
- `prisma/` – Prisma schema and database migrations.

`AppModule` wires together all feature modules and configures GraphQL, caching, OpenTelemetry tracing and other shared infrastructure.

## Synchronisation Flow

External systems publish events to RabbitMQ topics (for example `wh.whk01.distillery01.item`). The `RabbitMQController` listens for these events and delegates processing to `SyncService`.

`SyncService` converts the event payloads into Prisma operations. It handles nested relations and can create, update or delete entities based on the action in the message. Failed or missing acknowledgements trigger retries via scheduled Cron jobs defined in `MessageQueueService`.

Refer to [`docs/message-acknowledgment.md`](../../../docs/message-acknowledgment.md) for details on the acknowledgement and retry logic.

## Authentication

Authentication is based on JWTs. The `AuthService` validates user credentials and issues tokens through the `TokenService` which wraps NestJS's `JwtService`.

Example login flow (simplified):

```typescript
const user = await authService.validateUser(username, password);
if (!user) throw new UnauthorizedException();
const token = await tokenService.createToken({ id: user.id, username, password });
return { accessToken: token, ...user };
```

Clients include the token in the `Authorization` header when interacting with the GraphQL API. Permissions are enforced via ACL guards defined in the `auth` module.

## Running Locally

1. Install dependencies and generate the Prisma client:
   ```bash
   npm install
   npm run prisma:generate
   ```
2. Start required services and the development server:
   ```bash
   npm run docker:dev       # Starts PostgreSQL, RabbitMQ, etc.
   npm run db:dev:init       # Apply migrations
   npm run start:dev:watch   # Launch NestJS in watch mode
   ```
3. For the admin UI, run:
   ```bash
   cd apps/whk-recipe-configuration-admin
   npm install
   npm start
   ```

## Further Reading

- Backend README: [`backend/README.md`](../whk-recipe-configuration/README.md)
- Admin README: [`apps/whk-recipe-configuration-admin/README.md`](../whk-recipe-configuration-admin/README.md)
- Message acknowledgement design: [`docs/message-acknowledgment.md`](../../../docs/message-acknowledgment.md)
- Messaging and sync: [`syncing.md`](./syncing.md)
- Authentication details: [`authentication.md`](./authentication.md)
- Repository structure: [`app-structure.md`](./app-structure.md)

