# MQTT Secrets Management Setup

This document explains how to configure MQTT secrets using Azure Key Vault for secure credential and certificate management.

## Overview

The MQTT service now supports retrieving credentials and certificates from Azure Key Vault, providing enhanced security by keeping sensitive information out of the database and configuration files.

## Supported Secret Types

### Global MQTT Secrets

- `MqttUsername` - Default username for all MQTT brokers
- `MqttPassword` - Default password for all MQTT brokers
- `MqttClientCertificate` - Default client certificate (PEM format)
- `MqttClientPrivateKey` - Default client private key (PEM format)
- `MqttCaCertificate` - Default CA certificate (PEM format)

### Broker-Specific Secrets

For broker-specific credentials, append the broker ID to the secret name:

- `MqttBrokerUsername-{brokerId}` - Username for specific broker
- `MqttBrokerPassword-{brokerId}` - Password for specific broker
- `MqttBrokerClientCert-{brokerId}` - Client certificate for specific broker
- `MqttBrokerClientKey-{brokerId}` - Client private key for specific broker
- `MqttBrokerCaCert-{brokerId}` - CA certificate for specific broker

## Setup Instructions

### 1. Azure Key Vault Configuration

Ensure your Azure Key Vault is configured and accessible:

```bash
# Set environment variables
export AZURE_VAULT_NAME="your-keyvault-name"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
export AZURE_TENANT_ID="your-tenant-id"
```

### 2. Adding MQTT Secrets

#### Using Azure CLI:

```bash
# Global credentials
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttUsername" --value "mqtt-user"
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttPassword" --value "mqtt-password"

# Broker-specific credentials (replace 'broker123' with actual broker ID)
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttBrokerUsername-broker123" --value "broker-specific-user"
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttBrokerPassword-broker123" --value "broker-specific-password"

# Certificates (from files)
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttClientCertificate" --file "client.crt"
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttClientPrivateKey" --file "client.key"
az keyvault secret set --vault-name "your-keyvault-name" --name "MqttCaCertificate" --file "ca.crt"
```

#### Using Azure Portal:

1. Navigate to your Key Vault in the Azure Portal
2. Go to "Secrets" section
3. Click "Generate/Import"
4. Enter the secret name and value
5. Click "Create"

### 3. Certificate Format

Certificates should be stored in PEM format. Example:

```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/OvD...
...certificate content...
-----END CERTIFICATE-----
```

### 4. Fallback Behavior

The system implements a fallback hierarchy:

1. **Broker-specific secrets** (highest priority)
2. **Global MQTT secrets**
3. **Database configuration** (lowest priority)
4. **File system certificates** (if no secrets available)

## Usage Examples

### Checking Secrets Status

```typescript
// Get secrets status for all brokers
const status = await mqttService.getSecretsStatus();

// Validate secrets for a specific broker
const validation = await mqttService.validateBrokerSecrets("broker123");
console.log("Has secrets:", validation.hasSecrets);
console.log("TLS valid:", validation.tlsValidation.valid);
console.log("Auth valid:", validation.authValidation.valid);
```

### Managing Secrets Cache

```typescript
// Clear all secrets cache
mqttService.clearSecretsCache();

// Clear cache for specific broker
mqttService.clearBrokerSecretsCache("broker123");

// Reload secrets and reconnect
await mqttService.reloadBrokerSecrets("broker123");
```

## Security Best Practices

1. **Use broker-specific secrets** when possible for better isolation
2. **Rotate secrets regularly** using Azure Key Vault versioning
3. **Monitor secret access** using Azure Key Vault logs
4. **Use managed identities** instead of service principals when possible
5. **Implement proper RBAC** for Key Vault access

## Troubleshooting

### Common Issues

1. **Secret not found**: Check secret name spelling and ensure it exists in Key Vault
2. **Access denied**: Verify Azure credentials and Key Vault permissions
3. **Certificate format errors**: Ensure certificates are in PEM format
4. **Cache issues**: Clear secrets cache and retry connection

### Debugging

Enable debug logging to see secret retrieval details:

```typescript
// The service logs secret source information
// Check logs for messages like:
// "Using username from secrets management for broker..."
// "Using username from database configuration for broker..."
```

### Monitoring

The MQTT service provides authentication events that can be monitored:

```typescript
mqttService.getAuthenticationEventObservable().subscribe((event) => {
  console.log("Auth event:", event);
});
```

## Environment Variables

Required environment variables:

- `AZURE_VAULT_NAME` - Name of your Azure Key Vault
- `AZURE_CLIENT_ID` - Azure service principal client ID
- `AZURE_CLIENT_SECRET` - Azure service principal client secret
- `AZURE_TENANT_ID` - Azure tenant ID
- `MQTT_CERT_DIR` - Directory for fallback certificate files (optional)

## Migration from File-based Certificates

To migrate from file-based certificates to Azure Key Vault:

1. Upload existing certificates to Key Vault using the naming convention above
2. Test the connection with a single broker
3. Gradually migrate all brokers
4. Remove file-based certificates once migration is complete

The system will automatically fall back to file-based certificates if secrets are not available, ensuring zero-downtime migration.
