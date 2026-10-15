import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TestParameterServiceBase } from "./base/testParameter.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Prisma } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

@Injectable()
export class TestParameterService extends TestParameterServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createTestParameter<T extends Prisma.TestParameterCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.TestParameterCreateArgs>
  ): Promise<import(".prisma/client").TestParameter> {
    const testParameter = await super.createTestParameter(args);
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Testparameter,
      {
        recordName: "TestParameter",
        event_type: "create",
        data: testParameter,
      }
    );
    this.logger.log(
      `Updated TestParameter: ${testParameter.id} & pushed to topic`
    );
    return testParameter;
  }

  async updateTestParameter<T extends Prisma.TestParameterUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.TestParameterUpdateArgs>
  ): Promise<import(".prisma/client").TestParameter> {
    const testParameter = await super.updateTestParameter(args);
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Testparameter,
      {
        recordName: "TestParameter",
        event_type: "update",
        data: testParameter,
      }
    );
    this.logger.log(
      `Updated TestParameter: ${testParameter.id} & pushed to topic`
    );
    return testParameter;
  }

  async deleteTestParameter<T extends Prisma.TestParameterDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.TestParameterDeleteArgs>
  ): Promise<import(".prisma/client").TestParameter> {
    const testParameter = await super.deleteTestParameter(args);
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Testparameter,
      {
        recordName: "TestParameter",
        event_type: "delete",
        data: testParameter,
      }
    );
    this.logger.log(
      `Deleted TestParameter: ${testParameter.id} & pushed to topic`
    );
    return testParameter;
  }
}
