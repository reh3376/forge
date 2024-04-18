import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OperationServiceBase } from "./base/operation.service.base";
import {Operation, Prisma} from "@prisma/client";

@Injectable()
export class OperationService extends OperationServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  private operationEquipmentPhasesMap: { [key: string]: string[] } = {
    Cook: ['Cook', 'Clean'],
    FermenterSet: ['FermenterSet', 'Fermenter', 'Clean'],
    Fermenter: ['StillRun', 'Clean'],
    Clean: ['TankProcessing', 'Barreling'],
    StillRun: ['StillRun', 'Clean'],
    TankProcessing: ['TankProcessing', 'Barreling'],
    Barreling: ['Barreling'],
    Mill: ['Mill'],
  };

  async createOperation<T extends Prisma.OperationCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.OperationCreateArgs>
  ): Promise<Operation> {
    const name = args.data.name as string;
    const equipmentPhases = Array.isArray(args.data.equipmentPhases) ? args.data.equipmentPhases.map((equipmentPhase: { name: any; }) => equipmentPhase.name) : [];

    const acceptableEquipmentPhases = this.operationEquipmentPhasesMap[name];
    if (!acceptableEquipmentPhases) {
      throw new BadRequestException(`No EquipmentPhases mapping found for unitProcedure: ${name}`);
    }

    if (!equipmentPhases.every(equipmentPhase => acceptableEquipmentPhases.includes(equipmentPhase))) {
      throw new BadRequestException(`Provided EquipmentPhases do not match acceptable list for unitProcedure: ${name}`);
    }

    // If EquipmentPhases are acceptable, proceed with the creation
    return super.createOperation(args);
  }

  async updateOperation<T extends Prisma.OperationUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.OperationUpdateArgs>
  ): Promise<Operation> {
    const name = args.data.name as string;
    const EquipmentPhases = Array.isArray(args.data.equipmentPhases) ? args.data.equipmentPhases.map((equipmentPhase: { name: any; }) => equipmentPhase.name) : [];

    const acceptableEquipmentPhases = this.operationEquipmentPhasesMap[name];
    if (!acceptableEquipmentPhases) {
      throw new BadRequestException(`No EquipmentPhases mapping found for Operation: ${name}`);
    }

    if (!EquipmentPhases.every(equipmentPhase => acceptableEquipmentPhases.includes(equipmentPhase))) {
      throw new BadRequestException(`Provided EquipmentPhases do not match acceptable list for Operation: ${name}`);
    }

    return super.updateOperation(args);
  }
}
