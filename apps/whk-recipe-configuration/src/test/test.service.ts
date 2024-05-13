import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TestServiceBase } from "./base/test.service.base";
import {Logger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";
import {Prisma} from "@prisma/client";

@Injectable()
export class TestService extends TestServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private readonly logger: Logger
  ) {
    super(prisma);
  }

    async createTest<T extends Prisma.TestCreateArgs>(args: Prisma.SelectSubset<T, Prisma.TestCreateArgs>): Promise<import(".prisma/client").Test> {
        const test = await super.createTest(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Test, {
        recordName: 'Test',
        event_type: 'create',
        data: test
        });
        this.logger.log(`Updated Test: ${test.id} & pushed to topic`);
        return test;
    }

    async updateTest<T extends Prisma.TestUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.TestUpdateArgs>): Promise<import(".prisma/client").Test> {
        const test = await super.updateTest(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Test, {
        recordName: 'Test',
        event_type: 'update',
        data: test
        });
        this.logger.log(`Updated Test: ${test.id} & pushed to topic`);
        return test;
    }

    async deleteTest<T extends Prisma.TestDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.TestDeleteArgs>): Promise<import(".prisma/client").Test> {
        const test = await super.deleteTest(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Test, {
        recordName: 'Test',
        event_type: 'delete',
        data: test
        });
        this.logger.log(`Deleted Test: ${test.id} & pushed to topic`);
        return test;
    }
}
