# Application Structure

The repository contains multiple apps. The most important directories are:

```
apps/
├── whk-recipe-configuration       # NestJS backend
├── whk-recipe-configuration-admin # React admin UI
└── whk-mes                        # Documentation
```

Within `whk-recipe-configuration` the `src` folder is organised by domain modules:

- `auth/` – authentication guards and services
- `rabbitmq/` – message queue integration
- `sync/` – syncing logic for incoming events
- `prisma/` – Prisma schema and migrations
- domain directories like `item`, `vendor`, `customer`, each with controller, resolver and service files

The admin UI under `whk-recipe-configuration-admin` consumes the GraphQL API from the backend.
