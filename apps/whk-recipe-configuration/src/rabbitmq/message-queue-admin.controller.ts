import { Controller, Get, Post, Param, Inject, Logger, Query } from '@nestjs/common';
import { MessageQueueService } from './message-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('message-queue-admin')
@Controller('message-queue')
export class MessageQueueAdminController {
  constructor(
    private readonly messageQueueService: MessageQueueService,
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {}

  @Get()
  async findAll(
    @Query('_sort') sort = 'createdAt',
    @Query('_order') order = 'DESC',
    @Query('_start') start = '0',
    @Query('_end') end = '10',
    @Query('entityId') entityId?: string,
    @Query('entityType') entityType?: string,
    @Query('status') status?: string,
    @Query('createdAt_gte') createdAtGte?: string,
    @Query('createdAt_lte') createdAtLte?: string,
  ) {
    try {
      // Build filter conditions
      const where: any = {};
      if (entityId) where.entityId = entityId;
      if (entityType) where.entityType = entityType;
      if (status) where.status = status;
      
      if (createdAtGte || createdAtLte) {
        where.createdAt = {};
        if (createdAtGte) where.createdAt.gte = new Date(createdAtGte);
        if (createdAtLte) where.createdAt.lte = new Date(createdAtLte);
      }

      // Get total count for pagination
      const total = await this.prisma.messageQueue.count({ where });

      // Get paginated results
      const messages = await this.prisma.messageQueue.findMany({
        where,
        orderBy: { [sort]: order.toLowerCase() },
        skip: Number(start),
        take: Number(end) - Number(start),
      });

      // Set X-Total-Count header for admin panel pagination
      return {
        data: messages,
        total,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching message queue: ${errorMessage}`);
      throw error;
    }
  }

  @Get('stats')
  async getStats() {
    try {
      const total = await this.prisma.messageQueue.count();
      const acknowledged = await this.prisma.messageQueue.count({
        where: { status: 'ACKNOWLEDGED' },
      });
      const failed = await this.prisma.messageQueue.count({
        where: { status: 'FAILED' },
      });
      const pending = await this.prisma.messageQueue.count({
        where: { status: 'PENDING' },
      });
      const sent = await this.prisma.messageQueue.count({
        where: { status: 'SENT' },
      });
      const retrying = await this.prisma.messageQueue.count({
        where: { status: 'RETRYING' },
      });

      return {
        total,
        acknowledged,
        failed,
        pending,
        sent,
        retrying,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching message queue stats: ${errorMessage}`);
      throw error;
    }
  }

  @Post('retry/:id')
  async retryMessage(@Param('id') id: string) {
    try {
      this.logger.log(`Retrying message with ID: ${id}`);
      const result = await this.messageQueueService.sendMessage(id);
      return { success: result };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error retrying message ${id}: ${errorMessage}`);
      throw error;
    }
  }

  @Post('retry-all')
  async retryAllFailedMessages() {
    try {
      this.logger.log('Manually triggering retry of all failed messages');
      await this.messageQueueService.retryFailedMessages();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error retrying all failed messages: ${errorMessage}`);
      throw error;
    }
  }

  @Post('test-email')
  @ApiOperation({ summary: 'Send a test email notification' })
  @ApiResponse({
    status: 200,
    description: 'Test email sent successfully',
  })
  async sendTestEmail(): Promise<{ success: boolean; message: string }> {
    this.logger.log('Admin requested test email notification');
    try {
      await this.messageQueueService.sendTestEmail();
      return {
        success: true,
        message: 'Test email sent successfully. Check logs for details.',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send test email: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to send test email: ${errorMessage}`,
      };
    }
  }

  @Get('ghost-messages')
  @ApiOperation({ summary: 'Get list of tracked ghost messages' })
  @ApiResponse({
    status: 200,
    description: 'List of ghost messages retrieved successfully',
  })
  async getGhostMessages(): Promise<{ count: number; messages: string[] }> {
    this.logger.log('Admin requested ghost messages list');
    try {
      const ghostMessages = await this.messageQueueService.getGhostMessages();
      return {
        count: ghostMessages.length,
        messages: ghostMessages,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get ghost messages: ${errorMessage}`);
      throw error;
    }
  }

