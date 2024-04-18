import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitProcedureServiceBase } from "./base/unitProcedure.service.base";
import {Prisma, UnitProcedure} from "@prisma/client";
import {Operation} from "../operation/base/Operation";

@Injectable()
export class UnitProcedureService extends UnitProcedureServiceBase {
  constructor(protected readonly prisma: PrismaService) {
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
    const name = args.data.name as string;
    const operations = Array.isArray(args.data.operations) ? args.data.operations.map((operation: { name: any; }) => operation.name) : [];

    const acceptableOperations = this.unitProcedureOperationsMap[name];
    if (!acceptableOperations) {
      throw new BadRequestException(`No operations mapping found for unitProcedure: ${name}`);
    }

    if (!operations.every(operation => acceptableOperations.includes(operation))) {
      throw new BadRequestException(`Provided operations do not match acceptable list for unitProcedure: ${name}`);
    }

    return super.updateUnitProcedure(args);
  }
}
