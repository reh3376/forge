import { EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, ProductionOrder, Recipe, RecipeGroup, RecipeParameter, SalesOrder, UnitProcedure } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";

@Injectable()
export class RecipeCookCreationService {
  private username: string = ''
  private mashingProtocolData: any = {}
  private numberOfCooksPerFerm: number = 3
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
  async createCook(scheduleOrderQueueId: string, username: string, numberOfCooksPerFerm: number) {
    this.validateInputParameters(scheduleOrderQueueId, username, numberOfCooksPerFerm);

    return this.prisma.$transaction(async (prisma) => {
      this.username = username;
      this.mashingProtocolData = {};

      this.numberOfCooksPerFerm = numberOfCooksPerFerm;
      const { recipe, mashingUnitProcedure } = await this.getRecipeAndMashingUnitProcedure(scheduleOrderQueueId);
      const productionOrder = await this.getProductionOrder(scheduleOrderQueueId);
      const lastCook = await this.getLastCook(mashingUnitProcedure?.id);

      this.logger.debug(`production order: ${productionOrder?.id}`);
      this.logger.debug(`last cook: ${lastCook?.id}`);

      if (this.isMaxCooksReached(lastCook, productionOrder)) {
        this.logger.error('No more cooks to create');
        throw new Error('No more cooks to create');
      }

      const newCookInstance = await this.createNewCookInstance(mashingUnitProcedure, lastCook);

      this.logger.debug(`Mashing protocol data: ${JSON.stringify(this.mashingProtocolData, null, 2)}`);
      if (this.mashingProtocolData && Object.keys(this.mashingProtocolData).length > 0) {
        // Use provided mashing protocol data
        // Implementation for using mashingProtocolData would go here
        this.logger.error('Not implemented');
        throw new Error('Not implemented');
      } else if (lastCook) {
        this.logger.debug(`Creating equipment phases from last cook`);
        this.logger.debug(JSON.stringify(lastCook));
        await this.createEquipmentPhasesFromLastCook(lastCook, newCookInstance, mashingUnitProcedure);
        return await this.prisma.operation.findUniqueOrThrow({
          where: { id: newCookInstance.id },
          include: { equipmentPhases: {include: {bomItem: true, phaseParameters: true}} }
        });
      } else {
        this.logger.error('No mashing protocol provided and no last cook found');
        throw new Error('No mashing protocol provided and no last cook found');
      }
    });
  }

  private validateInputParameters(scheduleOrderQueueId: string, username: string, numberOfCooksPerFerm: number): void {
    if (!scheduleOrderQueueId) {
      this.logger.error('scheduleOrderQueueId is required');
      throw new Error('scheduleOrderQueueId is required');
    }
    if (!username) {
      this.logger.error('username is required');
      throw new Error('username is required');
    }
    if (!numberOfCooksPerFerm || numberOfCooksPerFerm <= 0) {
      this.logger.error('numberOfCooksPerFerm must be a positive number');
      throw new Error('numberOfCooksPerFerm must be a positive number');
    }
  }

  private async getProductionOrder(scheduleOrderQueueId: string) {
    const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
      where: { id: scheduleOrderQueueId },
      include: { scheduleOrder: true }
    });
    return await this.prisma.productionOrder.findFirst({
      where: { scheduleOrderId: scheduleOrderQueue?.scheduleOrder?.id },
      include: { scheduleOrder: true }
    });
  }

  private async getRecipeAndMashingUnitProcedure(scheduleOrderQueueId: string) {
    const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
      where: { id: scheduleOrderQueueId },
      include: { scheduleOrder: {include: {productionOrders: true}} }
    });

    if (!scheduleOrderQueue?.scheduleOrder?.productionOrders) {
      this.logger.error('Associated production order not found');
      throw new Error('Associated production order not found');
    }

    const recipe = await this.prisma.recipe.findFirst({
      where: { productionOrders: {some: {id: scheduleOrderQueue?.scheduleOrder?.productionOrders[0].id}} },
      include: { unitProcedures: true, parameters: true }
    });

    this.logger.debug(`recipe: ${recipe?.id}`);

    const mashingUnitProcedure = recipe?.unitProcedures.find(up => up.name === EnumUnitProcedureName.Mashing01);

    return { recipe, mashingUnitProcedure };
  }

  private async getLastCook(unitProcedureId: string | undefined) {
    return await this.prisma.operation.findFirst({
      where: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedureId: unitProcedureId
      },
      orderBy: { procedureSequenceIndex: 'desc' },
      include: {
        equipmentPhases: {
          include: {
            bomItem: { include: { item: true } },
            phaseParameters: true
          },
          orderBy: { operationSequenceIndex: 'asc' }
        }
      }
    });
  }

  private isMaxCooksReached(lastCook: Operation | null, productionOrder: ProductionOrder | null) {
    const executedCooks = lastCook?.procedureSequenceIndex !== undefined ? lastCook.procedureSequenceIndex + 1 : 0;
    const totalCooks = productionOrder?.totalCooks ?? 0;
    this.logger.debug(`executedCooks: ${executedCooks}, totalCooks: ${totalCooks}`);
    this.logger.debug(`production order: ${productionOrder?.id}`);
    return executedCooks >= totalCooks;
  }

  private async createNewCookInstance(mashingUnitProcedure: UnitProcedure | undefined, lastCook: Operation | null) {
    return await this.prisma.operation.create({
      data: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedureId: mashingUnitProcedure?.id,
        description: `Cook ${lastCook ? lastCook.procedureSequenceIndex + 2 : 0}`,
        createdBy: this.username,
        procedureSequenceIndex: lastCook?.procedureSequenceIndex !== undefined ? lastCook.procedureSequenceIndex + 1 : 0,
        abbreviation: 'MAS',
        path: `WH/WHK01/Distillery01/Mashing01/Cook/Cook${lastCook?.procedureSequenceIndex !== undefined ? lastCook.procedureSequenceIndex + 2 : 1}`
      }
    });
  }

  private async createEquipmentPhasesFromLastCook(lastCook: any, newCookInstance: Operation, mashingUnitProcedure: UnitProcedure | undefined) {
    for (const phase of lastCook.equipmentPhases) {
      const newPhase = await this.createNewEquipmentPhase(phase, newCookInstance, mashingUnitProcedure, lastCook);
      await this.mapBomItems(newPhase, phase);
      await this.createAndMapPhaseParameters(newPhase, phase);
    }
  }

  private async createNewEquipmentPhase(phase: any, newCookInstance: Operation, mashingUnitProcedure: UnitProcedure | undefined, lastCook: Operation) {
    return await this.prisma.equipmentPhase.create({
      data: {
        name: phase.name,
        path: `${mashingUnitProcedure?.path}/Cook${lastCook.procedureSequenceIndex + 2}/${phase.name}`,
        createdBy: this.username,
        operation: {
          connect: { id: newCookInstance.id }
        },
        operationSequenceIndex: phase.operationSequenceIndex,
        stepType: phase.stepType as EnumEquipmentPhaseStepType
      }
    });
  }

  private async mapBomItems(newPhase: any, phase: any) {
    if (phase.bomItem) {
      for (const item of phase.bomItem) {
        await this.prisma.equipmentPhase.update({
          where: { id: newPhase.id },
          data: {
            bomItem: {
              connect: { id: item.id }
            },
          }
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
          }
        });

        await this.prisma.equipmentPhase.update({
          where: { id: newPhase.id },
          data: {
            phaseParameters: {
              connect: { id: newParam.id }
            }
          }
        });
      }
    }
  }
}