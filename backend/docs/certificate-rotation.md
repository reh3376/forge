# Certificate Rotation for MQTT Connections

This document describes the automated certificate rotation system for MQTT broker connections in the Whiskey House Recipe Configuration application.

## Overview

The Certificate Rotation Service provides automated monitoring and rotation of TLS certificates used for secure MQTT connections. It ensures that certificates are renewed before expiration, maintaining uninterrupted secure communication with MQTT brokers.

## Features

- **Automated Certificate Monitoring**: Continuously monitors certificate expiration dates
- **Proactive Rotation**: Automatically rotates certificates before they expire
- **Graceful Connection Handling**: Restarts MQTT connections without service disruption
- **Rollback Mechanism**: Automatically rolls back failed certificate updates
- **Health Monitoring**: Provides health endpoints for monitoring certificate status
- **Event Tracking**: Emits events for certificate rotation activities
- **Configurable Thresholds**: Customizable warning and critical thresholds

## Architecture

### Components

1. **CertificateRotationService**: Core service handling certificate monitoring and rotation
2. **CertificateRotationController**: REST API endpoints for management and monitoring
3. **Azure Key Vault Integration**: Secure storage and versioning of certificates
4. **MQTT Service Integration**: Seamless integration with existing MQTT connections

### Certificate Types

- **Client Certificates**: Used for client authentication with MQTT brokers
- **CA Certificates**: Certificate Authority certificates for validating broker certificates

## Configuration

### Environment Variables

```bash
# Certificate rotation thresholds (days)
CERT_WARNING_THRESHOLD_DAYS=30
CERT_CRITICAL_THRESHOLD_DAYS=7

# Rotation behavior
CERT_ENABLE_AUTO_ROTATION=true
CERT_MAX_RETRY_ATTEMPTS=3
CERT_RETRY_DELAY_MINUTES=5
CERT_ROLLBACK_ON_FAILURE=true
```

### Default Configuration

```typescript
{
  warningThresholdDays: 30,      // Emit warnings 30 days before expiration
  criticalThresholdDays: 7,      // Auto-rotate 7 days before expiration
  autoRotationEnabled: true,     // Enable automatic rotation
  maxRetryAttempts: 3,          // Maximum retry attempts for failed rotations
  retryDelayMs: 5000,           // Delay between retry attempts
  rollbackOnFailure: true       // Rollback on rotation failure
}
```

## API Endpoints

### Health Status

```http
GET /certificate-rotation/health
```

Returns the overall health status of the certificate rotation service.

**Response:**

```json
{
  "status": "healthy|degraded|unhealthy",
  "totalCertificates": 10,
  "healthyCertificates": 8,
  "warningCertificates": 1,
  "criticalCertificates": 1,
  "failedCertificates": 0,
  "lastCheck": "2024-01-15T10:30:00Z"
}
```

### Certificate Status

```http
GET /certificate-rotation/status
```

Returns detailed status for all certificates.

```http
GET /certificate-rotation/status/{brokerId}
```

Returns certificate status for a specific broker.

**Response:**

```json
[
  {
    "brokerId": "broker-001",
    "certificateType": "client",
    "expirationDate": "2024-02-15T00:00:00Z",
    "daysUntilExpiration": 31,
    "isExpired": false,
    "isNearExpiration": false,
    "rotationStatus": "healthy"
  }
]
```

### Manual Operations

```http
POST /certificate-rotation/check
```

Manually trigger certificate check for all brokers.

```http
POST /certificate-rotation/rotate/{brokerId}/{certificateType}
```

Force certificate rotation for a specific broker and certificate type.

**Parameters:**

- `brokerId`: The ID of the MQTT broker
- `certificateType`: Either `client` or `ca`

### Configuration Management

```http
GET /certificate-rotation/config
```

Get current rotation configuration.

```http
POST /certificate-rotation/config
```

Update rotation configuration.

**Request Body:**

```json
{
  "warningThresholdDays": 30,
  "criticalThresholdDays": 7,
  "autoRotationEnabled": true,
  "maxRetryAttempts": 3,
  "retryDelayMs": 5000,
  "rollbackOnFailure": true
}
```

## Certificate Rotation Process

### 1. Certificate Monitoring

The service runs scheduled checks every day at 2 AM to:

- Query all TLS-enabled MQTT brokers from the database
- Retrieve certificates from Azure Key Vault
- Parse certificate expiration dates
- Classify certificates by status (healthy, warning, critical, failed)

### 2. Automatic Rotation Trigger

Certificates are automatically rotated when:

- Days until expiration ≤ `criticalThresholdDays`
- Certificate is already expired
- Auto-rotation is enabled
- No rotation is currently in progress for that certificate

### 3. Rotation Process

