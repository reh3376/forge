import { Module } from '@nestjs/common';
import { AzureEmailService } from './azure-email.service';

@Module({
  providers: [AzureEmailService],
  exports: [AzureEmailService],
})
export class NotificationModule {} 