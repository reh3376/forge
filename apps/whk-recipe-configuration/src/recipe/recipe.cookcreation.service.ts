import { EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, ProductionOrder, Recipe, RecipeGroup, RecipeParameter, SalesOrder, UnitProcedure } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class RecipeCookCreationService {
  private username: string = ''
  private mashingProtocolData: any = {}
  private numberOfCooksPerFerm: number = 3
  constructor(
    protected readonly prisma: PrismaService,
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
    this.username = username;
    this.mashingProtocolData = {};

    this.numberOfCooksPerFerm = numberOfCooksPerFerm;
    const { recipe, mashingUnitProcedure } = await this.getRecipeAndMashingUnitProcedure(scheduleOrderQueueId);
    const productionOrder = await this.getProductionOrder(scheduleOrderQueueId);
    const lastCook = await this.getLastCook(mashingUnitProcedure?.id);

    console.log(`production order: ${productionOrder?.id}`);
    console.log(`last cook: ${lastCook?.id}`);

    if (this.isMaxCooksReached(lastCook, productionOrder)) {
      console.log(`No more cooks to create`);
      return;
    }

    const newCookInstance = await this.createNewCookInstance(mashingUnitProcedure, lastCook);

    console.log(`Mashing protocol data: ${JSON.stringify(this.mashingProtocolData, null, 2)}`);
    if (this.mashingProtocolData && Object.keys(this.mashingProtocolData).length > 0) {
      // Use provided mashing protocol data
      // Implementation for using mashingProtocolData would go here
    } else if (lastCook) {
      console.log(`Creating equipment phases from last cook`);
      console.log(JSON.stringify(lastCook));
      await this.createEquipmentPhasesFromLastCook(lastCook, newCookInstance, mashingUnitProcedure);
    } else {
      throw new Error('No mashing protocol provided and no last cook found');
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

    const scheduleOrder = await this.prisma.scheduleOrder.findFirst({
      where: { id: scheduleOrderQueue?.scheduleOrder?.id },
      include: { scheduleOrderRecipe: true }
    });

    if (!scheduleOrderQueue?.scheduleOrder?.productionOrders) {
      throw new Error('Associated production order not found');
    }

    const recipe = await this.prisma.recipe.findFirst({
      where: { productionOrders: {some: {id: scheduleOrderQueue?.scheduleOrder?.productionOrders[0].id}} },
      include: { unitProcedures: true, parameters: true }
    });

    console.log(`recipe: ${recipe?.id}`);

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
    const executedCooks = lastCook?.procedureSequenceIndex ?? 0;
    const totalCooks = productionOrder?.totalCooks ?? 0;
    console.log(`executedCooks: ${executedCooks}, totalCooks: ${totalCooks}`);
    console.log(`production order: ${productionOrder?.id}`);
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
    // TODO: can we use typing for the lastCook?
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
        operationSequenceIndex: phase.operationSequenceIndex
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