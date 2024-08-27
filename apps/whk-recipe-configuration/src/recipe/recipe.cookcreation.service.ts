import { EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, Recipe, RecipeGroup, RecipeParameter, SalesOrder, UnitProcedure } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { Injectable } from "@nestjs/common";


// @Injectable()
// export class RecipeCookCreationService {
//   constructor(
//     protected readonly prisma: PrismaService,
//     protected readonly username: string,
//     protected readonly mashingProtocolData: any = {}, // if this is provded and not empty, it will be used. Otherwise, last cook will be used. 
//     protected readonly numberOfCooksPerFerm: number = 3, // TODO: this will come from the recipe parameters
//   ) {
    
//   }


  
//   /**
//    * Loop through the equipment phases from the last cook
//       1. Get the equipment phases and all sub-entities
//       2. Use the data to create the new equipment phases and all sub-entities for the new cook
//       3. Link to the new cook instance
//    * @author Patrick Mannion
//    *
//    * @async
//    * @returns {*}
//    */
//   async createCook(scheduleOrderQueueId: string) {

//     /* 
//     Use the provided identifiers to get...
//     1. the most recent mashing operation instance
//     2. The recipe and the recipe parameters used to check against over all order limits

//     */

//     // look up the recipe from the schedule order queue
//     const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
//       where: {
//         id: scheduleOrderQueueId
//       },
//       include: {
//         scheduleOrder: true
//       }
//     });
//     const scheduleOrder = await this.prisma.scheduleOrder.findFirst({
//       where: {
//         id: scheduleOrderQueue?.scheduleOrder?.id
//       },
//       include: {
//         scheduleOrderRecipe: true
//       }
//     });

//     if (!scheduleOrder) {
//       throw new Error('Schedule order not found');
//     }

//     const recipe = await this.prisma.recipe.findFirst({
//       where: {
//         id: scheduleOrder.scheduleOrderRecipe?.id
//       },
//       include: {
//         unitProcedures: true,
//         parameters: true
//       }
//     });

//     const mashingUnitProcedure = recipe?.unitProcedures.find(up => up.name === EnumUnitProcedureName.Mashing01);
//     const recipeParameters = recipe?.parameters;

//     // get the last running operation
//     const lastCook = await this.prisma.operation.findFirst({
//       where: {
//         name: EnumOperationName.Cook,
//         isClassDefinition: false,
//         unitProcedureId: mashingUnitProcedure?.id
//       },
//       orderBy: {
//         procedureSequenceIndex: 'desc',
//         // createdAt: 'desc',
//       },
//       include: {
//         equipmentPhases: {
//           include: {
//             bomItem: {
//               include: {
//                 item: true
//               }
//             },
//             phaseParameters: true
//           },
//           orderBy: {
//             operationSequenceIndex: 'asc'
//           }
//         }
//       }
//     });

//     // const numberOfCooks = recipeParameters?.find(param => param.recipeParamName === 'Number of Cooks')?.recipeSetpointValue ?? 0;
//     const executedCooks = lastCook?.procedureSequenceIndex ?? 0;
//     const totalCooks = 18; // TODO: should be added to the running order
    
//     if (executedCooks >= totalCooks) {
//       console.log(`No more cooks to create`);
//       return;
//     }

//     // Create the new cook instance, after confirming we are not over the number of cook limit
//     const newCookInstance = await this.prisma.operation.create({
//       data: {
//         name: EnumOperationName.Cook,
//         isClassDefinition: false,
//         unitProcedureId: mashingUnitProcedure?.id,
//         description: `Cook ${lastCook ? lastCook.procedureSequenceIndex + 1 : 0}`,
//         createdBy: this.username,
//         procedureSequenceIndex: lastCook ? lastCook.procedureSequenceIndex + 1 : 0,
//         abbreviation: 'MAS',
//       }
//     });

//     let mashingProtocol;
//     if (this.mashingProtocolData) {
//       mashingProtocol = this.mashingProtocolData; // If MP data provided, use it
//     } else if (lastCook) {
//       /*

//       Loop through the equipment phases from the last cook
//       1. Get the equipment phases and all sub-entities
//       2. Use the data to create the new equipment phases and all sub-entities for the new cook
//       3. Link to the new cook instance

//       */

