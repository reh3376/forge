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

  async createUnitProcedure<T extends Prisma.UnitProcedureCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.UnitProcedureCreateArgs>
  ): Promise<UnitProcedure> {
    const name = args.data.name as string;
    const operations = args.data.operations?.connect as Array<OperationWhereUniqueInput>;
    if (operations.length) {
      const operationsData = await Promise.all(
          operations.map(async (operation) => {
            const operationRecord = await this.prisma.operation.findUnique({
              where: { id: operation.id },
            }) as any;
            return { name: operationRecord.name, id: operationRecord.id };
          })
      );
      this.logger.info(`Provided operations: ${operationsData}`);
      const acceptableOperations = this.unitProcedureOperationsMap[name];
      this.logger.info(`Acceptable operations: ${acceptableOperations}`);

      if (!acceptableOperations) {
        throw new BadRequestException(`No operations mapping found for unitProcedure: ${name}`);
      }

      if (!operationsData.every(operation => acceptableOperations.includes(operation.name))) {
        throw new BadRequestException(`Provided operations do not match acceptable list for unitProcedure: ${name}`);
      }
    }

    // If operations are acceptable, proceed with the creation
    const createdUnitProcedure = await this.prisma.unitProcedure.create(args);

    await this.rabbitProducer.emitMessage(WhMessageBrokerTopics.WhWhk01Distillery01Unitprocedure, {
      recordName: 'UnitProcedure',
      event_type: 'create',
      data: createdUnitProcedure
    });
    this.logger.info(`Created UnitProcedure: ${createdUnitProcedure.id} & pushed to topic`);
    return createdUnitProcedure;
  }

  async updateUnitProcedure<T extends Prisma.UnitProcedureUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.UnitProcedureUpdateArgs>
  ): Promise<UnitProcedure> {
    const unitProcedure = await this.prisma.unitProcedure.findFirstOrThrow({where: {id: args.where.id}}) as UnitProcedure;
    this.logger.info(`Updating Operation: ${unitProcedure.name}`);
    const name = unitProcedure.name as string;
    const operations = args.data.operations?.connect as Array<OperationWhereUniqueInput>;

    this.logger.info(`Provided operations: ${operations}`);
    if (operations.length) {
      this.logger.info(`Provided operations: ${operations}`);
      const operationsData = await Promise.all(
          operations.map(async (operation) => {
            const operationRecord = await this.prisma.operation.findUnique({
              where: { id: operation.id },
            }) as any;
            return { name: operationRecord.name, id: operationRecord.id };
          })
      );

      this.logger.info(`Provided operations: ${operationsData}`);
      const acceptableOperations = this.unitProcedureOperationsMap[name];
      this.logger.info(`Acceptable operations: ${acceptableOperations}`);
      if (!acceptableOperations) {
        throw new BadRequestException(`No operations mapping found for unitProcedure: ${name}`);
      }

      if (!operationsData.every(operation => acceptableOperations.includes(operation.name))) {
        throw new BadRequestException(`Provided operations do not match acceptable list for unitProcedure: ${name}`);
      }
    }

    return super.updateUnitProcedure(args);
  }
}
