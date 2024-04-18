import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitProcedureServiceBase } from "./base/unitProcedure.service.base";
import {Operation, Prisma, UnitProcedure} from "@prisma/client";
import {PinoLogger} from "nestjs-pino";
import {OperationWhereUniqueInput} from "../operation/base/OperationWhereUniqueInput";

@Injectable()
export class UnitProcedureService extends UnitProcedureServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
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
    const operations = Array.isArray(args.data.operations) ? args.data.operations.map((operation: { name: any; }) => operation.name) : [];

    const acceptableOperations = this.unitProcedureOperationsMap[name];
    if (!acceptableOperations) {
      throw new BadRequestException(`No operations mapping found for unitProcedure: ${name}`);
    }

    if (!operations.every(operation => acceptableOperations.includes(operation))) {
      throw new BadRequestException(`Provided operations do not match acceptable list for unitProcedure: ${name}`);
    }

    // If operations are acceptable, proceed with the creation
    return super.createUnitProcedure(args);
  }

  async updateUnitProcedure<T extends Prisma.UnitProcedureUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.UnitProcedureUpdateArgs>
  ): Promise<UnitProcedure> {
    const unitProcedure = await this.prisma.unitProcedure.findFirstOrThrow({where: {id: args.where.id}}) as UnitProcedure;
    this.logger.info(`Updating Operation: ${unitProcedure.name}`);
    const name = unitProcedure.name as string;
    const operations = args.data.operations?.connect as Array<OperationWhereUniqueInput>;
    const operationsData = await Promise.all(
        operations.map(async (operation) => {
          const operationRecord = await this.prisma.operation.findUnique({
            where: { id: operation.id },
          }) as any;
          return { name: operationRecord.name, id: operationRecord.id };
        })
    );
    this.logger.info(`Provided operations: ${operations}`);

    // const operationNames = Array.isArray(operations) ? operations.map((operation: { name: any; }) => operation.name) : [];
    this.logger.info(`Provided operations: ${operationsData}`);
    if (!operations.length) {
      throw new BadRequestException(`No operations provided for unitProcedure: ${name}`);
    }
    const acceptableOperations = this.unitProcedureOperationsMap[name];
    this.logger.info(`Acceptable operations: ${acceptableOperations}`);
    if (!acceptableOperations) {
      throw new BadRequestException(`No operations mapping found for unitProcedure: ${name}`);
    }

    if (!operationsData.every(operation => acceptableOperations.includes(operation.name))) {
      throw new BadRequestException(`Provided operations do not match acceptable list for unitProcedure: ${name}`);
    }

    return super.updateUnitProcedure(args);
  }
}
