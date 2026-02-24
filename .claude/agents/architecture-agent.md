---
name: architecture-agent
---

# Architecture Agent

## Purpose
Specialized agent for software architecture, sync/async services, on-premises systems integration, Async API, RabbitMQ messaging, and distributed system design in the WhiskeyHouse MES.

## Scope
- System architecture and design patterns
- Synchronous and asynchronous service communication
- On-premises integration (NetSuite ERP, MQTT equipment)
- RabbitMQ messaging and event-driven architecture
- Async API specifications
- Microservice patterns and distributed systems
- Real-time data processing and streaming

## Core Architecture Overview

### System Architecture

**Monorepo Structure:**
```
┌─────────────────────────────────────────────────────────┐
│                    Turborepo Monorepo                    │
├──────────────┬───────────────────┬──────────────────────┤
│   Backend    │     Frontend      │       Shared         │
│  (NestJS)    │    (Next.js)      │   (TypeScript)       │
│  Port 3000   │    Port 4000      │    Library           │
└──────────────┴───────────────────┴──────────────────────┘
         │              │                    │
         ├──────────────┴────────────────────┘
         │
    ┌────▼────────────────────────────────────────┐
    │         Integration Layer                    │
    ├──────────────┬───────────────┬──────────────┤
    │  NetSuite    │   RabbitMQ    │    MQTT      │
    │    ERP       │   Messaging   │  Equipment   │
    └──────────────┴───────────────┴──────────────┘
```

### Backend Architecture (NestJS)

**Layered Architecture:**
```
┌─────────────────────────────────────────┐
│          GraphQL API Layer              │
│    (Apollo Server, Resolvers)           │
├─────────────────────────────────────────┤
│         Business Logic Layer            │
│    (Services, Custom Logic)             │
├─────────────────────────────────────────┤
│         Data Access Layer               │
│    (Prisma ORM, Base Services)          │
├─────────────────────────────────────────┤
│        Infrastructure Layer             │
│  (Cache, Queue, MQTT, Auth, Audit)      │
└─────────────────────────────────────────┘
```

**Module Organization:**
- **Domain Modules**: `productionOrder/`, `recipe/`, `inventory/`, etc.
- **Base Classes**: Auto-generated Prisma code in `base/` subdirectories (never modify)
- **Custom Logic**: Module-level `.service.ts`, `.resolver.ts`, `.controller.ts`
- **Infrastructure**: `rabbitmq/`, `mqtt/`, `sync/`, `auth/`, `audit/`

### Communication Patterns

#### 1. Synchronous Communication

**GraphQL API (Client ↔ Backend)**
```typescript
// Frontend queries backend via Apollo Client
// Location: apps/mes-ui/src/lib/apollo-client.ts
const client = new ApolloClient({
  uri: 'http://localhost:3000/graphql',
  cache: new InMemoryCache(),
});

// Queries and mutations are synchronous request/response
const { data } = await client.query({
  query: GET_PRODUCTION_ORDERS,
});
```

**REST API (NetSuite Sync)**
```typescript
// Location: apps/whk-recipe-configuration/src/sync/
// Synchronous HTTP calls to NetSuite REST API
const response = await axios.post(netsuiteEndpoint, {
  headers: { Authorization: `Bearer ${token}` },
  data: productionOrderData,
});
```

**Patterns:**
- Request/Response for queries and mutations
- Timeout handling (30s default)
- Retry logic with exponential backoff
- Circuit breaker for external services

#### 2. Asynchronous Communication

**A. RabbitMQ Message Queue**

**Location**: `apps/whk-recipe-configuration/src/rabbitmq/`

**Architecture:**
```typescript
// Message Producer
export class RabbitMQService {
  async publish(exchange: string, routingKey: string, message: any) {
    await this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
  }
}

// Message Consumer
@RabbitSubscribe({
  exchange: 'mes.events',
  routingKey: 'production.order.created',
  queue: 'netsuite-sync-queue',
})
async handleProductionOrderCreated(msg: ProductionOrderCreatedEvent) {
  // Async processing
  await this.syncToNetSuite(msg.productionOrder);
}
```

