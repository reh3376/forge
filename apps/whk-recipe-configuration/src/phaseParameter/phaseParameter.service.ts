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

type PhaseParameterOperation = "create" | "update" | "delete";
type EquipmentPhaseParameters = { [key: string]: string[] };

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  private readonly equipmentPhaseToPhaseParameterMap: EquipmentPhaseParameters =
    {
      CornAdd: ["Quantity"],
      MaltAdd: ["Quantity"],
      RyeAdd: ["Quantity"],
      WheatAdd: ["Quantity"],
      AdditiveAdd: ["Quantity"],
      GrainAdd: ["Quantity"],
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
      LiquidAdd: ["Quantity", "Speed"],
    };

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  private async validateEquipmentPhase(
    equipmentPhaseId: string,
    name: string
  ): Promise<void> {
    const equipmentPhase = await this.prisma.equipmentPhase.findFirstOrThrow({
      where: { id: equipmentPhaseId },
    });

    const acceptableParameters =
      this.equipmentPhaseToPhaseParameterMap[equipmentPhase.name];

    if (!acceptableParameters) {
      throw new BadRequestException(
        `No Equipment Phase mapping found for Phase Parameter: ${name}`
      );
    }

    if (!acceptableParameters.includes(name)) {
      throw new BadRequestException(
        `Parameter '${name}' is not valid for Equipment Phase '${equipmentPhase.name}'`
      );
    }
  }

  private async emitPhaseParameterEvent(
    eventType: PhaseParameterOperation,
    phaseParameter: PhaseParameter
  ): Promise<void> {
    const event = {
      event_type: eventType,
      data: phaseParameter,
      recordName: "PhaseParameter",
    };

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Phaseparameter,
      event
    );

    this.logger.log(
      `${eventType}d phaseParameter & pushed to topic: ${phaseParameter.name}`
    );
  }

  private async handlePhaseParameterOperation<T>(
    operation: PhaseParameterOperation,
    args: T,
    handler: (args: T) => Promise<PhaseParameter>
  ): Promise<PhaseParameter> {
    const result = await handler(args);
    await this.emitPhaseParameterEvent(operation, result);
    return result;
  }

  async createPhaseParameter<T extends Prisma.PhaseParameterCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterCreateArgs>
  ): Promise<PhaseParameter> {
    return this.handlePhaseParameterOperation(
      "create",
      args,
      super.createPhaseParameter.bind(this)
    );
  }

  async updatePhaseParameter<T extends Prisma.PhaseParameterUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterUpdateArgs>
  ): Promise<PhaseParameter> {
    return this.handlePhaseParameterOperation(
      "update",
      args,
      super.updatePhaseParameter.bind(this)
    );
  }

  async deletePhaseParameter<T extends Prisma.PhaseParameterDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PhaseParameterDeleteArgs>
  ): Promise<PhaseParameter> {
    return this.handlePhaseParameterOperation(
      "delete",
      args,
      super.deletePhaseParameter.bind(this)
    );
  }
}
