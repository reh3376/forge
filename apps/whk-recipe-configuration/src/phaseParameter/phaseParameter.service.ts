import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PhaseParameterServiceBase } from "./base/phaseParameter.service.base";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { PhaseParameter, Prisma } from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { EquipmentPhase } from "../equipmentPhase/base/EquipmentPhase";
import { EquipmentPhaseCreateNestedManyWithoutPhaseParametersInput } from "./base/EquipmentPhaseCreateNestedManyWithoutPhaseParametersInput";
import { EquipmentPhaseWhereUniqueInput } from "../equipmentPhase/base/EquipmentPhaseWhereUniqueInput";

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  private equipmentPhaseToPhaseParameterMap: { [key: string]: string[] } = {
    CornAdd: ["Quantity"],
    MaltAdd: ["Quantity"],
    RyeAdd: ["Quantity"],
    WheatAdd: ["Quantity"],
    AdditiveAdd: ["Quantity"],
    Prompt: [],
    Hold: ["Time", "Temperature"],
    Steam: ["Temperature", "Time"],
    Cooldown: ["Time", "Temperature"],
    Drop: ["FlowRate", "SprayballTime", "Time"],
    Rinse: ["Time", "Temperature"],
    DropTubToMashCooler: [
      "MashPumpSetpoint",
      "MidTemperatureSP",
      "OutTemperatureSP",
      "MashCoolerEnable",
    ],
    Fill: ["Level", "Speed", "Temperature"],
    FermDrop: ["Level"],
    FermSteam: ["Temperature", "Time"],
    DropLineSteam: ["Temperature", "Time"],
    DropTubSteam: ["Temperature", "Time"],
    CoolerSteam: ["Temperature", "Time"],
    StillRun: [
      "TowerWaterTemperatureSetpoint",
      "TowerWaterFlowSetpoint",
      "HighWineCondenserTowerWaterTemperatureSetpoint",
      "LowWineProof",
      "HighWineProof",
    ],
    GrainAdd: ["Quantity"],
    LiquidAdd: [
      "Quantity",
      "Speed", // Agitator speed
    ],
  };

  private async validateEquipmentPhase(
    equipmentPhaseId: string,
    name: string
  ): Promise<void> {
    const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({
      where: { id: equipmentPhaseId },
    });
    this.logger.log(`equipmentPhase: ${equipmentPhaseId}`);

    // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
    const acceptableEquipmentPhases =
      this.equipmentPhaseToPhaseParameterMap[equipmentPhase.name];
    this.logger.log(
      `Acceptable Parameters for Equipment Phase: ${acceptableEquipmentPhases}`
    );

    if (!acceptableEquipmentPhases) {
      throw new BadRequestException(
        `No Equipment Phase mapping found for Phase Parameter: ${name}`
      );
    }

    this.logger.log(
      `Result of includes: ${acceptableEquipmentPhases.includes(name)}`
    );
    if (!acceptableEquipmentPhases.includes(name)) {
      throw new BadRequestException(
        `Provided Equipment Phase Id does not match the acceptable list for Phase Parameter: ${name}`
      );
    }
  }

  async createPhaseParameter<T extends Prisma.PhaseParameterCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterCreateArgs>
  ): Promise<PhaseParameter> {
    const name = args.data.name as string;
    this.logger.log(`Creating Equipment Phase: ${name}`);

    // if unit procedure id is provided, check if it matches the acceptable list for the operation
    try {
      if (args.data.equipmentPhases?.connect) {
        if (Array.isArray(args.data.equipmentPhases?.connect)) {
          for (const equipmentPhaseInput of args.data.equipmentPhases.connect) {
            // args.data.equipmentPhases.connect.forEach((equipmentPhaseInput: EquipmentPhaseWhereUniqueInput) => {
            const equipmentPhaseId = equipmentPhaseInput.id as string;
            await this.validateEquipmentPhase(equipmentPhaseId, name);
          }
        }
      }
    } catch (error) {
      this.logger.log(
        `Phase Parameter being created without Equipment Phase: ${error}`
      );
    }
    const phaseParameter = await super.createPhaseParameter(args);

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Phaseparameter,
      {
        recordName: "PhaseParameter",
        event_type: "create",
        data: phaseParameter,
      }
    );

    this.logger.log(
      `Created Phase Parameter: ${phaseParameter.name} & pushed to topic`
    );
    return phaseParameter;
  }

  async updatePhaseParameter<T extends Prisma.PhaseParameterUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterUpdateArgs>
  ): Promise<PhaseParameter> {
    const phaseParameter = (await this.prisma.phaseParameter.findFirstOrThrow({
      where: { id: args.where.id },
    })) as PhaseParameter;
    this.logger.log(`Updating Phase Parameter: ${phaseParameter.name}`);
    const name = phaseParameter.name as string;
    let phaseParameterData = phaseParameter;
    if (Array.isArray(args.data.equipmentPhases?.connect)) {
      for (const equipmentPhaseInput of args.data.equipmentPhases.connect) {
        // args.data.equipmentPhases.connect.forEach((equipmentPhaseInput: EquipmentPhaseWhereUniqueInput) => {
        const equipmentPhaseId = equipmentPhaseInput.id as string;
        if (name) {
          await this.validateEquipmentPhase(equipmentPhaseId, name);
        }
      }
      phaseParameterData = await super.updatePhaseParameter(args);

      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01Phaseparameter,
        {
          recordName: "PhaseParameter",
          event_type: "update",
          data: phaseParameterData,
        }
      );

      this.logger.log(
        `Updated Phase Parameter: ${phaseParameterData.name} & pushed to topic`
      );
      return phaseParameterData;
    } else {
      const equipmentPhaseId = args.data.equipmentPhases?.connect?.id;
      const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({
        where: { id: equipmentPhaseId as string },
      });
      this.logger.log(`equipmentPhase: ${equipmentPhaseId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableEquipmentPhases =
        this.equipmentPhaseToPhaseParameterMap[equipmentPhase.name];
      this.logger.log(
        `Acceptable Parameters for Equipment Phase: ${acceptableEquipmentPhases}`
      );

      if (!acceptableEquipmentPhases) {
        throw new BadRequestException(
          `No Equipment Phase mapping found for Phase Parameter: ${name}`
        );
      }

      this.logger.log(
        `Result of includes: ${acceptableEquipmentPhases.includes(
          phaseParameter.name
        )}`
      );
      if (!acceptableEquipmentPhases.includes(phaseParameter.name)) {
        throw new BadRequestException(
          `Provided Equipment Phase Id does not match the acceptable list for Phase Parameter: ${name}`
        );
      }

      phaseParameterData = await super.updatePhaseParameter(args);

      await this.rabbitProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01Phaseparameter,
        {
          recordName: "PhaseParameter",
          event_type: "update",
          data: phaseParameterData,
        }
      );

      this.logger.log(
        `Updated Phase Parameter: ${phaseParameterData.name} & pushed to topic`
      );
    }
    return phaseParameterData;
  }
}