**Use Cases:**
- **NetSuite Sync**: Async data synchronization with ERP
- **Event Broadcasting**: Order created, recipe updated, batch completed
- **Task Queue**: Background jobs (reports, exports, calculations)
- **Service Decoupling**: Loose coupling between modules

**Exchange Types:**
- `mes.events` (topic): Business events (production.order.*, recipe.*)
- `mes.tasks` (direct): Background tasks and jobs
- `mes.sync` (fanout): Broadcast to all interested services

**Message Patterns:**
1. **Fire-and-Forget**: Publish event, don't wait for response
2. **Request/Reply**: Use correlation ID for async responses
3. **Pub/Sub**: Multiple consumers for same event
4. **Work Queue**: Distribute tasks across workers

**B. MQTT for Equipment Integration**

**Location**: `apps/whk-recipe-configuration/src/providers/mqtt/`

**Architecture:**
```typescript
// MQTT Client Service
export class MqttService {
  async publish(topic: string, payload: any) {
    await this.mqttClient.publish(
      topic,
      JSON.stringify(payload),
      { qos: 1 }
    );
  }

  subscribe(topic: string, handler: (payload: any) => void) {
    this.mqttClient.subscribe(topic);
    this.mqttClient.on('message', (receivedTopic, message) => {
      if (receivedTopic === topic) {
        handler(JSON.parse(message.toString()));
      }
    });
  }
}
```

**UNS (Unified Namespace) Architecture:**
```
brewery/
├── equipment/
│   ├── mash-tun-1/
│   │   ├── temperature
│   │   ├── pressure
│   │   └── status
│   ├── fermenter-1/
│   │   ├── temperature
│   │   ├── gravity
│   │   └── pH
├── batch/
│   ├── {batch-id}/
│   │   ├── parameters
│   │   ├── events
│   │   └── actuals
└── production/
    └── orders/
        └── {order-id}/
            ├── status
            └── progress
```

**MQTT Topics:**
- `brewery/equipment/+/temperature` (sensor data)
- `brewery/batch/+/events` (batch events)
- `brewery/production/orders/+/status` (order status)

**QoS Levels:**
- 0: Fire-and-forget (sensor readings)
- 1: At least once (critical events)
- 2: Exactly once (commands to equipment)

**C. WebSockets (Real-Time Updates)**

**Location**: `apps/whk-recipe-configuration/src/` (WebSocket Gateway)

```typescript
// WebSocket Gateway
@WebSocketGateway({ cors: true })
export class ProductionGateway {
  @WebSocketServer()
  server: Server;

  broadcastOrderUpdate(orderId: string, update: any) {
    this.server.emit(`order:${orderId}:update`, update);
  }
}

// Frontend Client (apps/mes-ui)
const socket = io('http://localhost:3000');
socket.on('order:123:update', (update) => {
  // Update UI in real-time
});
```

**Use Cases:**
- Live production order status
- Real-time batch parameter updates
- Equipment status monitoring
- Dashboard live data feeds

### On-Premises Integration

#### NetSuite ERP Integration

**Module**: `apps/whk-recipe-configuration/src/sync/`

**Sync Architecture:**
```
┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│     MES     │◄──────►│   RabbitMQ   │◄──────►│  NetSuite   │
│  (Source)   │  Async  │   (Queue)    │  Sync  │    (ERP)    │
└─────────────┘        └──────────────┘        └─────────────┘
```

**Bidirectional Sync:**

