# Message Acknowledgment System

This document describes how to implement message acknowledgment between the message producer (this server) and subscribers.

## Overview

The message acknowledgment system ensures reliable message delivery by tracking the status of messages sent to subscribers. It includes:

1. A database table (`MessageQueue`) to track message status
2. Retry logic for failed message deliveries
3. Acknowledgment handling from subscribers
4. A scheduled job to retry unacknowledged messages

## How It Works

1. When a message needs to be sent, it's first recorded in the `MessageQueue` table with status `PENDING`
2. The message is then sent to RabbitMQ with a unique `messageId` header
3. The subscriber processes the message and sends an acknowledgment back
4. The message status is updated to `ACKNOWLEDGED` in the database

## Sending Messages

To send a message with acknowledgment tracking:

```typescript
// Use the MessageQueueService to send messages instead of directly using RabbitMQProducerService
await messageQueueService.queueMessage(
  entityId,          // ID of the entity being processed
  entityType,        // Type of entity (e.g., "ItemReceipt")
  topic,             // RabbitMQ topic
  payload,           // Message payload
  createdBy          // User who created the message
);
```

## Acknowledging Messages (Subscriber Side)

Subscribers should implement logic to acknowledge receipt of messages:

```typescript
// When a message is successfully processed
async function acknowledgeMessage(messageId: string) {
  try {
    // Send acknowledgment back to the producer
    await rabbitMQClient.emit('message_acknowledgment', {
      messageId: messageId,
      status: 'success'
    });
    console.log(`Acknowledged message ${messageId}`);
  } catch (error) {
    console.error(`Failed to acknowledge message ${messageId}: ${error}`);
  }
}

// When processing a message
async function processMessage(message: any, context: any) {
  // Extract the messageId from headers
  const headers = context.getMessage().properties.headers;
  const messageId = headers?.messageId;
  
  if (!messageId) {
    console.warn('Message received without messageId, unable to acknowledge');
    return;
  }
  
  try {
    // Process the message
    // ...
    
    // Acknowledge successful processing
    await acknowledgeMessage(messageId);
  } catch (error) {
    // Report error
    await rabbitMQClient.emit('message_acknowledgment', {
      messageId: messageId,
      status: 'error',
      errorDetails: error.message
    });
  }
}
```

## Monitoring Message Status

The `MessageQueue` table tracks the status of all messages:

- `PENDING`: Message has been created but not yet sent
- `SENT`: Message has been sent to RabbitMQ
- `ACKNOWLEDGED`: Subscriber has acknowledged receipt
- `FAILED`: Failed to send message
- `RETRYING`: Message is being retried after failure

## Retry Logic

The system automatically retries failed or unacknowledged messages:

1. Failed messages are retried every 5 minutes
2. Messages that have been sent but not acknowledged within 15 minutes are resent
3. Messages are retried up to a configurable maximum number of times (default: 3)

## Implementation Details

### Database Schema

The `MessageQueue` table has the following structure:

- `id`: Unique identifier for the message
- `entityId`: ID of the entity related to this message
- `entityType`: Type of entity (e.g., "ItemReceipt")
- `topic`: RabbitMQ topic
- `payload`: Message content (JSON)
- `status`: Current status of the message
- `attempts`: Number of send attempts
- `maxAttempts`: Maximum number of retry attempts
- `lastAttemptAt`: Timestamp of the last send attempt
- `errorMessage`: Error details if sending failed
- `acknowledgedAt`: Timestamp when message was acknowledged
- `createdBy`: User who created the message
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

### API Endpoints

The system provides an HTTP endpoint that can be used for acknowledgments:

- `POST /message-queue/acknowledge`: Acknowledge a message by ID
  - Body: `{ "messageId": "message-id-here" }`

This endpoint can be used as an alternative to RabbitMQ acknowledgments when needed. 