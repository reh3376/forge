# Audit Trail System

This module provides automatic audit logging for database changes using Prisma middleware. It captures all CREATE, UPDATE, and DELETE operations on specified models without requiring changes to existing service code.

## Architecture

The audit system consists of several components:

### 1. AuditService (`audit.service.ts`)

Core service for managing audit logs with methods for:

- Creating audit log entries
- Retrieving audit history by entity or user
- Formatting audit logs for display
- Extracting changes between objects

### 2. AuditMiddlewareService (`audit-middleware.service.ts`)

Prisma middleware that automatically intercepts database operations and logs changes:

- Monitors specified models for CREATE/UPDATE/DELETE operations
- Captures before/after states for updates
- Uses Continuation Local Storage (CLS) for request context
- Automatically logs changes without service modifications

### 3. AuditContextInterceptor (`audit-context.interceptor.ts`)

HTTP interceptor that extracts user context from requests:

- Gets user ID from authenticated requests
- Captures IP address and user agent
- Sets context in CLS for the duration of the request

### 4. Database Model (`schema.prisma`)

```prisma
model AuditLog {
  id        String      @id @default(cuid())
  globalId  String      @unique @default(cuid())
  entityType String     // The type of entity being modified
  entityId  String      // The ID of the entity being modified
  action    AuditAction // CREATE/UPDATE/DELETE
  oldValues Json?       // Previous values (null for CREATE)
  newValues Json?       // New values (null for DELETE)
  userId    String      // Who made the change
  user      User        @relation(fields: [userId], references: [id])
  ipAddress String?     // IP address of the request
  userAgent String?     // Browser/client information
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@index([action])
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
}
```

## Configuration

### Auditable Models

Edit the `AUDITABLE_MODELS` array in `audit-middleware.service.ts` to specify which models should be audited:

```typescript
const AUDITABLE_MODELS = [
  "EnzymeConfiguration",
  "SystemConfiguration",
  "EnzymeCalculationRule",
  // Add more models as needed
] as const;
```

### Request Context

The system automatically captures user context from authenticated requests. Ensure your authentication system sets `request.user.id`.

## Usage

### Automatic Audit Logging

Once configured, audit logging happens automatically for all specified models:

```typescript
// This will automatically create an audit log entry
await prisma.enzymeConfiguration.create({
  data: {
    itemId: "item123",
    category: "LIQUIFACTION",
    dosePerMetricTon: 0.5,
    // ...
  },
});
```

### Retrieving Audit History

```typescript
// Get audit history for a specific entity
const history = await auditService.getEntityAuditHistory(
  "EnzymeConfiguration",
  "config123"
);

// Get audit history for a user
const userHistory = await auditService.getUserAuditHistory("user123", {
  limit: 20,
  entityType: "SystemConfiguration",
  startDate: new Date("2024-01-01"),
});

// Get all audit logs with filtering
const logs = await auditService.getAuditLogs({
  action: AuditAction.UPDATE,
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-12-31"),
});
```

### Manual Audit Logging

For cases where you need manual control:

```typescript
await auditService.logChange({
  entityType: "CustomEntity",
  entityId: "entity123",
  action: AuditAction.UPDATE,
  oldValues: { name: "old name" },
  newValues: { name: "new name" },
  userId: "user123",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
});
```

## Features

### Automatic Change Detection

- For UPDATE operations, only changed fields are logged
- Skips audit entries if no actual changes occurred
- Handles nested objects and arrays

### Security

- Automatically removes sensitive fields (password, token, secret)
- Sanitizes data before logging
- Validates user context before logging

### Performance

- Uses database indexes for efficient querying
- Minimal overhead on database operations
- Graceful failure - audit failures don't break main operations

### Flexibility

- Configurable which models to audit
- Optional fields (IP address, user agent)
- Supports pagination and filtering
- Easy to extend for new requirements

## Error Handling

The audit system is designed to be non-intrusive:

- Audit failures don't break main database operations
- Comprehensive logging for debugging
- Graceful handling of missing user context

## Testing

Run the audit middleware tests:

```bash
npm test -- audit-middleware.service.spec.ts
```

## Monitoring

Monitor audit logs through:

- Database queries on the `AuditLog` table
- Application logs for audit-related events
- Custom dashboards using the audit service methods

## Best Practices

1. **Model Selection**: Only audit models that require compliance tracking
2. **Data Retention**: Implement cleanup for old audit logs using `deleteOldAuditLogs()`
3. **Performance**: Monitor database performance with audit logging enabled
4. **Security**: Ensure sensitive data is properly excluded from audit logs
5. **Testing**: Test audit functionality in staging environments before production

# Audit Log System - GraphQL API

This document describes the GraphQL API for the audit log system, which provides read-only access to audit trail data for compliance, security monitoring, and troubleshooting purposes.

## Overview

The audit log system automatically tracks all changes to entities in the system, providing a comprehensive audit trail. The GraphQL API offers flexible querying capabilities with proper authentication, authorization, and rate limiting.

