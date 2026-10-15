import { Module } from "@nestjs/common";
import { WhiskeyTypeService } from "./whiskeyType.service";
import { WhiskeyTypeController } from "./whiskeyType.controller";
import { WhiskeyTypeResolver } from "./whiskeyType.resolver";
import { PrismaModule } from "../prisma/prisma.module";
import { ACLModule } from "../auth/acl.module";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";

@Module({
  imports: [PrismaModule, ACLModule, RabbitMQModule],
  controllers: [WhiskeyTypeController],
  providers: [WhiskeyTypeService, WhiskeyTypeResolver],
  exports: [WhiskeyTypeService],
})
export class WhiskeyTypeModule {}