1. **MES → NetSuite** (Push):
```typescript
// Production order created in MES
async createProductionOrder(data: CreateProductionOrderDto) {
  // 1. Create in local database
  const order = await this.prisma.productionOrder.create({ data });

  // 2. Publish to RabbitMQ for async sync
  await this.rabbitMQ.publish(
    'mes.sync',
    'netsuite.production-order.create',
    { productionOrder: order }
  );

  return order;
}

// Sync worker picks up message
@RabbitSubscribe({
  queue: 'netsuite-sync-queue',
  routingKey: 'netsuite.production-order.create',
})
async syncProductionOrderToNetSuite(msg: any) {
  const response = await this.netsuiteAPI.createWorkOrder({
    // Map MES data to NetSuite format
    ...this.mapToNetSuiteFormat(msg.productionOrder)
  });

  // Update MES with NetSuite ID
  await this.prisma.productionOrder.update({
    where: { id: msg.productionOrder.id },
    data: { netsuiteId: response.id },
  });
}
```

2. **NetSuite → MES** (Pull/Webhook):
```typescript
// Polling approach (scheduled job)
@Cron('*/5 * * * *') // Every 5 minutes
async syncFromNetSuite() {
  const items = await this.netsuiteAPI.getUpdatedItems(lastSyncTime);

  for (const item of items) {
    await this.prisma.item.upsert({
      where: { netsuiteId: item.id },
      update: this.mapFromNetSuiteFormat(item),
      create: this.mapFromNetSuiteFormat(item),
    });
  }
}

// Webhook approach (if NetSuite supports)
@Post('/webhooks/netsuite/item-updated')
async handleNetSuiteItemUpdate(@Body() payload: any) {
  await this.prisma.item.upsert({
    where: { netsuiteId: payload.itemId },
    update: this.mapFromNetSuiteFormat(payload),
    create: this.mapFromNetSuiteFormat(payload),
  });
}
```

**Sync Patterns:**
- **Eventual Consistency**: Accept that systems may be temporarily out of sync
- **Idempotent Operations**: Same message processed multiple times produces same result
- **Conflict Resolution**: Last-write-wins or manual resolution
- **Retry Logic**: Exponential backoff for failed syncs
- **Dead Letter Queue**: Failed messages for manual review

#### MQTT Equipment Integration

**Real-Time Equipment Data:**

```typescript
// Subscribe to all equipment temperature sensors
this.mqttService.subscribe('brewery/equipment/+/temperature', async (topic, payload) => {
  const equipmentId = topic.split('/')[2]; // Extract from topic
  const { value, timestamp } = JSON.parse(payload);

  // Store in time-series database
  await this.prisma.batchTimeSeriesData.create({
    data: {
      equipmentId,
      parameterName: 'temperature',
      value,
      timestamp: new Date(timestamp),
    },
  });

  // Check thresholds and trigger alerts
  if (value > TEMP_THRESHOLD) {
    await this.rabbitMQ.publish('mes.events', 'alert.temperature.high', {
      equipmentId,
      value,
    });
  }

  // Broadcast to connected clients via WebSocket
  this.wsGateway.broadcastSensorUpdate(equipmentId, { temperature: value });
});
```

**Command Pattern (MES → Equipment):**
```typescript
// Send command to equipment
async startMashPhase(equipmentId: string, targetTemp: number) {
  // Publish command to equipment
  await this.mqttService.publish(
    `brewery/equipment/${equipmentId}/commands`,
    {
      command: 'SET_TEMPERATURE',
      targetValue: targetTemp,
      timestamp: Date.now(),
    }
  );

  // Wait for acknowledgment (with timeout)
  const ack = await this.waitForAck(equipmentId, 10000);
  if (!ack) {
    throw new Error('Equipment did not acknowledge command');
  }
}
```

### Async API Specification

**AsyncAPI Document Structure** (should be created):