  @Post('clear-ghost-messages')
  @ApiOperation({ summary: 'Clear all tracked ghost messages' })
  @ApiResponse({
    status: 200,
    description: 'Ghost messages cleared successfully',
  })
  async clearGhostMessages(): Promise<{ success: boolean; cleared: number }> {
    this.logger.log('Admin requested to clear ghost messages');
    try {
      const clearedCount = await this.messageQueueService.clearGhostMessages();
      return {
        success: true,
        cleared: clearedCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to clear ghost messages: ${errorMessage}`);
      throw error;
    }
  }

  @Post('force-fail/:id')
  @ApiOperation({ summary: 'Force mark a message as failed and trigger notification' })
  @ApiResponse({
    status: 200,
    description: 'Message marked as failed and notification sent',
  })
  async forceFailMessage(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Admin requested to force-fail message ID: ${id}`);
    try {
      // Find the message
      const message = await this.prisma.messageQueue.findUnique({
        where: { id },
      });
      
      if (!message) {
        return {
          success: false,
          message: `Message with ID ${id} not found`,
        };
      }

      // Update the message to FAILED status with max attempts
      await this.prisma.messageQueue.update({
        where: { id },
        data: {
          status: 'FAILED',
          attempts: message.maxAttempts,
          errorMessage: 'Manually marked as failed by administrator',
        },
      });
      
      // Re-fetch the updated message
      const updatedMessage = await this.prisma.messageQueue.findUnique({
        where: { id },
      });
      
      // Trigger notification manually
      await this.messageQueueService.sendMessageFailureNotification(updatedMessage);
      
      return {
        success: true,
        message: `Message ${id} marked as failed and notification triggered`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to force-fail message: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to force-fail message: ${errorMessage}`,
      };
    }
  }

  @Post('fix-max-attempt-messages')
  @ApiOperation({ summary: 'Check and fix messages that should be marked as FAILED due to max attempts' })
  @ApiResponse({
    status: 200,
    description: 'Messages checked and fixed if needed',
  })
  async fixMaxAttemptMessages(): Promise<{ success: boolean; found: number; fixed: number; message: string }> {
    this.logger.log('Admin requested to fix messages that have reached max attempts');
    try {
      // Find all messages at or over max attempts that aren't already in FAILED status
      const messagesToFix = await this.prisma.messageQueue.findMany({
        where: {
          status: { notIn: ['FAILED', 'ACKNOWLEDGED'] },
          attempts: { gte: 3 } // At or over max attempts (usually 3)
        },
      });
      
      this.logger.log(`Found ${messagesToFix.length} messages that need to be fixed`);
      
      let fixedCount = 0;
      
      // Process each message
      for (const message of messagesToFix) {
        this.logger.log(`Fixing message ${message.id} (${message.attempts}/${message.maxAttempts} attempts, status: ${message.status})`);
        
        // Update to FAILED status
        await this.prisma.messageQueue.update({
          where: { id: message.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Automatically marked as FAILED by admin fix tool due to reaching max attempts'
          }
        });
        
        // Re-fetch the updated message
        const updatedMessage = await this.prisma.messageQueue.findUnique({
          where: { id: message.id },
        });
        
        // Trigger notification
        await this.messageQueueService.sendMessageFailureNotification(updatedMessage);
        fixedCount++;
      }
      
      return {
        success: true,
        found: messagesToFix.length,
        fixed: fixedCount,
        message: `Found ${messagesToFix.length} messages that needed fixing, successfully fixed ${fixedCount}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fix max attempt messages: ${errorMessage}`);
      return {
        success: false,
        found: 0,
        fixed: 0,
        message: `Failed to fix messages: ${errorMessage}`
      };
    }
  }
} 