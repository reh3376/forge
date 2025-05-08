import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';

@Injectable()
export class AzureEmailService {
  private readonly logger = new Logger(AzureEmailService.name);
  private readonly emailClient: EmailClient | undefined;
  private readonly adminEmails: string[] = [];
  private readonly fromEmail: string | undefined;
  
  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING');
    this.fromEmail = this.configService.get<string>('AZURE_COMMUNICATION_SERVICES_FROM_EMAIL');
    
    // Get admin emails from environment variables
    const adminEmail1 = this.configService.get<string>('ADMIN_EMAIL_1');
    const adminEmail2 = this.configService.get<string>('ADMIN_EMAIL_2');
    this.adminEmails = [adminEmail1, adminEmail2].filter((email): email is string => Boolean(email));

    // Log configuration status
    this.logger.log('Initializing Azure Email Service with configuration:');
    this.logger.log(`Connection String: ${connectionString ? 'CONFIGURED' : 'MISSING'}`);
    this.logger.log(`From Email: ${this.fromEmail || 'MISSING'}`);
    this.logger.log(`Admin Emails: ${this.adminEmails.length > 0 ? this.adminEmails.join(', ') : 'NONE CONFIGURED'}`);

    if (!connectionString) {
      this.logger.warn('Azure Communication Services connection string not configured');
    } else if (!this.fromEmail) {
      this.logger.warn('Azure Communication Services FROM email not configured');
    } else if (this.adminEmails.length === 0) {
      this.logger.warn('No admin emails configured for notifications');
    } else {
      try {
        this.emailClient = new EmailClient(connectionString);
        this.logger.log('Azure Email Service initialized successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to initialize Azure Email Client: ${errorMessage}`);
      }
    }
  }

  /**
   * Send an email notification about a message that has failed after maximum retry attempts
   */
  async sendFailedMessageNotification(
    messageId: string,
    topic: string,
    entityId: string,
    entityType: string,
    errorMessage: string,
  ): Promise<void> {
    this.logger.log(`Attempting to send notification for message ${messageId}`);
    this.logger.log(`Email config status: Client=${!!this.emailClient}, FromEmail=${!!this.fromEmail}, AdminEmails=${this.adminEmails.length}`);
    
    if (!this.emailClient || !this.fromEmail || this.adminEmails.length === 0) {
      this.logger.warn('Email notification service not fully configured - skipping notification');
      this.logger.warn(`Missing components: ${!this.emailClient ? 'Email Client, ' : ''}${!this.fromEmail ? 'From Email, ' : ''}${this.adminEmails.length === 0 ? 'Admin Emails' : ''}`);
      return;
    }

    try {
      const subject = `[ALERT] Message Queue Failure: ${topic}`;
      const content = `
        <h2>Message Queue Notification</h2>
        <p>A message has reached its maximum retry attempts and has been marked as failed.</p>
        <h3>Message Details:</h3>
        <ul>
          <li><strong>Message ID:</strong> ${messageId}</li>
          <li><strong>Topic:</strong> ${topic}</li>
          <li><strong>Entity Type:</strong> ${entityType}</li>
          <li><strong>Entity ID:</strong> ${entityId}</li>
          <li><strong>Error:</strong> ${errorMessage}</li>
        </ul>
        <p>Please check the message queue administration panel for more details.</p>
      `;

      // Create the email message
      const emailMessage = {
        senderAddress: this.fromEmail,
        content: {
          subject,
          html: content,
        },
        recipients: {
          to: this.adminEmails.map(email => ({ address: email })),
        }
      };

      this.logger.log(`Sending email to: ${this.adminEmails.join(', ')}`);
      
      // Send the email
      const poller = await this.emailClient.beginSend(emailMessage);
      this.logger.log('Email sending initiated, waiting for completion...');
      const response = await poller.pollUntilDone();

      this.logger.log(`Notification email sent for failed message ${messageId}. Status: ${response.status}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send notification email: ${errorMessage}`);
      
      // Log detailed error information
      if (error instanceof Error && error.stack) {
        this.logger.error(`Stack trace: ${error.stack}`);
      }
      
      // Check Azure connection status
      if (!this.emailClient) {
        this.logger.error('Email client is undefined - check connection string');
      }
    }
  }
} 