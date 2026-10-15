import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerServiceBase } from "./base/customer.service.base";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Prisma } from ".prisma/client";
import { Logger } from "winston";

@Injectable()
export class CustomerService extends CustomerServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async updateCustomer<T extends Prisma.CustomerUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CustomerUpdateArgs>
  ): Promise<import(".prisma/client").Customer> {
    const customer = await super.updateCustomer({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
      },
      where: args.where,
    });

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Customer,
      {
        event_type: "update",
        data: customer,
        recordName: "Customer",
      }
    );

    return customer;
  }
}
