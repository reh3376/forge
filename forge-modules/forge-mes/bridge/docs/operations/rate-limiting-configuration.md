# Rate Limiting Configuration

This document outlines the rate limiting configuration for the WHK Recipe Configuration application.

## Overview

The application uses NestJS's `@nestjs/throttler` package to implement rate limiting across different endpoints. Rate limits are configurable via environment variables to allow for different settings across environments.

## Global Rate Limits

These apply to all endpoints unless overridden by specific endpoint limits:

| Environment Variable | Default Value | Description |
|---------------------|---------------|-------------|
| `THROTTLE_SHORT_LIMIT` | 20 | Requests per second (1 second TTL) |
| `THROTTLE_MEDIUM_LIMIT` | 300 | Requests per minute (60 second TTL) |
| `THROTTLE_LONG_LIMIT` | 3000 | Requests per 15 minutes (900 second TTL) |

## Enzyme Configuration Endpoints

| Environment Variable | Default Value | Description |
|---------------------|---------------|-------------|
| `ENZYME_CREATE_LIMIT` | 15 | Create operations per minute |
| `ENZYME_UPDATE_LIMIT` | 25 | Update operations per minute |
| `ENZYME_DELETE_LIMIT` | 15 | Soft delete operations per minute |
| `ENZYME_HARD_DELETE_LIMIT` | 5 | Hard delete operations per minute |
| `ENZYME_BULK_CREATE_LIMIT` | 5 | Bulk create operations per 5 minutes |
| `ENZYME_BULK_UPDATE_LIMIT` | 8 | Bulk update operations per 5 minutes |
| `ENZYME_BULK_DELETE_LIMIT` | 5 | Bulk delete operations per 5 minutes |
| `ENZYME_CALCULATION_LIMIT` | 30 | Calculation operations per minute |

## System Configuration Endpoints

| Environment Variable | Default Value | Description |
|---------------------|---------------|-------------|
| `SYSTEM_CONFIG_CREATE_LIMIT` | 20 | Create operations per minute |

## Audit Endpoints

Audit endpoints have fixed rate limits (not currently configurable via environment variables):

### REST API Endpoints
- General queries: 30 requests per minute
- Entity/User history: 20 requests per minute
- Single audit log: 50 requests per minute
- Formatted summary: 20 requests per minute

### GraphQL Endpoints
- Most queries: 100 requests per minute
- Single audit log: 200 requests per minute
- Formatted summary: 50 requests per minute

## Configuration Examples

### Development Environment
```bash
# More lenient limits for development
THROTTLE_SHORT_LIMIT=50
THROTTLE_MEDIUM_LIMIT=500
THROTTLE_LONG_LIMIT=5000

ENZYME_CREATE_LIMIT=30
ENZYME_UPDATE_LIMIT=50
ENZYME_CALCULATION_LIMIT=100
```

### Production Environment
```bash
# Stricter limits for production
THROTTLE_SHORT_LIMIT=20
THROTTLE_MEDIUM_LIMIT=300
THROTTLE_LONG_LIMIT=3000

ENZYME_CREATE_LIMIT=15
ENZYME_UPDATE_LIMIT=25
ENZYME_CALCULATION_LIMIT=30
```

### High-Traffic Environment
```bash
# Higher limits for high-traffic scenarios
THROTTLE_SHORT_LIMIT=30
THROTTLE_MEDIUM_LIMIT=600
THROTTLE_LONG_LIMIT=6000

ENZYME_CREATE_LIMIT=25
ENZYME_UPDATE_LIMIT=40
ENZYME_CALCULATION_LIMIT=50
```

## Implementation Details

### Custom Throttler Guard

The application uses a `CustomThrottlerGuard` that extends the standard NestJS `ThrottlerGuard` to handle both HTTP and GraphQL contexts properly.

### Rate Limit Headers

When rate limits are exceeded, the API returns:
- Status Code: 429 (Too Many Requests)
- Error Message: "ThrottlerException: Too Many Requests"

### Monitoring

Rate limiting events should be monitored in production to:
1. Identify potential abuse patterns
2. Adjust limits based on actual usage patterns
3. Ensure legitimate users aren't being blocked

## Recommendations

1. **Start Conservative**: Begin with the default values and monitor usage patterns
2. **Environment-Specific**: Use different limits for development, staging, and production
3. **Monitor and Adjust**: Regularly review rate limiting logs and adjust as needed
4. **User Communication**: Provide clear error messages when rate limits are exceeded
5. **Gradual Increases**: When increasing limits, do so gradually and monitor the impact

## Recent Changes

- **2024-01-XX**: Increased global limits from very restrictive defaults
- **2024-01-XX**: Made enzyme configuration limits environment-configurable
- **2024-01-XX**: Increased bulk operation limits from extremely restrictive values
- **2024-01-XX**: Added system configuration environment variables 