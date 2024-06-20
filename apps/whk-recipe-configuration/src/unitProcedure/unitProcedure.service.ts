
import {BadRequestException, Injectable} from "@nestjs/common";
import {PrismaService} from "../prisma/prisma.service";
import {UnitProcedureServiceBase} from "./base/unitProcedure.service.base";
import {Prisma, UnitProcedure} from "@prisma/client";
import {PinoLogger} from "nestjs-pino";
import {OperationWhereUniqueInput} from "../operation/base/OperationWhereUniqueInput";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {WhMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class UnitProcedureService extends UnitProcedureServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    private logger: PinoLogger,
  ) {
    super(prisma);
  }
  private unitProcedureOperationsMap: { [key: string]: string[] } = {
    Mashing01: ['Cook', 'Clean'],
    Fermentation01: ['FermenterSet', 'Fermenter', 'Clean'],
    Distillation01: ['StillRun', 'Clean'],
    Processing01: ['TankProcessing', 'Barreling'],
    Milling01: ['Mill'],
  };

  async createUnitProcedure<T extends Prisma.UnitProcedureCreateArgs>(args: Prisma.SelectSubset<T, Prisma.UnitProcedureCreateArgs>): Promise<import(".prisma/client").UnitProcedure> {
    const unitProcedure = await super.createUnitProcedure(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Unitprocedure, {
      event_type: 'create',
      data: unitProcedure,
      recordName: 'UnitProcedure',
    });
    this.logger.info(`Updated UnitProcedure: ${unitProcedure.id} & pushed to topic`)
    return unitProcedure;
  }

  async updateUnitProcedure<T extends Prisma.UnitProcedureUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.UnitProcedureUpdateArgs>): Promise<import(".prisma/client").UnitProcedure> {
    const unitProcedure = await super.updateUnitProcedure(args);

    // use the id from the update to get the record in the form we want for the message publishing
    const unitProcedurePayload = await this.prisma.unitProcedure.findUnique({
      where: { id: unitProcedure.id },
      include: {
        operations: true,
      }
    });

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Unitprocedure, {
      event_type: 'update',
      data: unitProcedurePayload,
      recordName: 'UnitProcedure',
    });
    this.logger.info(`Updated UnitProcedure: ${unitProcedure.id} & pushed to topic`)

    return unitProcedure;
  }

  async deleteUnitProcedure<T extends Prisma.UnitProcedureDeleteArgs>(args: Prisma.SelectSubset<T, Prisma.UnitProcedureDeleteArgs>): Promise<import(".prisma/client").UnitProcedure> {
    const unitProcedure = await super.deleteUnitProcedure(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Unitprocedure, {
      event_type: 'delete',
      data: unitProcedure,
      recordName: 'UnitProcedure',
    });
    this.logger.info(`Deleted UnitProcedure: ${unitProcedure.id} & pushed to topic`)

    return unitProcedure;
  }
}
