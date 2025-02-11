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

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  private readonly equipmentPhaseToPhaseParameterMap: {
    [key: string]: string[];
  } = {
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

  private async validateAndEmitEvent<T>(
    operation: "create" | "update" | "delete",
    args: T,
    handler: (args: T) => Promise<PhaseParameter>
  ): Promise<PhaseParameter> {
    const result = await handler(args);
    await this.emitPhaseParameterEvent(operation, result);
    return result;
  }

  private async emitPhaseParameterEvent(
    eventType: "create" | "update" | "delete",
    phaseParameter: PhaseParameter
  ) {
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Phaseparameter,
      {
        event_type: eventType,
        data: phaseParameter,
        recordName: "PhaseParameter",
      }
    );
    this.logger.log(
      `${eventType}d phaseParameter & pushed to topic: ${phaseParameter.name}`
    );
  }

  async createPhaseParameter<T extends Prisma.PhaseParameterCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterCreateArgs>
  ): Promise<PhaseParameter> {
    return this.validateAndEmitEvent(
      "create",
      args,
      super.createPhaseParameter.bind(this)
    );
  }

  async updatePhaseParameter<T extends Prisma.PhaseParameterUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterUpdateArgs>
  ): Promise<PhaseParameter> {
    return this.validateAndEmitEvent(
      "update",
      args,
      super.updatePhaseParameter.bind(this)
    );
  }

  async deletePhaseParameter<T extends Prisma.PhaseParameterDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterDeleteArgs>
  ): Promise<PhaseParameter> {
    return this.validateAndEmitEvent(
      "delete",
      args,
      super.deletePhaseParameter.bind(this)
    );
  }
}
