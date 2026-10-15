# Daytona Sandbox Integration

The Daytona module provides secure, isolated code execution environments for AI-assisted development and testing within the WhiskeyHouse MES application.

## Overview

Daytona sandboxes enable developers and power users to:

- **Test custom recipe calculations** in isolated environments
- **Run AI-generated code** safely before deploying to production
- **Develop and validate** custom integration scripts
- **Experiment with code** without affecting the production system

## Architecture

### Backend Components

- **DaytonaModule** (`daytona.module.ts`): NestJS module configuration
- **DaytonaService** (`daytona.service.ts`): Core business logic for sandbox management
- **DaytonaResolver** (`daytona.resolver.ts`): GraphQL API endpoints
- **DTOs**: Type-safe data transfer objects for API requests
  - `CreateSandboxDto`: Sandbox creation parameters
  - `ExecuteCommandDto`: Command execution parameters
- **Entities**: Response models
  - `Sandbox`: Sandbox instance information
  - `CommandResult`: Command execution results

### Frontend Components

- **Developer Tools Page** (`/developer-tools`): React UI for sandbox management
  - Create sandboxes with various programming languages
  - Execute commands in active sandboxes
  - Manage sandbox lifecycle

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Required - Your Daytona API key
DAYTONA_API_KEY=your_api_key_here

# Optional - Daytona API endpoint (defaults to Daytona's production API)
DAYTONA_API_URL=https://api.daytona.io

# Optional - Target environment
DAYTONA_TARGET=production
```

### Obtaining a Daytona API Key

1. Visit [https://www.daytona.io](https://www.daytona.io)
2. Sign up or log in to your account
3. Navigate to API settings
4. Generate a new API key
5. Add the key to your environment configuration

## GraphQL API

### Queries

#### Check if Daytona is Enabled

```graphql
query {
  daytonaEnabled
}
```

#### List My Sandboxes

```graphql
query {
  mySandboxes {
    id
    language
    name
    status
    createdBy
    createdAt
    lastActivity
  }
}
```

#### Get Specific Sandbox

```graphql
query GetSandbox($id: String!) {
  sandbox(id: $id) {
    id
    language
    name
    status
    createdAt
    lastActivity
  }
}
```

### Mutations

#### Create Sandbox

```graphql
mutation CreateSandbox($data: CreateSandboxDto!) {
  createSandbox(data: $data) {
    id
    language
    name
    status
    createdAt
  }
}
```

Variables:

```json
{
  "data": {
    "language": "typescript",
    "name": "Recipe Calculation Test",
    "initialCode": "console.log('Hello from sandbox');"
  }
}
```

#### Execute Command

```graphql
mutation ExecuteCommand($data: ExecuteCommandDto!) {
  executeCommand(data: $data) {
    stdout
    stderr
    exitCode
    duration
  }
}
```

Variables:

```json
{
  "data": {
    "sandboxId": "sandbox-123",
    "command": "npm test",
    "timeout": 60000
  }
}
```

#### Delete Sandbox

```graphql
mutation DeleteSandbox($id: String!) {
  deleteSandbox(id: $id)
}
```

## Supported Languages

- TypeScript
- JavaScript
- Python
- Go
- Rust
- Java

## Security Features

### User Isolation

- Each sandbox is owned by the user who created it
- Users can only access their own sandboxes
- Sandbox operations are audited via `AuditContextInterceptor`

### Resource Management

- Sandboxes are tracked in-memory with metadata
- Automatic cleanup of inactive sandboxes (configurable timeout)
- Command execution timeouts prevent runaway processes

### Access Control

- Integration with MES RBAC system (commented out in resolver - enable when ready)
- Designed for developer/power user access levels
- Can be restricted to admin-only if needed

## Usage Examples

### Frontend (React)

```typescript
import { useMutation, useQuery } from "@apollo/client";

// Check if Daytona is enabled
const { data } = useQuery(DAYTONA_ENABLED_QUERY);
const isEnabled = data?.daytonaEnabled;

// Create a sandbox
const [createSandbox] = useMutation(CREATE_SANDBOX_MUTATION);
await createSandbox({
  variables: {
    data: {
      language: "typescript",
      name: "Test Environment",
      initialCode: 'console.log("Ready");',
    },
  },
});

// Execute code
const [executeCommand] = useMutation(EXECUTE_COMMAND_MUTATION);
const result = await executeCommand({
  variables: {
    data: {
      sandboxId: "sandbox-123",
      command: "node index.js",
    },
  },
});
```

### Backend (NestJS Service)

```typescript
import { DaytonaService } from "./daytona/daytona.service";

@Injectable()
export class MyService {
  constructor(private readonly daytonaService: DaytonaService) {}

  async testRecipeCalculation(recipeCode: string, userId: string) {
    // Create sandbox
    const sandbox = await this.daytonaService.createSandbox(
      {
        language: SandboxLanguage.TYPESCRIPT,
        name: "Recipe Test",
        initialCode: recipeCode,
      },
      userId
    );

    // Execute test
    const result = await this.daytonaService.executeCommand(
      {
        sandboxId: sandbox.id,
        command: "npm test",
      },
      userId
    );

    // Cleanup
    await this.daytonaService.deleteSandbox(sandbox.id, userId);

    return result;
  }
}
```

## Automatic Cleanup

The service includes automatic cleanup of inactive sandboxes. To schedule periodic cleanup:

```typescript
import { Cron } from "@nestjs/schedule";

@Injectable()
export class DaytonaCleanupService {
  constructor(private readonly daytonaService: DaytonaService) {}

  @Cron("0 */6 * * *") // Every 6 hours
  async cleanupInactiveSandboxes() {
    const maxAgeMinutes = 60; // Clean sandboxes older than 1 hour
    const cleaned = await this.daytonaService.cleanupInactiveSandboxes(
      maxAgeMinutes
    );
    console.log(`Cleaned up ${cleaned} inactive sandboxes`);
  }
}
```

## Testing

Run the test suite:

```bash
cd backend
npm test -- daytona.service.spec.ts
```

## Limitations & Considerations

1. **In-Memory Storage**: Sandbox registry is currently in-memory. Consider persisting to database for production use.
2. **Resource Limits**: Daytona sandboxes have resource limits defined by your Daytona account tier.
3. **Cost**: Daytona is a paid service - monitor usage to control costs.
4. **Network Access**: Sandboxes may have restricted network access depending on configuration.

## Future Enhancements

- [ ] Persist sandbox metadata to database (Prisma model)
- [ ] Add file upload/download capabilities
- [ ] Implement collaborative sandboxes (multi-user)
- [ ] Add sandbox templates for common use cases
- [ ] Integrate with recipe validation workflow
- [ ] Add metrics and monitoring
- [ ] Implement sandbox quotas per user

## Support

For issues with the Daytona integration:

1. Check environment variable configuration
2. Verify Daytona API key is valid
3. Review backend logs for error details
4. Consult [Daytona documentation](https://www.daytona.io/docs)

For MES-specific issues, contact the development team.
