import { Global, Module } from "@nestjs/common";
import { ClientProxyFactory } from "@nestjs/microservices";
import { generateRabbitMQClientOptions } from "./generateRabbitMQClientOptions";
import { RabbitMQProducerService } from "./rabbitmq.producer.service";
import { RabbitMQController } from "./rabbitmq.controller";
import { ConfigService } from "@nestjs/config";
import { SyncService } from "../sync/sync.service";
import { MessageQueueService } from "./message-queue.service";
import { ScheduleModule } from "@nestjs/schedule";
import { MessageQueueController } from "./message-queue.controller";
import { MessageQueueAdminController } from "./message-queue-admin.controller";
import { Reflector } from "@nestjs/core";
import { NotificationModule } from "../providers/notification/notification.module";

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule],
  providers: [
    {
      provide: "RABBITMQ_CLIENT",
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create(
          generateRabbitMQClientOptions(configService)
        );
      },
      inject: [ConfigService],
    },
    RabbitMQProducerService,
    SyncService,
    MessageQueueService,
    Reflector,
  ],
  controllers: [RabbitMQController, MessageQueueController, MessageQueueAdminController],
  exports: [RabbitMQProducerService, MessageQueueService],
})
export class RabbitMQModule {}
