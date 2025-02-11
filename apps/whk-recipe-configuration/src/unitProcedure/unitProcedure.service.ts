import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitProcedureServiceBase } from "./base/unitProcedure.service.base";
import { Prisma, UnitProcedure } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { OperationWhereUniqueInput } from "../operation/base/OperationWhereUniqueInput";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";

@Injectable()
export class UnitProcedureService extends UnitProcedureServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }
  private readonly unitProcedureOperationsMap: { [key: string]: string[] } = {
    Mashing01: ["Cook", "Clean"],
    Fermentation01: ["FermenterSet", "Fermenter", "Clean"],
    Distillation01: ["StillRun", "Clean"],
    Processing01: ["BlendingTank", "CisternTank", "Barreling"],
    Milling01: ["Mill"],
  };

  private async validateOperations(name: string, operations: Array<OperationWhereUniqueInput> | undefined) {
    if (!operations?.length) return;

    const operationsData = await Promise.all(
      operations.map(async (operation) => {
        const operationRecord = await this.prisma.operation.findUnique({
          where: { id: operation.id },
        });
        if (!operationRecord) {
          throw new BadRequestException(`Operation not found: ${operation.id}`);
        }
        return { name: operationRecord.name, id: operationRecord.id };
      })
    );

    this.logger.log(`Provided operations: ${operationsData}`);
    const acceptableOperations = this.unitProcedureOperationsMap[name];
    this.logger.log(`Acceptable operations: ${acceptableOperations}`);

    if (!acceptableOperations) {
      throw new BadRequestException(
        `No operations mapping found for unitProcedure: ${name}`
      );
    }

    if (!operationsData.every(operation => acceptableOperations.includes(operation.name))) {
      throw new BadRequestException(
        `Provided operations do not match acceptable list for unitProcedure: ${name}`
      );
    }
  }

  async createUnitProcedure<T extends Prisma.UnitProcedureCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UnitProcedureCreateArgs>
  ): Promise<UnitProcedure> {
    const name = args.data.name;
    const operations = args.data.operations?.connect as Array<OperationWhereUniqueInput>;

    try {
      await this.validateOperations(name, operations);
    } catch (error) {
      if (error instanceof TypeError) {
        this.logger.log(`UnitProcedure being created without operations: ${error}`);
      } else {
        throw error;
      }
    }

    const createdUnitProcedure = await this.prisma.unitProcedure.create(args);
    await this.emitUnitProcedureEvent('create', createdUnitProcedure);
    return createdUnitProcedure;
  }

  async updateUnitProcedure<T extends Prisma.UnitProcedureUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UnitProcedureUpdateArgs>
  ): Promise<UnitProcedure> {
    const unitProcedure = await this.prisma.unitProcedure.findFirstOrThrow({
      where: { id: args.where.id },
    });
    this.logger.log(`Updating Operation: ${unitProcedure.name}`);

    const operations = args.data.operations?.connect as Array<OperationWhereUniqueInput>;
    await this.validateOperations(unitProcedure.name, operations);

    const updatedUnitProcedure = await super.updateUnitProcedure(args);
    await this.emitUnitProcedureEvent('update', updatedUnitProcedure);
    return updatedUnitProcedure;
  }

  private async emitUnitProcedureEvent(
    eventType: 'create' | 'update',
    unitProcedure: UnitProcedure
  ) {
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Unitprocedure,
      {
        recordName: "UnitProcedure",
        event_type: eventType,
        data: unitProcedure,
      }
    );
    this.logger.log(
      `${eventType}d UnitProcedure: ${unitProcedure.id} & pushed to topic`
    );
  }
}