## Features

- **Read-only Operations**: All GraphQL operations are read-only (queries only, no mutations)
- **Comprehensive Filtering**: Filter by entity type, entity ID, action, user, date range, etc.
- **Pagination Support**: Efficient pagination with configurable page sizes
- **User Context**: Includes user information for each audit entry
- **Rate Limiting**: Prevents abuse with configurable rate limits
- **Authentication & Authorization**: Secure access with role-based permissions
- **GraphQL Native**: Designed specifically for GraphQL contexts with proper guard handling

## Implementation Details

### GraphQL-Specific Guards

The resolver uses GraphQL-specific guards to handle the different context structure:

- **`GqlDefaultAuthGuard`**: GraphQL-compatible authentication guard
- **`GqlACGuard`**: GraphQL-compatible access control guard
- **`CustomThrottlerGuard`**: Custom throttling guard that handles both HTTP and GraphQL contexts

### Rate Limiting

Different endpoints have different rate limits:

- `auditLogs`: 100 requests per minute
- `entityAuditHistory`: 100 requests per minute
- `userAuditHistory`: 100 requests per minute
- `auditLog`: 200 requests per minute
- `formattedAuditSummary`: 50 requests per minute

## Troubleshooting

### Common Issues

#### 1. "Cannot read properties of undefined (reading 'headers')"

**Cause**: Using HTTP-specific guards in GraphQL context
**Solution**: Ensure you're using GraphQL-specific guards (`GqlDefaultAuthGuard`, `GqlACGuard`)

#### 2. "Cannot read properties of undefined (reading 'ip')"

**Cause**: Using standard `ThrottlerGuard` in GraphQL context
**Solution**: Use `CustomThrottlerGuard` which handles GraphQL contexts properly

#### 3. Authentication/Authorization Errors

**Cause**: Missing or incorrect permissions
**Solution**: Ensure the user has `AuditLog:read` permissions in their role

#### 4. Rate Limiting Issues

**Cause**: Exceeding rate limits
**Solution**: Reduce request frequency or increase rate limits if needed

### Testing the API

Use the simple test query to verify the endpoint is working:

```graphql
query TestAuditLogs {
  auditLogs(page: 1, limit: 5) {
    data {
      id
      entityType
      action
      createdAt
    }
    total
    page
    limit
  }
}
```

## Available Queries

### 1. auditLogs

Get paginated audit logs with comprehensive filtering options.

```graphql
query GetAuditLogs($page: Int, $limit: Int, $filters: AuditLogFilterInput) {
  auditLogs(page: $page, limit: $limit, filters: $filters) {
    data {
      id
      entityType
      entityId
      action
      oldValues
      newValues
      user {
        username
        firstName
        lastName
      }
      createdAt
    }
    total
    page
    limit
    totalPages
    hasNextPage
    hasPreviousPage
  }
}
```

**Parameters:**

- `page` (Int, optional): Page number (1-based, default: 1)
- `limit` (Int, optional): Items per page (1-100, default: 20)
- `sortBy` (String, optional): Field to sort by (default: "createdAt")
- `sortOrder` (String, optional): Sort order "asc" or "desc" (default: "desc")
- `filters` (AuditLogFilterInput, optional): Filter criteria

**Rate Limit:** 100 requests per minute

### 2. entityAuditHistory

Get audit history for a specific entity.

```graphql
query GetEntityAuditHistory(
  $entityType: String!
  $entityId: String!
  $page: Int
  $limit: Int
) {
  entityAuditHistory(
    entityType: $entityType
    entityId: $entityId
    page: $page
    limit: $limit
  ) {
    data {
      id
      action
      oldValues
      newValues
      user {
        username
      }
      createdAt
    }
    total
    totalPages
  }
}
```

**Parameters:**

- `entityType` (String, required): Type of entity (e.g., "EnzymeConfiguration")
- `entityId` (String, required): ID of the entity
- `page` (Int, optional): Page number (default: 1)
- `limit` (Int, optional): Items per page (default: 20)

**Rate Limit:** 100 requests per minute

### 3. userAuditHistory

Get audit history for a specific user.

```graphql
query GetUserAuditHistory(
  $userId: String!
  $page: Int
  $limit: Int
  $entityType: String
  $action: AuditAction
) {
  userAuditHistory(
    userId: $userId
    page: $page
    limit: $limit
    entityType: $entityType
    action: $action
  ) {
    data {
      id
      entityType
      entityId
      action
      oldValues
      newValues
      createdAt
    }
    total
    totalPages
  }
}
```

**Parameters:**

- `userId` (String, required): User ID
- `page` (Int, optional): Page number (default: 1)
- `limit` (Int, optional): Items per page (default: 20)
- `entityType` (String, optional): Filter by entity type
- `action` (AuditAction, optional): Filter by action type
- `startDate` (String, optional): Filter by start date (ISO 8601)
- `endDate` (String, optional): Filter by end date (ISO 8601)

