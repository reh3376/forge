import {
  EnumEquipmentPhaseName,
  EnumEquipmentPhaseStepType,
  EnumOperationName,
  EnumPhaseParameterSetpointType,
  EnumPhaseParameterStaticName,
  EnumUnitProcedureName,
  Operation,
  ProductionOrder,
  UnitProcedure,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";

@Injectable()
export class RecipeCookCreationService {
  private username = "";
  private mashingProtocolData: any = {};
  private numberOfCooksPerFerm = 3;
  private scheduleOrderQueueId = "";
  private totalNumberOfCooks = 0;
  private executedCooks = 0;
  private mashingUnitProcedure: UnitProcedure | undefined;

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  /**
   * @description Loop through the equipment phases from the last cook
      1. Get the equipment phases and all sub-entities
      2. Use the data to create the new equipment phases and all sub-entities for the new cook
      3. Link to the new cook instance
   * @author Patrick Mannion
   *
   * @async
   * @param {string} scheduleOrderQueueId
   * @returns {*}
   */
  async createCook(
    scheduleOrderQueueId: string,
    username: string,
    numberOfCooksPerFerm: number,
    mashingProtocolData: any = {}
  ) {
    this.scheduleOrderQueueId = scheduleOrderQueueId;
    this.validateInputParameters(
      scheduleOrderQueueId,
      username,
      numberOfCooksPerFerm
    );

    return this.prisma.$transaction(async (prisma) => {
      this.username = username;
      this.mashingProtocolData = mashingProtocolData;

      this.numberOfCooksPerFerm = numberOfCooksPerFerm;
      const { mashingUnitProcedure } =
        await this.getRecipeAndMashingUnitProcedure(scheduleOrderQueueId);
      this.mashingUnitProcedure = mashingUnitProcedure;
      const productionOrder = await this.getProductionOrder(
        scheduleOrderQueueId
      );
      const lastCook = await this.getLastCook(mashingUnitProcedure?.id);

      this.logger.debug(`production order: ${productionOrder?.id}`);
      this.logger.debug(`last cook: ${lastCook?.id}`);

      if (this.isMaxCooksReached(lastCook, productionOrder)) {
        this.logger.error("No more cooks to create");
        throw new Error("No more cooks to create");
      }

      this.logger.debug(
        `Mashing protocol data: ${JSON.stringify(
          this.mashingProtocolData,
          null,
          2
        )}`
      );
      if (
        this.mashingProtocolData &&
        Object.keys(this.mashingProtocolData).length > 0
      ) {
        // Use provided mashing protocol data
        // Implementation for using mashingProtocolData would go here

        const newCook = await this.createCookOperations();
        if (!newCook) return;
        await this.createEquipmentPhases(newCook, mashingProtocolData);
        return await this.prisma.operation.findUniqueOrThrow({
          where: { id: newCook.id },
          include: {
            equipmentPhases: {
              include: { bomItem: true, phaseParameters: true },
            },
          },
        });
      } else if (lastCook) {
        const newCookInstance = await this.createNewCookInstance(
          mashingUnitProcedure,
          lastCook
        );
        this.logger.debug(`Creating equipment phases from last cook`);
        this.logger.debug(JSON.stringify(lastCook));
        await this.createEquipmentPhasesFromLastCook(
          lastCook,
          newCookInstance,
          mashingUnitProcedure
        );
        return await this.prisma.operation.findUniqueOrThrow({
          where: { id: newCookInstance.id },
          include: {
            equipmentPhases: {
              include: { bomItem: true, phaseParameters: true },
            },
          },
        });
      } else {
        this.logger.error(
          "No mashing protocol provided and no last cook found"
        );
        throw new Error("No mashing protocol provided and no last cook found");
      }
    });
  }

  private async createCookOperations() {
    const operationClassDef = await this.prisma.operation.findFirst({
      where: {
        isClassDefinition: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("Operation Class Definition:", operationClassDef);

    const newCook = await this.prisma.operation.create({
      data: {
        name: EnumOperationName.Cook,
        path: `WH/WHK01/Distillery01/Mashing01/Cook/Cook${
          this.executedCooks + 2
        }`,
        isClassDefinition: false,
        classId: { connect: { id: operationClassDef?.id } },
        revision: 0,
        description: `Cook ${this.executedCooks + 2}`,
        procedureSequenceIndex: this.executedCooks + 1,
        createdBy: this.username,
        unitProcedure: { connect: { id: this.mashingUnitProcedure?.id } },
        abbreviation: "MAS",
      },
    });

    console.log(`Created new Operation instance: ${newCook.name}`);

    return newCook;
  }

  private async getBom(scheduleOrderQueueId: string) {
    const bom = await this.prisma.bom.findFirst({
      where: {
        productionOrder: {
          some: {
            scheduleOrder: {
              scheduleOrderQueues: {
                id: scheduleOrderQueueId,
              },
            },
          },
        },
      },
    });
    return bom;
  }

  private async createEquipmentPhases(
    newCook: Operation,
    mashingProtocolData: any
  ) {
    const bom = await this.getBom(this.scheduleOrderQueueId);
    const mashingProtocol = mashingProtocolData;

    if (!newCook) {
      console.log(`Cook operation not found, skipping phase creation.`);
      return;
    }

    for (const [phaseIndex, phase] of mashingProtocol.entries()) {
      await this.processPhase(phase, phaseIndex, newCook, bom);
    }
  }

  private async processPhase(
    phase: any,
    phaseIndex: number,
    newCook: Operation,
    bom: any
  ) {
    const phaseNameMap = this.getPhaseNameMap();
    const existingPhase = await this.findExistingPhase(
      phase,
      phaseIndex,
      newCook,
      phaseNameMap
    );

    if (!existingPhase) {
      const cookOperation = await this.findCookOperation();
      if (cookOperation) {
        await this.createNewPhase(
          phase,
          phaseIndex,
          cookOperation,
          phaseNameMap,
          bom
        );
      }
    }
  }

  private getPhaseNameMap(): { [key: string]: EnumEquipmentPhaseName } {
    return {
      "Add Liquid": EnumEquipmentPhaseName.LiquidAdd,
      Hold: EnumEquipmentPhaseName.Hold,
      "Add Grain": EnumEquipmentPhaseName.GrainAdd,
      "Add Additive": EnumEquipmentPhaseName.AdditiveAdd,
    };
  }

  private async findExistingPhase(
    phase: any,
    phaseIndex: number,
    newCook: Operation,
    phaseNameMap: any
  ) {
    return await this.prisma.equipmentPhase.findFirst({
      where: {
        name:
          phaseNameMap[phase.action] ||
          (phase.action as EnumEquipmentPhaseName),
        operation: { id: newCook.id },
        operationSequenceIndex: phaseIndex,
      },
      include: { operation: true },
    });
  }

  private determineStepType(
    phase: any
  ): EnumEquipmentPhaseStepType | undefined {
    if (phase.action === "Hold") return phase.holdType;
    if (phase.action === "Add Grain") return phase.grainType;
    if (phase.action === "Add Liquid") return phase.liquidType01;
    return undefined;
  }

  private async createNewPhase(
    phase: any,
    phaseIndex: number,
    cookOperation: Operation,
    phaseNameMap: any,
    bom: any
  ) {
    const stepType = this.determineStepType(phase);
    const newPhase = await this.createPhaseRecord(
      phase,
      phaseIndex,
      cookOperation,
      stepType,
      phaseNameMap
    );

    await this.createPhaseParameters(phase, newPhase);
    if (bom) {
      await this.linkBomComponents(phase, newPhase, bom);
    }
  }

  private async createPhaseParameters(phase: any, newPhase: any) {
    const parameterData = this.buildParameterData(phase);
    for (const param of parameterData) {
      await this.createParameter(param, newPhase);
    }
  }

  private buildParameterData(phase: any) {
    const parameterData: Array<{
      name: string;
      value: number | string;
      units: string;
    }> = [];
    if (phase.temperature) {
      parameterData.push({
        name: "Temperature",
        value: phase.temperature,
        units: "°F",
      });
    }
    if (phase.time) {
      parameterData.push({ name: "Time", value: phase.time, units: "minutes" });
    }
    return parameterData;
  }

  private async createParameter(param: any, newPhase: any) {
    await this.prisma.phaseParameter.create({
      data: {
        name: param.name,
        staticName: param.name as EnumPhaseParameterStaticName,
        setpointNumericalValue: param.value as number,
        units: param.units,
        description: param.name,
        isClassDef: false,
        equipmentPhases: { connect: { id: newPhase.id } },
        createdBy: this.username,
        setpointType: EnumPhaseParameterSetpointType.Numeric,
      },
    });
  }

  private validateInputParameters(
    scheduleOrderQueueId: string,
    username: string,
    numberOfCooksPerFerm: number
  ): void {
    if (!scheduleOrderQueueId) {
      this.logger.error("scheduleOrderQueueId is required");
      throw new Error("scheduleOrderQueueId is required");
    }
    if (!username) {
      this.logger.error("username is required");
      throw new Error("username is required");
    }
    if (!numberOfCooksPerFerm || numberOfCooksPerFerm <= 0) {
      this.logger.error("numberOfCooksPerFerm must be a positive number");
      throw new Error("numberOfCooksPerFerm must be a positive number");
    }
  }

  private async getProductionOrder(scheduleOrderQueueId: string) {
    const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
      where: { id: scheduleOrderQueueId },
      include: { scheduleOrder: true },
    });
    return await this.prisma.productionOrder.findFirst({
      where: { scheduleOrderId: scheduleOrderQueue?.scheduleOrder?.id },
      include: { scheduleOrder: true },
    });
  }

  private async getRecipeAndMashingUnitProcedure(scheduleOrderQueueId: string) {
    const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
      where: { id: scheduleOrderQueueId },
      include: { scheduleOrder: { include: { productionOrders: true } } },
    });

    if (!scheduleOrderQueue?.scheduleOrder?.productionOrders) {
      this.logger.error("Associated production order not found");
      throw new Error("Associated production order not found");
    }

    const recipe = await this.prisma.recipe.findFirst({
      where: {
        productionOrders: {
          some: {
            id: scheduleOrderQueue?.scheduleOrder?.productionOrders[0].id,
          },
        },
      },
      include: { unitProcedures: true },
    });

    this.logger.debug(`recipe: ${recipe?.id}`);

    const mashingUnitProcedure = recipe?.unitProcedures.find(
      (up) => up.name === EnumUnitProcedureName.Mashing01
    );

    return { mashingUnitProcedure };
  }

  private async getLastCook(unitProcedureId: string | undefined) {
    return await this.prisma.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedureId: unitProcedureId,
      },
      orderBy: { procedureSequenceIndex: "desc" },
      include: {
        equipmentPhases: {
          include: {
            bomItem: { include: { item: true } },
            phaseParameters: true,
          },
          orderBy: { operationSequenceIndex: "asc" },
        },
      },
    });
  }

  private isMaxCooksReached(
    lastCook: Operation | null,
    productionOrder: ProductionOrder | null
  ) {
    const executedCooks =
      lastCook?.procedureSequenceIndex !== undefined
        ? lastCook.procedureSequenceIndex + 1
        : 0;
    const totalCooks = productionOrder?.totalCooks ?? 0;
    this.logger.debug(
      `executedCooks: ${executedCooks}, totalCooks: ${totalCooks}`
    );
    this.logger.debug(`production order: ${productionOrder?.id}`);
    this.totalNumberOfCooks = totalCooks;
    this.executedCooks = executedCooks;
    return executedCooks >= totalCooks;
  }

  private async createNewCookInstance(
    mashingUnitProcedure: UnitProcedure | undefined,
    lastCook: Operation | null
  ) {
    return await this.prisma.operation.create({
      data: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedureId: mashingUnitProcedure?.id,
        description: `Cook ${
          lastCook ? lastCook.procedureSequenceIndex + 2 : 0
        }`,
        createdBy: this.username,
        procedureSequenceIndex:
          lastCook?.procedureSequenceIndex !== undefined
            ? lastCook.procedureSequenceIndex + 1
            : 0,
        abbreviation: "MAS",
        path: `WH/WHK01/Distillery01/Mashing01/Cook/Cook${
          lastCook?.procedureSequenceIndex !== undefined
            ? lastCook.procedureSequenceIndex + 2
            : 1
        }`,
      },
    });
  }

  private async createEquipmentPhasesFromLastCook(
    lastCook: any,
    newCookInstance: Operation,
    mashingUnitProcedure: UnitProcedure | undefined
  ) {
    for (const phase of lastCook.equipmentPhases) {
      const newPhase = await this.createNewEquipmentPhase(
        phase,
        newCookInstance,
        mashingUnitProcedure,
        lastCook
      );
      await this.mapBomItems(newPhase, phase);
      await this.createAndMapPhaseParameters(newPhase, phase);
    }
  }

  private async createNewEquipmentPhase(
    phase: any,
    newCookInstance: Operation,
    mashingUnitProcedure: UnitProcedure | undefined,
    lastCook: Operation
  ) {
    return await this.prisma.equipmentPhase.create({
      data: {
        name: phase.name,
        path: `${mashingUnitProcedure?.path}/Cook${
          lastCook.procedureSequenceIndex + 2
        }/${phase.name}`,
        createdBy: this.username,
        operation: {
          connect: { id: newCookInstance.id },
        },
        operationSequenceIndex: phase.operationSequenceIndex,
        stepType: phase.stepType as EnumEquipmentPhaseStepType,
      },
    });
  }

  private async mapBomItems(newPhase: any, phase: any) {
    if (phase.bomItem) {
      for (const item of phase.bomItem) {
        await this.prisma.equipmentPhase.update({
          where: { id: newPhase.id },
          data: {
            bomItem: {
              connect: { id: item.id },
            },
          },
        });
      }
    }
  }

  private async createAndMapPhaseParameters(newPhase: any, phase: any) {
    if (phase.phaseParameters) {
      for (const param of phase.phaseParameters) {
        const newParam = await this.prisma.phaseParameter.create({
          data: {
            name: param.name,
            staticName: param.staticName as EnumPhaseParameterStaticName,
            setpointNumericalValue: param.setpointNumericalValue,
            units: param.units,
            description: param.name,
            isClassDef: false,
            equipmentPhases: { connect: { id: newPhase.id } },
            createdBy: this.username,
            setpointType: EnumPhaseParameterSetpointType.Numeric,
          },
        });

        await this.prisma.equipmentPhase.update({
          where: { id: newPhase.id },
          data: {
            phaseParameters: {
              connect: { id: newParam.id },
            },
          },
        });
      }
    }
  }

  private async findCookOperation(): Promise<Operation | null> {
    return await this.prisma.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedure: { id: this.mashingUnitProcedure?.id },
        procedureSequenceIndex: this.executedCooks + 1,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async linkBomComponents(phase: any, newPhase: any, bom: any) {
    const bomComponents = await this.prisma.bomItem.findMany({
      where: {
        bom: { id: bom.id },
        isClassDefinition: true,
      },
      include: { item: true },
    });

    for (const component of bomComponents) {
      if (this.shouldLinkComponent(phase, component)) {
        await this.prisma.equipmentPhase.update({
          where: { id: newPhase.id },
          data: {
            bomItem: { connect: { id: component.id } },
          },
        });
      }
    }
  }

  private shouldLinkComponent(phase: any, component: any): boolean {
    const itemNumber = component.item.itemNumber.toLowerCase();

    if (phase.action === "Add Grain" && phase.grainType) {
      if (phase.grainType === "Corn") {
        return itemNumber === "cor-dlf02-us #2 yellow dent gmo";
      }
      return itemNumber.includes(phase.grainType.toLowerCase());
    }

    if (phase.action === "Add Liquid" && phase.liquidType01) {
      return itemNumber.includes(phase.liquidType01.toLowerCase());
    }

    if (phase.action === "Add Additive" && phase.additiveType) {
      return itemNumber.includes(phase.additiveType.toLowerCase());
    }

    return false;
  }

  private async createPhaseRecord(
    phase: any,
    phaseIndex: number,
    cookOperation: Operation,
    stepType: EnumEquipmentPhaseStepType | undefined,
    phaseNameMap: { [key: string]: EnumEquipmentPhaseName }
  ) {
    return await this.prisma.equipmentPhase.create({
      data: {
        name:
          phaseNameMap[phase.action] ||
          (phase.action as EnumEquipmentPhaseName),
        path: `${this.mashingUnitProcedure?.path}/Cook${
          this.executedCooks + 2
        }/${phase.action}`,
        isClassDefinition: false,
        revision: 0,
        description: `Cook ${this.executedCooks + 2}`,
        createdBy: this.username,
        operation: { connect: { id: cookOperation.id } },
        stepType,
        operationSequenceIndex: phaseIndex,
      },
    });
  }
}
