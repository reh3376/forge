import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EquipmentPhaseServiceBase } from "./base/equipmentPhase.service.base";
import {EquipmentPhase, Operation, Prisma} from "@prisma/client";
import {PinoLogger} from "nestjs-pino";
import {OperationWhereUniqueInput} from "../operation/base/OperationWhereUniqueInput";
import {PhaseParameterWhereUniqueInput} from "../phaseParameter/base/PhaseParameterWhereUniqueInput";

@Injectable()
export class EquipmentPhaseService extends EquipmentPhaseServiceBase {
  constructor(
        protected readonly prisma: PrismaService,
        private logger: PinoLogger,
  ) {
    super(prisma);
  }

  private operationEquipmentPhasesMap: { [key: string]: string[] } = {
    Cook: [
      'PreSteam',
      'Steam',
      'Hold',
      'BacksetAdd',
      'WaterAdd',
      'AdditiveAdd',
      'CornAdd',
      'MaltAdd',
      'RyeAdd',
      'WheatAdd',
      'Drop',
      'PhCapture',
      'Prompt',
      'Rinse',
      'Cooldown',
      'HotFlush',
      'CIP',
    ],
    FermenterSet: [
      'DropToMashCooler',
      'Fill',
    ],
    Fermenter: [
      'Run',
    ],
    Clean: [
      'FermenterSteam',
      'CoolerSteam',
      'DropTubSteam',
      'DropLineSteam'
    ],
    StillRun: ['StillStartup', 'StillRun', 'StillShutdown'],
    TankProcessing: ['Cut', 'Hold', 'Gauge'],
    Barreling: ['BarrelFill'],
    Mill: ['Mill'],
  };

  private equipmentPhaseToPhaseParameterMap: { [key: string]: string } = {
    PreSteam: 'preSteam',      Steam: 'steam',
      Hold: 'hold',
      BacksetAdd: 'backsetAdd',
      WaterAdd: 'waterAdd',
      AdditiveAdd: 'additiveAdd',
      CornAdd: 'cornAdd',
      MaltAdd: 'maltAdd',
      RyeAdd: 'ryeAdd',
      WheatAdd: 'wheatAdd',
      Drop: 'drop',
      PhCapture: 'phCapture',
      Prompt: 'prompt',
      Rinse: 'rinse',
      Cooldown: 'cooldown',
      HotFlush: 'hotFlush',
      CIP: 'cip',
      DropToMashCooler: 'dropToMashCooler',
      Fill: 'fill',
      Run: 'run',
      FermenterSteam: 'fermenterSteam',
      CoolerSteam: 'coolerSteam',
      DropTubSteam: 'dropTubSteam',
      DropLineSteam: 'dropLineSteam',
      StillStartup: 'stillStartup',
      StillRun: 'stillRun',
      StillShutdown: 'stillShutdown',
      Cut: 'cut',
      Gauge: 'gauge',
      BarrelFill: ''
  }

  async createEquipmentPhase<T extends Prisma.EquipmentPhaseCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.EquipmentPhaseCreateArgs>
  ): Promise<EquipmentPhase> {
    const name = args.data.name as string;

    if (args.data.operation?.connect?.id) {
      const operationId = args.data.operation?.connect?.id;
      const operation = await this.prisma.operation.findFirstOrThrow({where: {id: operationId as string}});
      this.logger.info(`Operation: ${operationId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableUnitProcedures = this.operationEquipmentPhasesMap[operation.name];
      this.logger.info(`Acceptable Unit Procedures: ${acceptableUnitProcedures}`);

      if (!acceptableUnitProcedures) {
        throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
      }
      if (!acceptableUnitProcedures.every(unitProcedure => acceptableUnitProcedures.includes(args.data.name))) {
        throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
      }
    }

    const phaseParameters = args.data.phaseParameters?.connect as Array<PhaseParameterWhereUniqueInput>;
    this.logger.info(`Phase Parameters: ${phaseParameters}`);

    if (phaseParameters) {
      this.logger.info(`Provided phase parameters: ${phaseParameters}`);
      const phaseParametersData = await Promise.all(
          phaseParameters.map(async (phaseParameter) => {
            const phaseParameterRecord = await this.prisma.phaseParameter.findUnique({
              where: { id: phaseParameter.id },
            }) as any;
            return { name: phaseParameterRecord.name, id: phaseParameterRecord.id };
          })
      );

      this.logger.info(`Provided phase parameters: ${phaseParametersData}`);
      const acceptablePhaseParameters = this.equipmentPhaseToPhaseParameterMap[name];
      this.logger.info(`Acceptable phase parameters: ${acceptablePhaseParameters}`);
      if (!acceptablePhaseParameters) {
        throw new BadRequestException(`No phase parameter mapping found for equipment phase: ${name}`);
      }

      if (!phaseParametersData.every(phaseParameter => acceptablePhaseParameters.includes(phaseParameter.name))) {
        throw new BadRequestException(`Provided phase parameters do not match acceptable list for equipmentPhase: ${name}`);
      }
    }

    return super.createEquipmentPhase(args);
  }

  async updateEquipmentPhase<T extends Prisma.EquipmentPhaseUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.EquipmentPhaseUpdateArgs>
      ): Promise<EquipmentPhase> {
    const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({where: {id: args.where.id}}) as EquipmentPhase;
    this.logger.info(`Updating equipmentPhase: ${equipmentPhase.name}`);
    const name = equipmentPhase.name as string;

    if (args.data.operation?.connect?.id) {
      const operationId = args.data.operation?.connect?.id;
      const operation = await this.prisma.operation.findFirstOrThrow({where: {id: operationId as string}});
      this.logger.info(`Operation: ${operationId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableUnitProcedures = this.operationEquipmentPhasesMap[operation.name];
      this.logger.info(`Acceptable Unit Procedures: ${acceptableUnitProcedures}`);

      if (!acceptableUnitProcedures) {
        throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
      }

      if (!acceptableUnitProcedures.every(unitProcedure => acceptableUnitProcedures.includes(operation.name))) {
        throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
      }
    }

    const phaseParameters = args.data.phaseParameters?.connect as Array<PhaseParameterWhereUniqueInput>;
    this.logger.info(`Phase Parameters: ${phaseParameters}`);

    if (phaseParameters) {
      this.logger.info(`Provided phase parameters: ${phaseParameters}`);
      const phaseParametersData = await Promise.all(
          phaseParameters.map(async (phaseParameter) => {
            const phaseParameterRecord = await this.prisma.phaseParameter.findUnique({
              where: { id: phaseParameter.id },
            }) as any;
            return { name: phaseParameterRecord.name, id: phaseParameterRecord.id };
          })
      );

      this.logger.info(`Provided phase parameters: ${phaseParametersData}`);
      const acceptablePhaseParameters = this.equipmentPhaseToPhaseParameterMap[name];
      this.logger.info(`Acceptable phase parameters: ${acceptablePhaseParameters}`);
      if (!acceptablePhaseParameters) {
        throw new BadRequestException(`No phase parameter mapping found for equipment phase: ${name}`);
      }

      if (!phaseParametersData.every(phaseParameter => acceptablePhaseParameters.includes(phaseParameter.name))) {
        throw new BadRequestException(`Provided phase parameters do not match acceptable list for equipmentPhase: ${name}`);
      }
    }

    return super.updateEquipmentPhase(args);
  }
}