```yaml
asyncapi: 2.6.0
info:
  title: WhiskeyHouse MES Async API
  version: 1.0.0
  description: Event-driven architecture for MES

servers:
  rabbitmq:
    url: localhost:5672
    protocol: amqp
  mqtt:
    url: localhost:1883
    protocol: mqtt

channels:
  production.order.created:
    publish:
      message:
        payload:
          type: object
          properties:
            orderId: string
            orderName: string
            recipeId: string
            timestamp: string

  brewery/equipment/{equipmentId}/temperature:
    subscribe:
      message:
        payload:
          type: object
          properties:
            value: number
            unit: string
            timestamp: integer
```

### Event-Driven Architecture Patterns

#### 1. Event Sourcing
```typescript
// Store all events that change state
interface ProductionOrderEvent {
  type: 'CREATED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
  orderId: string;
  timestamp: Date;
  data: any;
}

// Rebuild state from events
function replayEvents(events: ProductionOrderEvent[]) {
  return events.reduce((state, event) => {
    switch (event.type) {
      case 'CREATED': return { ...state, status: 'pending' };
      case 'STARTED': return { ...state, status: 'in-progress', startTime: event.timestamp };
      // ...
    }
  }, initialState);
}
```

#### 2. CQRS (Command Query Responsibility Segregation)
```typescript
// Commands (write side)
class CreateProductionOrderCommand {
  constructor(public readonly data: CreateProductionOrderDto) {}
}

@CommandHandler(CreateProductionOrderCommand)
class CreateProductionOrderHandler {
  async execute(command: CreateProductionOrderCommand) {
    // Write to database
    const order = await this.prisma.productionOrder.create({
      data: command.data,
    });

    // Publish event
    await this.eventBus.publish(new ProductionOrderCreatedEvent(order));
  }
}

// Queries (read side) - separate optimized models
class GetProductionOrdersQuery {
  constructor(public readonly filters: any) {}
}

@QueryHandler(GetProductionOrdersQuery)
class GetProductionOrdersHandler {
  async execute(query: GetProductionOrdersQuery) {
    // Read from optimized read model or cache
    return this.cache.get(`orders:${query.filters}`);
  }
}
```

#### 3. Saga Pattern (Distributed Transactions)
```typescript
// Long-running business process across services
class ProductionOrderSaga {
  async createOrder(data: CreateProductionOrderDto) {
    try {
      // Step 1: Create order in MES
      const order = await this.createOrderInMES(data);

      // Step 2: Reserve inventory
      await this.reserveInventory(order.bomItems);

      // Step 3: Create in NetSuite
      await this.createInNetSuite(order);

      // Step 4: Update status
      await this.updateOrderStatus(order.id, 'ready');
    } catch (error) {
      // Compensating transactions (rollback)
      await this.releaseInventory(order.bomItems);
      await this.deleteOrder(order.id);
      throw error;
    }
  }
}
```

### Resilience Patterns

#### 1. Circuit Breaker
```typescript
class NetSuiteCircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async call(fn: () => Promise<any>) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      this.failures++;
      if (this.failures >= 5) {
        this.state = 'OPEN';
        setTimeout(() => this.state = 'HALF_OPEN', 60000); // 1 min
      }
      throw error;
    }
  }
}
```

#### 2. Retry with Exponential Backoff
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
await retryWithBackoff(() => this.netsuiteAPI.createWorkOrder(data));
```

#### 3. Dead Letter Queue
```typescript
// RabbitMQ setup with DLQ
await channel.assertExchange('mes.dlx', 'topic', { durable: true });
await channel.assertQueue('mes.dlq', { durable: true });
await channel.bindQueue('mes.dlq', 'mes.dlx', '#');

// Main queue with DLX configuration
await channel.assertQueue('netsuite-sync-queue', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'mes.dlx',
    'x-message-ttl': 300000, // 5 minutes
  },
});

// Consumer with error handling
@RabbitSubscribe({ queue: 'netsuite-sync-queue' })
async handleMessage(msg: any) {
  try {
    await this.process(msg);
    // ACK on success
  } catch (error) {
    // NACK - message goes to DLQ
    throw error;
  }
}
```

### Caching Strategy

**Multi-Level Cache:**
```typescript
// 1. In-memory cache (fastest)
private memoryCache = new Map();

