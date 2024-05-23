import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EquipmentPhaseServiceBase } from "./base/equipmentPhase.service.base";
import {EquipmentPhase, Prisma} from "@prisma/client";
import {PinoLogger} from "nestjs-pino";
import {PhaseParameterWhereUniqueInput} from "../phaseParameter/base/PhaseParameterWhereUniqueInput";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class EquipmentPhaseService extends EquipmentPhaseServiceBase {
  constructor(
        protected readonly prisma: PrismaService,
        protected readonly rabbitProducer: RabbitMQProducerService,
        private logger: PinoLogger,
  ) {
    super(prisma);
  }

  private operationEquipmentPhasesMap: { [key: string]: string[] } = {
    Cook: [
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
      'GrainAdd',
      'LiquidAdd',
    ],
    FermenterSet: [
      'DropToMashCooler',
      'Fill',
      'Prompt'
    ],
    Fermenter: [
      'Run',
      'Prompt'
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

  private equipmentPhaseToPhaseParameterMap: { [key: string]: string[] } = {
    CornAdd: [
      'Quantity',
    ],
    MaltAdd: [
      'Quantity',
    ],
    RyeAdd: [
      'Quantity',
    ],
    WheatAdd: [
      'Quantity',
    ],
    AdditiveAdd: [
      'Quantity',
    ],
    Prompt: [
    ],
    Hold: [
      'Time',
      'Temperature'
    ],
    Steam: [
      'Temperature',
      'Time',
    ],
    Cooldown: [
      'Time',
      'Temperature',
    ],
    Drop: [
      'FlowRate',
      'SprayballTime',
      'Time',
    ],
    Rinse: [
      'Time',
      'Temperature',
    ],
    DropTubToMashCooler: [
      'MashPumpSetpoint',
      'MidTemperatureSP',
      'OutTemperatureSP',
      'MashCoolerEnable',
    ],
    Fill: [
      'Level',
      'Speed',
      'Temperature',
    ],
    FermDrop: [
      'Level',
    ],
    FermSteam: [
      'Temperature',
      'Time',
    ],
    DropLineSteam: [
      'Temperature',
      'Time',
    ],
    DropTubSteam: [
      'Temperature',
      'Time',
    ],
    CoolerSteam: [
      'Temperature',
      'Time',
    ],
    StillRun: [
      'TowerWaterTemperatureSetpoint',
      'TowerWaterFlowSetpoint',
      'HighWineCondenserTowerWaterTemperatureSetpoint',
      'LowWineProof',
      'HighWineProof',
    ],
    GrainAdd: [
      'Quantity',
    ],
    LiquidAdd: [
      'Quantity',
      'Speed' // Agitator speed
    ],

  }

  private equipmentPhaseTypeMap: { [key: string]: string | string[] } = {
    // Steam: 'Steam',
    // BacksetAdd: 'BacksetAdd',
    // WaterAdd: 'WaterAdd',
    // CornAdd: 'CornAdd',
    // MaltAdd: 'MaltAdd',
    // RyeAdd: 'RyeAdd',
    // WheatAdd: 'WheatAdd',
    // Drop: 'Drop',
    // PhCapture: 'PhCapture',
    // Prompt: 'Prompt',
    // Cooldown: 'Cooldown',
    // HotFlush: 'HotFlush',
    // CIP: 'CIP',
    // DropToMashCooler: 'DropToMashCooler',
    // Fill: 'Fill',
    // Run: 'Run',
    // FermenterSteam: 'FermenterSteam',
    // CoolerSteam: 'CoolerSteam',
    // DropTubSteam: 'DropTubSteam',
    // DropLineSteam: 'DropLineSteam',
    // StillStartup: 'StillStartup',
    // StillRun: 'StillRun',
    // StillShutdown: 'StillShutdown',
    // Cut: 'Cut',
    // Gauge: 'Gauge',
    // BarrelFill: 'BarrelFill',
    // Mill: 'Mill',
    GrainAdd: [
        'Corn',
        'Rye',
        'Malt',
        'Wheat',
        'Premalt',
        'Specialty'
    ],
    LiquidAdd: [
        'Water',
        'Backset',
    ],
    AdditiveAdd: [
        'Nutrient',
        'Enzyme',
        'Yeast',
        'Citric'
    ],
    Hold: [
        'Hold',
        'Cool',
        'Heat',
    ],
    Rinse: [
        'Vessel',
        'Pipe',
    ],
  }

  async createEquipmentPhase<T extends Prisma.EquipmentPhaseCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.EquipmentPhaseCreateArgs>
  ): Promise<EquipmentPhase> {
    const name = args.data.name as string;

    // check type parameter for compliance with the equipment phase type map
    const type = args.data.stepType as string;
    const equipmentPhaseType = this.equipmentPhaseTypeMap[name];
    // check if type is in the type map
    if (equipmentPhaseType && Array.isArray(equipmentPhaseType) && !equipmentPhaseType.includes(type)) {
        throw new BadRequestException(`Equipment Phase Type: ${type} is not supported for entity ${this.constructor.name}`);
    }

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

    const equipmentPhase = await super.createEquipmentPhase(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Equipmentphase, {
      event_type: 'create',
      data: equipmentPhase,
      recordName: 'EquipmentPhase',
    });
    this.logger.info(`Created equipmentPhase & pushed to topic: ${equipmentPhase.name}`);
    return equipmentPhase;
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

    const newEquipmentPhase = await super.updateEquipmentPhase(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Equipmentphase, {
      event_type: 'update',
      data: newEquipmentPhase,
      recordName: 'EquipmentPhase',
    });
    this.logger.info(`Updated equipmentPhase & pushed to topic: ${newEquipmentPhase.name}`);

    return newEquipmentPhase;
  }

  async deleteEquipmentPhase<T extends Prisma.EquipmentPhaseDeleteArgs>(
        args: Prisma.SelectSubset<T, Prisma.EquipmentPhaseDeleteArgs>
    ): Promise<EquipmentPhase> {
        const equipmentPhase = await super.deleteEquipmentPhase(args);

        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Equipmentphase, {
        event_type: 'delete',
        data: equipmentPhase,
        recordName: 'EquipmentPhase',
        });
        this.logger.info(`Deleted equipmentPhase & pushed to topic: ${equipmentPhase.name}`);
        return equipmentPhase;
    }
}
