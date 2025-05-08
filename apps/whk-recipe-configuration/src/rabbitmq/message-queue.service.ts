import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQProducerService } from './rabbitmq.producer.service';
import { AllMessageBrokerTopics } from './topics';
import { RabbitMQMessage } from './RabbitMQMessage';
import { RabbitMQMessageHeaders } from './RabbitMQMessageHeaders';
import { Cron } from '@nestjs/schedule';
import { AzureEmailService } from '../providers/notification/azure-email.service';

@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);
  // Track ghost messages that exist in RabbitMQ but not in our database
  private ghostMessages: Set<string> = new Set();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitProducer: RabbitMQProducerService,
    private readonly emailService: AzureEmailService,
  ) {}

  /**
   * Send a test email to verify the email service is working
   */
  async sendTestEmail(): Promise<void> {
    this.logger.log('Attempting to send test email...');
    try {
      await this.emailService.sendFailedMessageNotification(
        'test-message-id-' + Date.now(),
        'test-topic',
        'test-entity-id',
        'test-entity-type',
        'This is a test email to verify the notification system is working properly'
      );
      this.logger.log('Test email sent successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send test email: ${errorMessage}`);
      this.logger.error('Email configuration issue. Please check environment variables:');
      this.logger.error('AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING, AZURE_COMMUNICATION_SERVICES_FROM_EMAIL, ADMIN_EMAIL_1');
    }
  }

  /**
   * Queue a message to be sent and track it for acknowledgement
   */
  async queueMessage(
    entityId: string,
    entityType: string,
    topic: AllMessageBrokerTopics,
    payload: RabbitMQMessage,
    createdBy: string,
    headers?: RabbitMQMessageHeaders,
    priority?: number,
  ): Promise<string> {
    // Create a message queue record
    const messageQueue = await this.prisma.messageQueue.create({
      data: {
        entityId,
        entityType,
        topic,
        payload,
        createdBy,
        status: 'PENDING',
      },
    });

    // Immediately try to send the message
    await this.sendMessage(messageQueue.id);

    return messageQueue.id;
  }

  /**
   * Send a message from the queue
   */
  async sendMessage(messageQueueId: string): Promise<boolean> {
    // Get the message from the queue
    const messageQueue = await this.prisma.messageQueue.findUnique({
      where: { id: messageQueueId },
    });

    if (!messageQueue) {
      this.logger.error(`Message queue with ID ${messageQueueId} not found`);
      return false;
    }

    // If the message is already acknowledged or has reached max attempts, skip it
    if (messageQueue.status === 'ACKNOWLEDGED') {
      return true;
    }

    if (messageQueue.attempts >= messageQueue.maxAttempts && messageQueue.status === 'FAILED') {
      this.logger.warn(`Message ${messageQueueId} has reached maximum retry attempts (${messageQueue.attempts}/${messageQueue.maxAttempts})`);
      
      // Send notification about the permanent failure
      this.logger.log(`Triggering failure notification for message ${messageQueueId}`);
      await this.sendFailureNotification(messageQueue);
      
      return false;
    }

    // Check if this will be the last attempt - we need to know this before incrementing
    const willReachMaxAttempts = messageQueue.attempts + 1 >= messageQueue.maxAttempts;
    
    try {
      // Add a unique messageId to the headers for tracking acknowledgements
      const headers: RabbitMQMessageHeaders = {
        messageId: messageQueue.id,
      };
      
      this.logger.debug(`Sending message ${messageQueueId} to topic ${messageQueue.topic} with header messageId: ${headers.messageId}`);
      console.log(`DEBUG: Sending message with ID ${messageQueueId} using headers:`, headers);

      // Send the message
      await this.rabbitProducer.emitMessage(
        messageQueue.topic as AllMessageBrokerTopics,
        messageQueue.payload as RabbitMQMessage,
        headers,
      );

      // Update the message queue record
      const updatedMessage = await this.prisma.messageQueue.update({
        where: { id: messageQueueId },
        data: {
          // If this was the last attempt, mark it as FAILED immediately instead of SENT
          status: willReachMaxAttempts ? 'FAILED' : 'SENT',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          // If this was the last attempt, also set an error message
          ...(willReachMaxAttempts && {
            errorMessage: 'Maximum retry attempts reached without acknowledgment'
          })
        },
      });

      // If we just reached max attempts, trigger notification
      if (updatedMessage.attempts >= updatedMessage.maxAttempts) {
        this.logger.warn(`Message ${messageQueueId} just reached max attempts on successful send (${updatedMessage.attempts}/${updatedMessage.maxAttempts}) - marking as FAILED and sending notification`);
        await this.sendFailureNotification(updatedMessage);
      }

      return true;
    } catch (error: unknown) {
      // Get error message safely
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Update the message queue record with the error
      const updatedMessage = await this.prisma.messageQueue.update({
        where: { id: messageQueueId },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          errorMessage: errorMessage,
        },
      });

      this.logger.error(`Failed to send message ${messageQueueId}: ${errorMessage}`);
      
      // If this was the last attempt, send a notification
      if (updatedMessage.attempts >= updatedMessage.maxAttempts) {
        this.logger.warn(`Message ${messageQueueId} just reached max attempts (${updatedMessage.attempts}/${updatedMessage.maxAttempts}) - sending notification`);
        await this.sendFailureNotification(updatedMessage);
      }
      
      return false;
    }
  }

  /**
   * Send a notification about a message that has reached its maximum retry attempts
   * Private implementation
   */
  private async sendFailureNotification(messageQueue: any): Promise<void> {
    this.logger.log(`Sending failure notification for message ID: ${messageQueue.id}, attempts: ${messageQueue.attempts}/${messageQueue.maxAttempts}`);
    
    // Log full message details for debugging
    this.logger.debug('Message details for failure notification:', {
      id: messageQueue.id,
      topic: messageQueue.topic,
      entityId: messageQueue.entityId,
      entityType: messageQueue.entityType,
      status: messageQueue.status,
      attempts: messageQueue.attempts,
      maxAttempts: messageQueue.maxAttempts,
      errorMessage: messageQueue.errorMessage || 'No error message provided'
    });
    
    try {
      await this.emailService.sendFailedMessageNotification(
        messageQueue.id,
        messageQueue.topic,
        messageQueue.entityId,
        messageQueue.entityType,
        messageQueue.errorMessage || 'Unknown error'
      );
      this.logger.log(`Failure notification sent successfully for message ${messageQueue.id}`);
      
      // Update the database to record that we sent a notification
      await this.prisma.messageQueue.update({
        where: { id: messageQueue.id },
        data: {
          // We could add a field to track if notification was sent
          errorMessage: `[NOTIFIED] ${messageQueue.errorMessage || 'Unknown error'}`
        }
      }).catch(error => {
        this.logger.error(`Failed to update message record after sending notification: ${error}`);
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send failure notification: ${errorMessage}`);
      this.logger.error('Email configuration debug info:');
      this.logger.error(`Topic: ${messageQueue.topic}, EntityID: ${messageQueue.entityId}, EntityType: ${messageQueue.entityType}`);
    }
  }

  /**
   * Public method to send a failure notification for a message
   * This can be used by admin tools to manually trigger notifications
   */
  async sendMessageFailureNotification(messageQueue: any): Promise<boolean> {
    try {
      await this.sendFailureNotification(messageQueue);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send manual failure notification: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Mark a message as acknowledged
   */
  async acknowledgeMessage(messageId: string): Promise<boolean> {
    try {
      // First check if the message exists
      const messageExists = await this.messageExists(messageId);
      
      if (!messageExists) {
        this.logger.warn(`Attempted to acknowledge non-existent message ID: ${messageId}`);
        
        // Add to ghost messages set to prevent resending
        this.ghostMessages.add(messageId);
        this.logger.log(`Added ${messageId} to ghost messages tracking (total: ${this.ghostMessages.size})`);
        
        // Instead of failing, we could create a record for this message ID if needed
        // For now, just log and return success since the message doesn't need to be retried
        return true;
      }
      
      await this.prisma.messageQueue.update({
        where: { id: messageId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
        },
      });
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to acknowledge message ${messageId}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Check if a message exists by ID
   */
  async messageExists(messageId: string): Promise<any> {
    try {
      return await this.prisma.messageQueue.findUnique({
        where: { id: messageId },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check existence of message ${messageId}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Scheduled job to retry failed messages
   */
  @Cron('*/3 * * * *') // Run every 3 minutes (changed from 5 minutes for testing)
  async retryFailedMessages() {
    const failedMessages = await this.prisma.messageQueue.findMany({
      where: {
        status: 'FAILED',
        attempts: { lt: 3 }, // Less than max attempts
      },
    });

    this.logger.log(`Retrying ${failedMessages.length} failed messages`);

    for (const message of failedMessages) {
      await this.prisma.messageQueue.update({
        where: { id: message.id },
        data: {
          status: 'RETRYING',
        },
      });

      await this.sendMessage(message.id);
    }
  }

  /**
   * Get pending messages that haven't been acknowledged after a certain time
   */
  @Cron('*/3 * * * *') // Run every 3 minutes (changed from 15 minutes for testing)
  async resendPendingMessages() {
    // Find messages that were sent but not acknowledged within 3 minutes
    const pendingMessages = await this.prisma.messageQueue.findMany({
      where: {
        status: { in: ['SENT', 'RETRYING'] }, // Check both SENT and RETRYING status
        lastAttemptAt: {
          lt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago (changed from 15 minutes for testing)
        },
      },
    });

    // Filter out any ghost messages we're tracking
    const filteredPendingMessages = pendingMessages.filter(message => !this.ghostMessages.has(message.id));
    
    if (pendingMessages.length !== filteredPendingMessages.length) {
      this.logger.log(`Filtered out ${pendingMessages.length - filteredPendingMessages.length} ghost messages from resend list`);
    }

    this.logger.log(`Checking ${filteredPendingMessages.length} pending messages for resend or failure`);

    // First, process messages that have reached max attempts
    const maxAttemptMessages = filteredPendingMessages.filter(message => message.attempts >= message.maxAttempts);
    if (maxAttemptMessages.length > 0) {
      this.logger.warn(`Found ${maxAttemptMessages.length} messages that reached max attempts but were not marked as FAILED`);
    }

    // Process messages that have reached max attempts
    for (const message of maxAttemptMessages) {
      this.logger.warn(`Message ${message.id} has reached max attempts (${message.attempts}/${message.maxAttempts}) but was still in ${message.status} status. Marking as FAILED.`);
      
      try {
        // Update the message to FAILED status
        await this.prisma.messageQueue.update({
          where: { id: message.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Maximum retry attempts reached without acknowledgment'
          }
        });
        
        // Immediately trigger notification
        this.logger.log(`Triggering failure notification for message ${message.id} that reached max attempts`);
        await this.sendFailureNotification({
          ...message,
          status: 'FAILED',
          errorMessage: 'Maximum retry attempts reached without acknowledgment'
        });
      } catch (error) {
        this.logger.error(`Failed to update message ${message.id} status to FAILED: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Then, process messages that need to be retried (under max attempts)
    const messagesToRetry = filteredPendingMessages.filter(message => message.attempts < message.maxAttempts);
    if (messagesToRetry.length > 0) {
      this.logger.log(`Resending ${messagesToRetry.length} messages that are under max retry attempts`);
      
      for (const message of messagesToRetry) {
        await this.sendMessage(message.id);
      }
    }
  }

  /**
   * Scheduled job to check for any messages that have reached max attempts but haven't triggered notifications
   */
  @Cron('*/5 * * * *') // Run every 5 minutes
  async checkMaxAttemptsMessages() {
    // First check for FAILED status messages that need notifications
    const failedMaxAttemptsMessages = await this.prisma.messageQueue.findMany({
      where: {
        status: 'FAILED',
        attempts: { gte: 3 }, // Equal to or greater than max attempts
      },
    });

    this.logger.log(`Found ${failedMaxAttemptsMessages.length} FAILED messages that have reached maximum retry attempts, checking for notifications`);

    for (const message of failedMaxAttemptsMessages) {
      // Check if notification was likely sent by looking at the error message
      const notificationSent = message.errorMessage?.includes('[NOTIFIED]') || false;
      
      if (!notificationSent) {
        this.logger.log(`Sending missing notification for FAILED message ${message.id} (attempts: ${message.attempts}/${message.maxAttempts})`);
        await this.sendFailureNotification(message);
      }
    }
    
    // Check for any non-FAILED messages that have reached max attempts but haven't been marked as FAILED
    const nonFailedMaxAttemptsMessages = await this.prisma.messageQueue.findMany({
      where: {
        status: { notIn: ['FAILED', 'ACKNOWLEDGED'] },
        attempts: { gte: 3 }, // Equal to or greater than max attempts
      },
    });
    
    if (nonFailedMaxAttemptsMessages.length > 0) {
      this.logger.warn(`Found ${nonFailedMaxAttemptsMessages.length} messages that reached max attempts but were not marked as FAILED`);
      
      for (const message of nonFailedMaxAttemptsMessages) {
        this.logger.warn(`Message ${message.id} has reached max attempts (${message.attempts}/${message.maxAttempts}) but has status ${message.status}. Marking as FAILED.`);
        
        try {
          // Update to FAILED status
          await this.prisma.messageQueue.update({
            where: { id: message.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Maximum retry attempts reached - automatically fixed by system check'
            }
          });
          
          // Re-fetch the updated message
          const updatedMessage = await this.prisma.messageQueue.findUnique({
            where: { id: message.id },
          });
          
          // Send notification
          await this.sendFailureNotification(updatedMessage);
        } catch (error) {
          this.logger.error(`Failed to update message ${message.id} status to FAILED: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Clean up the ghost messages set periodically to prevent memory leaks
   */
  @Cron('0 */6 * * *') // Run every 6 hours
  async cleanupGhostMessages() {
    const previousSize = this.ghostMessages.size;
    
    // Keep only the last 1000 ghost messages to prevent memory issues
    if (this.ghostMessages.size > 1000) {
      const toKeep = Array.from(this.ghostMessages).slice(-1000);
      this.ghostMessages = new Set(toKeep);
    }
    
    this.logger.log(`Ghost messages cleanup: was ${previousSize}, now ${this.ghostMessages.size}`);
  }

  /**
   * Get the list of ghost messages being tracked
   */
  async getGhostMessages(): Promise<string[]> {
    return Array.from(this.ghostMessages);
  }

  /**
   * Clear all tracked ghost messages
   */
  async clearGhostMessages(): Promise<number> {
    const count = this.ghostMessages.size;
    this.ghostMessages.clear();
    this.logger.log(`Manually cleared ${count} ghost messages`);
    return count;
  }
} 