# Schema Versioning Strategy

A robust schema versioning solution ensures that each database change is traceable and that all records carry explicit metadata so that downstream processes can adapt to evolving schemas. This document outlines the approach using Prisma Migrate, envelope metadata, and a version service.

## Goals and Scope
- Track every schema change with timestamped migration files under `prisma/migrations`.
- Annotate records with a `schemaVersion` field for branching logic.
- Provide an endpoint that returns the latest migration identifier.
- Maintain compatibility using semantic versioning and the expand‑and‑contract pattern.
- Automate deployment and drift detection in CI/CD.

## Functional Requirements
### 3.1 Migration Management
1. Use `prisma migrate` to generate SQL migrations.
2. Embed both forward and backward SQL steps for safe rollbacks.

### 3.2 Record Version Metadata
1. Add a `schemaVersion INT` column to domain tables with a default matching the current migration.
2. Backfill existing rows during the same migration.

### 3.3 Envelope Metadata for Event Streams
- Wrap each payload in an envelope containing `schemaId` and `payload`.
- Register schemas in Confluent Schema Registry with compatibility rules enforced.

### 3.4 Middleware Service
- Expose `/schema-version` via Express. It returns the latest migration name queried from `_prisma_migrations`.
- Cache the result and refresh periodically or via webhook.

### 3.5 Prisma Client Integration
- Use Prisma Client extensions to inject `schemaVersion` during create operations.
- For older Prisma versions, fall back to raw middleware with the same behavior.

## Non‑Functional Requirements
- Zero‑downtime migrations via expand‑and‑contract.
- Idempotent migrations.
- Highly available, stateless version service secured by an API key or internal auth.
- Minimal latency impact at high write volumes.

## Architecture Overview
```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│ Data Producer│ ──→  │ Version Service │ ──→  │ Prisma ORM  │ ──→ Database (_prisma_migrations + user tables)
└─────────────┘       └─────────────────┘       └─────────────┘
         │                                             │
         ↓                                             ↓
    Event Bus                                     Data Lake (Delta/Hudi) 
      (Avro)         ← Schema Registry ID            (Schema-on-read) 
```

## Component Specifications
### 6.1 Prisma Migrate Setup
- **Development**: `npx prisma migrate dev` to create/apply migrations.
- **Production**: `npx prisma migrate deploy` to apply pending migrations.

### 6.2 Custom Migration for `schemaVersion`
```bash
npx prisma migrate dev --create-only --name add_schema_version
```
Edit `migration.sql`:
```sql
ALTER TABLE "Order" ADD COLUMN "schemaVersion" INT NOT NULL DEFAULT 1;
UPDATE "Order" SET "schemaVersion" = 1 WHERE "schemaVersion" IS NULL;
```

### 6.3 Version Service (NestJS)
The backend exposes a `/schema-version` endpoint implemented with a dedicated
`SchemaVersionModule`. The service caches the latest migration name from the
`_prisma_migrations` table and refreshes the cache periodically.

```typescript
import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("schema-version")
export class SchemaVersionController {
  constructor(private readonly prisma: PrismaService) {}

  private cached: string | null = null;

  private async refresh() {
    const [row] = await this.prisma.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`;
    this.cached = row?.migration_name ?? null;
  }

  @Get()
  async handle() {
    if (!this.cached) await this.refresh();
    return { schemaVersion: this.cached };
  }
}
```

### 6.4 Prisma Client Extension
```typescript
import { PrismaClient, Prisma } from '@prisma/client';

const versionExt = Prisma.defineExtension(prisma =>
  prisma.$extends({
    model: {
      Order: {
        async create(args, next) {
          args.args.data.schemaVersion = await fetchVersion();
          return next(args);
        },
      },
    },
  })
);

const prisma = new PrismaClient().$extends(versionExt);
```

## Pipeline Integration
### 7.1 Schema Registry Compatibility
- Use subjects like `<entity>-value` with BACKWARD or FULL compatibility.
- Register new schemas via the Schema Registry REST API and embed the ID in the envelope.

### 7.2 Lakehouse Formats
- Use Delta Lake/Iceberg for schema evolution. Pipelines consume data in schema‑on‑read mode.

## CI/CD and Testing
- Run migrations against an ephemeral database in CI.
- Use `prisma migrate diff` to detect drift.
- Validate Schema Registry compatibility during CI using the registry's CLI.

## Monitoring and Alerting
- Detect schema drift via `prisma migrate diff`.
- Instrument the version service with Prometheus and alert on errors.
- Notify pipelines on deserialization failures or unknown schema IDs.

## Glossary
- **Prisma Migrate**: CLI tool generating versioned SQL migrations.
- **Expand‑and‑Contract**: Phased migration approach enabling zero downtime.
- **Schema Registry**: Central store for Avro/Protobuf schemas with compatibility rules.
- **Envelope Metadata**: Wrapper carrying `schemaId` and `payload`.
- **Client Extension**: Type‑safe Prisma middleware for intercepting queries.

