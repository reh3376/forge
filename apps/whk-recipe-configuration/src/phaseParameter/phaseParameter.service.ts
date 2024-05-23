import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PhaseParameterServiceBase } from "./base/phaseParameter.service.base";
import {PinoLogger} from "nestjs-pino";
import {PhaseParameter, Prisma} from "@prisma/client";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private logger: PinoLogger,
  ) {
    super(prisma);
  }

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
          if (!acceptableEquipmentPhases.includes(args.data.name)) {
              throw new BadRequestException(`Provided EquipmentPhase Id does not match the acceptable list for Phase Parameter: ${name}`);
          }
      }
      const phaseParameter = await super.createPhaseParameter(args);

      await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Phaseparameter, {
          recordName: 'PhaseParameter',
          event_type: 'create',
          data: phaseParameter
      });

      this.logger.info(`Created Phase Parameter: ${phaseParameter.name} & pushed to topic`);
      return phaseParameter;
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
      this.logger.info(`Acceptable Parameters for Equipment Phase: ${acceptableEquipmentPhases}`);

      if (!acceptableEquipmentPhases) {
          throw new BadRequestException(`No Equipment Phase mapping found for Phase Parameter: ${name}`);
      }

      this.logger.info(`Result of includes: ${acceptableEquipmentPhases.includes(phaseParameter.name)}`);
      if (!acceptableEquipmentPhases.includes(phaseParameter.name)) {
          throw new BadRequestException(`Provided Equipment Phase Id does not match the acceptable list for Phase Parameter: ${name}`);
      }

      const phaseParameterData = await super.updatePhaseParameter(args);

      await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Phaseparameter, {
            recordName: 'PhaseParameter',
            event_type: 'update',
            data: phaseParameterData
      });

      this.logger.info(`Updated Phase Parameter: ${phaseParameterData.name} & pushed to topic`);
      return phaseParameterData;
  }
}