1. **Backup Current Certificate**: Store current certificate for rollback
2. **Fetch New Certificate**: Get latest version from Azure Key Vault
3. **Validate New Certificate**: Ensure new certificate is valid and not expired
4. **Update Secrets**: Update certificate in secrets management system
5. **Restart Connections**: Gracefully restart MQTT connections
6. **Verify Connection**: Test that new certificate works correctly
7. **Emit Events**: Notify about successful rotation

### 4. Failure Handling

If rotation fails:

1. **Rollback**: Restore previous certificate if rollback is enabled
2. **Retry Logic**: Retry with exponential backoff up to max attempts
3. **Event Emission**: Emit failure events for monitoring
4. **Logging**: Log detailed error information

## Event System

The service emits events for monitoring and alerting:

### Event Types

- `rotation_started`: Certificate rotation has begun
- `rotation_completed`: Certificate rotation completed successfully
- `rotation_failed`: Certificate rotation failed
- `expiration_warning`: Certificate is approaching expiration

### Event Structure

```typescript
{
  brokerId: string;
  certificateType: 'client' | 'ca';
  eventType: 'rotation_started' | 'rotation_completed' | 'rotation_failed' | 'expiration_warning';
  timestamp: Date;
  details?: string;
  error?: string;
}
```

## Azure Key Vault Integration

### Certificate Storage

Certificates are stored in Azure Key Vault with the following naming convention:

- Client certificates: `MqttClientCertificate-{brokerId}`
- CA certificates: `MqttCaCertificate-{brokerId}`
- Private keys: `MqttClientPrivateKey-{brokerId}`

### Versioning

Azure Key Vault automatically versions certificates. The rotation service:

- Fetches the latest version during rotation
- Maintains version history for rollback capabilities
- Supports manual version selection if needed

## Monitoring and Alerting

### Health Checks

The service provides health endpoints that can be integrated with monitoring systems:

- **Healthy**: All certificates are valid and not approaching expiration
- **Degraded**: Some certificates are approaching expiration (warning threshold)
- **Unhealthy**: Some certificates are expired or critically close to expiration

### Metrics

Key metrics to monitor:

- Certificate expiration dates
- Rotation success/failure rates
- Time since last successful rotation
- Number of certificates in each status category

### Alerting

Recommended alerts:

- Certificate expires in < 7 days
- Certificate rotation failed
- Service health is degraded or unhealthy
- No certificate check performed in > 25 hours

## Security Considerations

### Access Control

- Certificate rotation endpoints require appropriate RBAC permissions
- Azure Key Vault access is controlled via managed identities
- Audit logs are maintained for all certificate operations

### Certificate Validation

- New certificates are validated before deployment
- Certificate chain validation ensures proper trust relationships
- Expiration dates are verified to prevent deployment of expired certificates

### Rollback Safety

- Previous certificates are backed up before rotation
- Automatic rollback on connection failures
- Manual rollback capabilities for emergency situations

## Troubleshooting

### Common Issues

1. **Rotation Fails with "No new certificate version available"**

   - Ensure new certificates are uploaded to Azure Key Vault
   - Check Key Vault permissions and connectivity

2. **Connection Verification Fails**

   - Verify MQTT broker is accepting the new certificate
   - Check certificate chain and trust relationships
   - Ensure private key matches the certificate

3. **Rollback Fails**
   - Check if previous certificate backup exists
   - Verify Azure Key Vault connectivity
   - Manual intervention may be required

### Debugging

Enable debug logging to troubleshoot issues:

```typescript
// In your logging configuration
{
  level: 'debug',
  categories: ['CertificateRotationService']
}
```

### Manual Recovery

If automatic rotation fails completely:

1. Check service logs for error details
2. Verify Azure Key Vault connectivity and permissions
3. Manually upload new certificates to Key Vault
4. Use the force rotation API endpoint
5. Monitor connection status after rotation

## Best Practices

### Certificate Management

- Upload new certificates to Azure Key Vault well before expiration
- Use certificate templates for consistent certificate properties
- Maintain proper certificate chain relationships
- Test certificates in staging environment before production

### Monitoring

- Set up proactive monitoring for certificate expiration
- Monitor rotation success rates and failure patterns
- Implement alerting for critical certificate events
- Regular health checks of the rotation service

### Operational

- Schedule certificate renewals during maintenance windows when possible
- Test rollback procedures regularly
- Maintain documentation of certificate dependencies
- Keep emergency contact information for certificate authorities

## Integration with Existing Systems

### MQTT Service

The certificate rotation service integrates seamlessly with the existing MQTT service:

- Uses existing connection management
- Leverages current secrets management system
- Maintains compatibility with existing broker configurations

### Secrets Management

Integrates with the existing Azure Key Vault secrets management:

- Uses same authentication mechanisms
- Follows existing naming conventions
- Maintains cache consistency

### Database

Uses existing Prisma database connections:

- Queries broker configurations
- Maintains audit trails
- Stores rotation metadata

This certificate rotation system ensures that MQTT connections remain secure and operational without manual intervention, providing enterprise-grade certificate lifecycle management.
