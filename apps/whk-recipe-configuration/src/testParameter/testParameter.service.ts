import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TestParameterServiceBase } from "./base/testParameter.service.base";
import {Logger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";

@Injectable()
export class TestParameterService extends TestParameterServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createTestParameter<T extends Prisma.TestParameterCreateArgs>(args: Prisma.SelectSubset<T, Prisma.TestParameterCreateArgs>): Promise<import(".prisma/client").TestParameter> {
        const testParameter = await super.createTestParameter(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Testparameter, {
        recordName: 'TestParameter',
        event_type: 'create',
        data: testParameter
        });
        this.logger.log(`Updated TestParameter: ${testParameter.id} & pushed to topic`);
        return testParameter;
    }

    async updateTestParameter<T extends Prisma.TestParameterUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.TestParameterUpdateArgs>): Promise<import(".prisma/client").TestParameter> {
        const testParameter = await super.updateTestParameter(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Testparameter, {
        recordName: 'TestParameter',
        event_type: 'update',
        data: testParameter
        });
        this.logger.log(`Updated TestParameter: ${testParameter.id} & pushed to topic`);
        return testParameter;
    }

    async deleteTestParameter<T extends Prisma.TestParameterDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.TestParameterDeleteArgs>): Promise<import(".prisma/client").TestParameter> {
        const testParameter = await super.deleteTestParameter(args);
      await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Testparameter, {
        recordName: 'TestParameter',
        event_type: 'delete',
        data: testParameter
      });
        this.logger.log(`Deleted TestParameter: ${testParameter.id} & pushed to topic`);
        return testParameter;
    }
}
