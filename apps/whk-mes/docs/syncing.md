# Messaging and Synchronisation

This document describes how the WHK MES backend exchanges data with external systems via RabbitMQ and the `SyncService`.

## RabbitMQ Topics

Messages arrive on topics scoped by tenant and plant, for example:

```
wh.<tenant>.<plant>.item
wh.<tenant>.<plant>.purchaseorder
```

Other services publish events to these topics. The backend listens using `RabbitMQController` and pushes them into the `SyncService` for processing.

## SyncService Workflow

1. `RabbitMQController` receives a message with the entity name and operation.
2. `SyncService` parses the payload and maps it to the corresponding Prisma model.
3. It creates or updates records based on the message action.
4. Unacknowledged messages trigger retries handled by `MessageQueueService`.

```typescript
// simplified processing
async handleMessage(topic: string, payload: any) {
  const { entity, action } = payload;
  if (action === 'create') {
    await prisma[entity].create({ data: payload.data });
  } else if (action === 'update') {
    await prisma[entity].update({ where: { id: payload.id }, data: payload.data });
  }
}
```

Refer to [Message Acknowledgment](../../../docs/message-acknowledgment.md) for details on the retry and acknowledgement logic.

## Common Troubleshooting

- Verify RabbitMQ is running locally using `npm run docker:dev`.
- Check the `MessageQueue` table for failed or pending messages.
- Increase logging via environment variables when debugging sync issues.