**Rate Limit:** 100 requests per minute

### 4. auditLog

Get a specific audit log by ID.

```graphql
query GetAuditLogById($id: String!) {
  auditLog(id: $id) {
    id
    globalId
    entityType
    entityId
    action
    oldValues
    newValues
    user {
      id
      username
      firstName
      lastName
    }
    ipAddress
    userAgent
    createdAt
    updatedAt
  }
}
```

**Parameters:**

- `id` (String, required): Audit log ID

**Rate Limit:** 200 requests per minute

### 5. formattedAuditSummary

Get formatted audit logs for display purposes.

```graphql
query GetFormattedAuditSummary(
  $limit: Int
  $entityType: String
  $entityId: String
) {
  formattedAuditSummary(
    limit: $limit
    entityType: $entityType
    entityId: $entityId
  ) {
    id
    timestamp
    action
    entity
    user
    changes
    ipAddress
  }
}
```

**Parameters:**

- `limit` (Int, optional): Number of items (max 100, default: 50)
- `entityType` (String, optional): Filter by entity type
- `entityId` (String, optional): Filter by entity ID

**Rate Limit:** 50 requests per minute

## Authentication & Authorization

### Authentication

All queries require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Authorization

Access to audit logs is controlled by role-based permissions:

- **Admin roles**: Full read access to all audit logs (`read:any`)
- **Operator roles**: Full read access to all audit logs (`read:any`)
- **User roles**: Limited access to own audit logs (`read:own`)

The system uses the `AuditLog` resource with `read` action for permission checks.

## Rate Limiting

Rate limits are applied per user to prevent abuse:

- **General queries** (auditLogs, entityAuditHistory, userAuditHistory): 100 requests/minute
- **Single item queries** (auditLog): 200 requests/minute
- **Formatted summary**: 50 requests/minute

## Error Handling

### Common Error Responses

#### 401 Unauthorized

```json
{
  "errors": [
    {
      "message": "Unauthorized",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

#### 403 Forbidden

```json
{
  "errors": [
    {
      "message": "Forbidden resource",
      "extensions": {
        "code": "FORBIDDEN"
      }
    }
  ]
}
```

#### 404 Not Found

```json
{
  "errors": [
    {
      "message": "Audit log with ID xyz not found",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ]
}
```

#### 429 Too Many Requests

```json
{
  "errors": [
    {
      "message": "ThrottlerException: Too Many Requests",
      "extensions": {
        "code": "THROTTLED"
      }
    }
  ]
}
```

## Example Usage

### Get Recent Configuration Changes

```graphql
query GetRecentConfigChanges {
  auditLogs(
    page: 1
    limit: 10
    filters: {
      entityType: "EnzymeConfiguration"
      action: UPDATE
      startDate: "2024-01-01T00:00:00.000Z"
    }
  ) {
    data {
      id
      entityId
      action
      user {
        username
      }
      createdAt
      oldValues
      newValues
    }
    total
  }
}
```

### Track User Activity

```graphql
query GetUserActivity($userId: String!) {
  userAuditHistory(userId: $userId, page: 1, limit: 20) {
    data {
      id
      entityType
      entityId
      action
      createdAt
    }
    total
    totalPages
  }
}
```

### Monitor Specific Entity

```graphql
query MonitorEntity($entityType: String!, $entityId: String!) {
  entityAuditHistory(entityType: $entityType, entityId: $entityId) {
    data {
      id
      action
      user {
        username
        firstName
        lastName
      }
      createdAt
      changes: oldValues
    }
  }
}
```

## Performance Considerations

1. **Pagination**: Always use pagination for large result sets
2. **Filtering**: Use specific filters to reduce query scope
3. **Rate Limits**: Respect rate limits to avoid throttling
4. **Field Selection**: Only request fields you need to reduce payload size
5. **Caching**: Consider caching frequently accessed audit data

## Security Considerations

1. **Sensitive Data**: Audit logs may contain sensitive information in oldValues/newValues
2. **Access Control**: Ensure proper role-based access control
3. **Data Retention**: Consider implementing data retention policies
4. **Monitoring**: Monitor access patterns for suspicious activity

## Files Structure

```
src/audit/
├── audit.resolver.ts              # GraphQL resolver
├── audit.resolver.spec.ts         # Resolver tests
├── audit.service.ts               # Business logic service
├── audit.controller.ts            # REST API controller
├── audit.module.ts                # NestJS module
├── dto/
│   ├── audit-log-graphql.dto.ts   # GraphQL DTOs
│   └── index.ts                   # DTO exports
├── examples/
│   └── audit-log-queries.graphql  # Example queries
└── README.md                      # This documentation
```

## Related Documentation

- [Audit Service Documentation](./audit.service.ts)
- [REST API Documentation](./audit.controller.ts)
- [Permission System Documentation](../auth/optimized-permission.service.ts)
- [GraphQL Schema Documentation](./dto/audit-log-graphql.dto.ts)