//       for (const phase of lastCook?.equipmentPhases) {
//         // Create the new ep, uusing the last cook as basis
//         const newPhase = await this.prisma.equipmentPhase.create({
//           data: {
//             name: phase.name,
//             path: `${mashingUnitProcedure?.path}/Cook${lastCook?.procedureSequenceIndex ? lastCook.procedureSequenceIndex + 1 : 1}/${phase.name}`,
//             createdBy: this.username,
//             operation: {
//               connect: { id: newCookInstance.id }
//             }
//           }
//         });

//         // if there are bom items, map them to the new phase
//         if (phase.bomItem) {
//           for (const item of phase.bomItem) {
//             await this.prisma.equipmentPhase.update({
//               where: { id: newPhase.id },
//               data: {
//                 bomItem: {
//                   connect: { id: item.id }
//                 },
//               }
//             });
//           }
//         }

//         // if there are phase parameters, create new instance and map them to the new phase
//         if (phase.phaseParameters) {
//           for (const param of phase.phaseParameters) {
//             await this.prisma.phaseParameter.create({
//               data: {
//                 name: param.name,
//                 staticName: param.staticName as EnumPhaseParameterStaticName,
//                 setpointNumericalValue: param.setpointNumericalValue,
//                 units: param.units,
//                 description: param.name,
//                 isClassDef: false,
//                 equipmentPhases: { connect: { id: newPhase.id } },
//                 createdBy: this.username,
//                 setpointType: EnumPhaseParameterSetpointType.Numeric,
//               }
//             });

//             await this.prisma.equipmentPhase.update({
//               where: { id: newPhase.id },
//               data: {
//                 phaseParameters: {
//                   connect: { id: param.id }
//                 }
//               }
//             });
//           }
//         }
//       }
//     } else {
//       throw new Error('No mashing protocol provided and no last cook found');
//     }
//   }
// }

@Injectable()
export class RecipeCookCreationService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly username: string,
    protected readonly mashingProtocolData: any = {},
    protected readonly numberOfCooksPerFerm: number = 3,
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
  async createCook(scheduleOrderQueueId: string) {
    const { recipe, mashingUnitProcedure } = await this.getRecipeAndMashingUnitProcedure(scheduleOrderQueueId);
    const lastCook = await this.getLastCook(mashingUnitProcedure?.id);

    if (this.isMaxCooksReached(lastCook)) {
      console.log(`No more cooks to create`);
      return;
    }

    const newCookInstance = await this.createNewCookInstance(mashingUnitProcedure, lastCook);

    if (this.mashingProtocolData) {
      // Use provided mashing protocol data
      // Implementation for using mashingProtocolData would go here
    } else if (lastCook) {
      await this.createEquipmentPhasesFromLastCook(lastCook, newCookInstance, mashingUnitProcedure);
    } else {
      throw new Error('No mashing protocol provided and no last cook found');
    }
  }

  private async getRecipeAndMashingUnitProcedure(scheduleOrderQueueId: string) {
    const scheduleOrderQueue = await this.prisma.scheduleOrderQueue.findFirst({
      where: { id: scheduleOrderQueueId },
      include: { scheduleOrder: true }
    });

    const scheduleOrder = await this.prisma.scheduleOrder.findFirst({
      where: { id: scheduleOrderQueue?.scheduleOrder?.id },
      include: { scheduleOrderRecipe: true }
    });

    if (!scheduleOrder) {
      throw new Error('Schedule order not found');
    }

    const recipe = await this.prisma.recipe.findFirst({
      where: { id: scheduleOrder.scheduleOrderRecipe?.id },
      include: { unitProcedures: true, parameters: true }
    });

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

  private isMaxCooksReached(lastCook: Operation | null) {
    const executedCooks = lastCook?.procedureSequenceIndex ?? 0;
    const totalCooks = 18; // TODO: should be added to the running order
    return executedCooks >= totalCooks;
  }

  private async createNewCookInstance(mashingUnitProcedure: UnitProcedure | undefined, lastCook: Operation | null) {
    return await this.prisma.operation.create({
      data: {
        name: EnumOperationName.Cook,
        isClassDefinition: false,
        unitProcedureId: mashingUnitProcedure?.id,
        description: `Cook ${lastCook ? lastCook.procedureSequenceIndex + 1 : 0}`,
        createdBy: this.username,
        procedureSequenceIndex: lastCook ? lastCook.procedureSequenceIndex + 1 : 0,
        abbreviation: 'MAS',
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
        path: `${mashingUnitProcedure?.path}/Cook${lastCook.procedureSequenceIndex + 1}/${phase.name}`,
        createdBy: this.username,
        operation: {
          connect: { id: newCookInstance.id }
        }
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