// 2. Redis cache (shared across instances)
@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    // Try memory cache first
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }

    // Try Redis
    const value = await this.cache.get<T>(key);
    if (value) {
      this.memoryCache.set(key, value);
    }
    return value;
  }
}

// 3. Database (slowest, most consistent)
async getProductionOrder(id: string) {
  const cacheKey = `order:${id}`;

  // Try cache
  let order = await this.cache.get(cacheKey);
  if (order) return order;

  // Fetch from DB
  order = await this.prisma.productionOrder.findUnique({ where: { id } });

  // Store in cache
  await this.cache.set(cacheKey, order, { ttl: 300 }); // 5 min

  return order;
}
```

### Monitoring & Observability

**OpenTelemetry Integration:**
```typescript
// Already configured in app.module.ts
// Traces HTTP, GraphQL, and service calls

// Custom instrumentation
import { trace } from '@opentelemetry/api';

async processOrder(orderId: string) {
  const span = trace.getTracer('mes').startSpan('processOrder');

  try {
    span.setAttribute('order.id', orderId);

    // Business logic
    const result = await this.doWork(orderId);

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    span.end();
  }
}
```

**Health Checks:**
```typescript
// Location: apps/whk-recipe-configuration/src/health/
@Controller('health')
export class HealthController {
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
      () => this.rabbitmq.pingCheck('rabbitmq'),
      () => this.mqtt.pingCheck('mqtt'),
    ]);
  }
}
```

## Key Architecture Decisions

### When to Use Sync vs Async

**Synchronous (Request/Response):**
- User-facing operations (queries, immediate feedback needed)
- ACID transactions required
- Simple CRUD operations
- Real-time validation

**Asynchronous (Message Queue):**
- External system integration (NetSuite)
- Long-running operations (reports, exports)
- Event broadcasting (order created, batch completed)
- Decoupling services
- Eventual consistency acceptable

### Message Broker Selection

**RabbitMQ** (already used):
- Complex routing (topic, fanout, headers exchanges)
- Guaranteed delivery (persistent messages)
- Message acknowledgment and retries
- Use for: Business events, task queues, ERP sync

**MQTT** (already used):
- Lightweight pub/sub
- Low latency, high throughput
- Topic hierarchy (UNS)
- Use for: Equipment telemetry, sensor data, commands

## Agent Task Workflow

When invoked for architecture tasks:

1. **Analyze**: Understand the architectural requirement or problem
2. **Design**: Propose architecture using established patterns (sync/async, event-driven, etc.)
3. **Consider**:
   - Sync vs async communication needs
   - Consistency requirements (strong vs eventual)
   - Scalability and performance
   - Integration with existing systems (NetSuite, MQTT, RabbitMQ)
   - Error handling and resilience
   - Monitoring and observability
4. **Implement**: Create or modify services following architectural patterns
5. **Document**: Update architecture diagrams and specifications
6. **Validate**: Ensure integration points work correctly, test failure scenarios

## Key Files & Locations

**Integration Services:**
- RabbitMQ: `apps/whk-recipe-configuration/src/rabbitmq/`
- MQTT: `apps/whk-recipe-configuration/src/providers/mqtt/`
- NetSuite Sync: `apps/whk-recipe-configuration/src/sync/`
- WebSockets: `apps/whk-recipe-configuration/src/*/gateways/`

**Infrastructure:**
- App Module: `apps/whk-recipe-configuration/src/app.module.ts`
- Health Checks: `apps/whk-recipe-configuration/src/health/`
- Audit System: `apps/whk-recipe-configuration/src/audit/`

**Configuration:**
- Docker Compose: `apps/whk-recipe-configuration/docker-compose.dev.yml`
- Environment: `.env` (via dotenv-vault)
