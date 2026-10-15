# MQTT Brokers Configuration UI

This page provides a comprehensive interface for managing MQTT broker configurations in the Manufacturing Execution System (MES). The UI integrates with the backend API and provides real-time connection monitoring through WebSocket connections.

## Features

### 🔧 Broker Management
- **Create/Edit/Delete** MQTT broker configurations
- **Real-time connection status** monitoring via WebSocket
- **Test connections** to verify broker accessibility
- **TLS/SSL support** with certificate validation options
- **Topic subscription management** with JSON-based configuration

### 🛡️ Certificate Management
- **Certificate health monitoring** with status indicators
- **Automatic certificate rotation** tracking
- **Manual certificate rotation** for emergency situations
- **Certificate expiry warnings** and alerts
- **Health summary dashboard** showing overall certificate status

### 📊 Real-time Monitoring
- **Live connection status** updates via WebSocket
- **Connection health indicators** (Connected/Disconnected/Unknown)
- **Certificate status badges** (Healthy/Warning/Critical/Failed)
- **Automatic status refresh** when brokers are modified

## API Integration

### REST Endpoints
The UI integrates with the following backend endpoints:

#### Broker Configuration
- `GET /unsBrokerConfigurations` - Fetch all broker configurations
- `GET /unsBrokerConfigurations/:id` - Get specific broker configuration
- `POST /unsBrokerConfigurations` - Create new broker configuration
- `PUT /unsBrokerConfigurations/:id` - Update broker configuration
- `DELETE /unsBrokerConfigurations/:id` - Delete broker configuration
- `POST /unsBrokerConfigurations/:id/test-connection` - Test broker connection

#### Certificate Management
- `GET /certificate-rotation/health` - Get overall certificate health
- `GET /certificate-rotation/status` - Get all certificate statuses
- `GET /certificate-rotation/status/:brokerId` - Get broker-specific certificate status
- `POST /certificate-rotation/check` - Trigger manual certificate check
- `POST /certificate-rotation/rotate/:brokerId/:certificateType` - Force certificate rotation
- `GET /certificate-rotation/config` - Get rotation configuration
- `POST /certificate-rotation/config` - Update rotation configuration

#### Connection Status
- `GET /mqtt/status` - Get current MQTT connection status

### WebSocket Integration
Real-time updates are provided through WebSocket connections:

#### Events
- `mqtt:connection_status` - Broker connection status updates
- `mqtt:status` - General MQTT events
- `mqtt:error` - Error notifications

#### Commands
- `mqtt:get_status` - Request current status
- `mqtt:get_stats` - Request statistics

## Configuration Schema

### Broker Configuration
```typescript
interface UnsBrokerConfiguration {
  id: string
  host: string                    // MQTT broker hostname/IP
  port: number | null            // MQTT broker port (default: 1883)
  protocol: string | null        // Protocol (mqtt://, mqtts://, ws://, wss://)
  username: string | null        // Authentication username
  password?: string | null       // Authentication password (stored securely)
  tls: boolean | null           // Enable TLS/SSL
  validateCertificate: boolean | null  // Validate SSL certificates
  baseTopicPath: string | null   // Base topic path for subscriptions
  subscriptions: string[] | null // Array of topic patterns
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string | null
}
```

### Certificate Status
```typescript
interface CertificateStatus {
  brokerId: string
  certificateType: 'client' | 'ca'
  rotationStatus: 'healthy' | 'warning' | 'critical' | 'failed'
  daysUntilExpiry: number
  lastRotation: string | null
  nextRotation: string | null
  errorMessage?: string
}
```

## Security Features

### Azure Key Vault Integration
- **Secure credential storage** using Azure Key Vault
- **Automatic credential rotation** with health monitoring
- **Certificate lifecycle management** with expiry tracking
- **Encrypted password storage** (passwords not displayed in UI)

### Access Control
- **Role-based permissions** using `ManufacturingPermission.SYSTEM_SETTINGS`
- **Route protection** with authentication guards
- **Audit logging** for configuration changes

## User Interface

### Main Features
1. **Broker List Table** - Shows all configured brokers with status
2. **Certificate Health Summary** - Overview of certificate status across all brokers
3. **Create/Edit Dialog** - Form for broker configuration
4. **Real-time Status Indicators** - Live connection and certificate status
5. **Action Buttons** - Edit, Test, Rotate Certificates, Delete

### Status Indicators
- **Connection Status**: Green (Connected), Red (Disconnected), Gray (Unknown)
- **Certificate Status**: Green (Healthy), Yellow (Warning), Red (Critical/Failed)
- **WebSocket Status**: Live/Offline indicator in header

### Form Validation
- **Required fields**: Host and Port
- **JSON validation**: Subscriptions must be valid JSON array
- **Port validation**: Must be valid port number
- **Protocol validation**: Supports mqtt://, mqtts://, ws://, wss://

## Error Handling

### API Errors
- **Network errors** with automatic retry logic
- **Authentication errors** with redirect to login
- **Validation errors** with user-friendly messages
- **Server errors** with detailed error information

### WebSocket Errors
- **Connection failures** with reconnection attempts
- **Message errors** with error notifications
- **Timeout handling** with status indicators

## Development Notes

### Dependencies
- **React 18** with hooks for state management
- **Socket.IO Client** for WebSocket communication
- **Axios** for HTTP requests with interceptors
- **Lucide React** for icons
- **Tailwind CSS** for styling

### State Management
- **Local state** using React hooks
- **Real-time updates** via WebSocket listeners
- **Error boundaries** for graceful error handling
- **Loading states** for better UX

### Performance Optimizations
- **Debounced API calls** to prevent excessive requests
- **Memoized components** for efficient re-renders
- **Lazy loading** for large broker lists
- **Connection pooling** for WebSocket efficiency

## Troubleshooting

### Common Issues
1. **WebSocket connection fails**: Check NEXT_PUBLIC_SOCKET_URL environment variable
2. **API calls fail**: Verify NEXT_PUBLIC_API_BASE_URL and authentication
3. **Certificate status not updating**: Check certificate rotation service health
4. **Connection test fails**: Verify broker configuration and network connectivity

### Debug Information
- **Browser console** shows detailed WebSocket and API logs
- **Network tab** for API request/response inspection
- **Component state** visible in React DevTools
- **Error boundaries** catch and display component errors

## Future Enhancements

### Planned Features
- **Bulk operations** for multiple broker management
- **Configuration templates** for common setups
- **Advanced filtering** and search capabilities
- **Export/Import** functionality for configurations
- **Metrics dashboard** with historical data
- **Alert management** for certificate expiry and connection issues 