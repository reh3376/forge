import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PhaseParameterServiceBase } from "./base/phaseParameter.service.base";
import {PinoLogger} from "nestjs-pino";
import {PhaseParameter, Prisma, UnitProcedure} from "@prisma/client";
import {OperationWhereUniqueInput} from "../operation/base/OperationWhereUniqueInput";

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      private logger: PinoLogger,
  ) {
    super(prisma);
  }

private equipmentPhaseToPhaseParameterMap: { [key: string]: string[] } = {
    PreSteam: ['preSteam'],
    PreBoil: ['preBoil'],
    Boil: ['boil'],
    PostBoil: ['postBoil'],
}

  async createPhaseParameter<T extends Prisma.PhaseParameterCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.PhaseParameterCreateArgs>
      ): Promise<PhaseParameter> {
      const name = args.data.name as string;
      this.logger.info(`Updating Equipment Phase: ${name}`);

      // if unit procedure id is provided, check if it matches the acceptable list for the operation
      if (args.data.equipmentPhase?.connect?.id) {
          const equipmentPhaseId = args.data.equipmentPhase?.connect?.id;
          const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({where: {id: equipmentPhaseId as string}});
          this.logger.info(`equipmentPhase: ${equipmentPhaseId}`);

          // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
          const acceptableEquipmentPhases = this.equipmentPhaseToPhaseParameterMap[equipmentPhase.name];
          this.logger.info(`Acceptable Equipment Phases: ${acceptableEquipmentPhases}`);

          if (!acceptableEquipmentPhases) {
              throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
          }
          if (!acceptableEquipmentPhases.every(equipmentPhase => acceptableEquipmentPhases.includes(args.data.name))) {
              throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
          }
      }

      return super.createPhaseParameter(args);
  }

  async updatePhaseParameter<T extends Prisma.PhaseParameterUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.PhaseParameterUpdateArgs>
      ): Promise<PhaseParameter> {
      const phaseParameter = await this.prisma.phaseParameter.findFirstOrThrow({where: {id: args.where.id}}) as PhaseParameter;
      this.logger.info(`Updating Phase Parameter: ${phaseParameter.name}`);
      const name = phaseParameter.name as string;
      const equipmentPhaseId = args.data.equipmentPhase?.connect?.id;
      const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({where: {id: equipmentPhaseId as string}});
      this.logger.info(`equipmentPhase: ${equipmentPhaseId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableEquipmentPhases = this.equipmentPhaseToPhaseParameterMap[equipmentPhase.name];
      this.logger.info(`Acceptable Equipment Phases: ${acceptableEquipmentPhases}`);

      if (!acceptableEquipmentPhases) {
          throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
      }
      if (!acceptableEquipmentPhases.every(ep => acceptableEquipmentPhases.includes(equipmentPhase.name))) {
          throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
      }

      return super.updatePhaseParameter(args);
  }
}
