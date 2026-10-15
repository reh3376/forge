import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderRecipeInstanceServiceBase } from "./base/productionOrderRecipeInstance.service.base";

@Injectable()
export class ProductionOrderRecipeInstanceService extends ProductionOrderRecipeInstanceServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Creates a production order recipe instance when a schedule order queue becomes active at mashing (index = 0)
   * This method also creates instances of recipe parameters, recipe BOMs, and mashing protocols
   */
  async createProductionOrderRecipeInstanceFromScheduleQueue(
    scheduleOrderQueueId: string,
    createdBy: string
  ): Promise<any> {
    return await this.prisma.$transaction(async (prisma) => {
      // 1. Get the schedule order queue with related data
      const scheduleOrderQueue = await prisma.scheduleOrderQueue.findUnique({
        where: { id: scheduleOrderQueueId },
        include: {
          scheduleOrder: {
            include: {
              productionOrders: {
                include: {
                  recipe: {
                    include: {
                      parameters: {
                        include: {
                          units: true,
                          operation: true,
                        },
                      },
                      recipeBoms: {
                        include: {
                          recipeBomITem: {
                            include: {
                              item: true,
                              displayUnits: true,
                            },
                          },
                        },
                      },
                      mashingProtocol: {
                        include: {
                          steps: {
                            include: {
                              recipeBomItem: {
                                include: {
                                  item: true,
                                  displayUnits: true,
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!scheduleOrderQueue) {
        throw new Error(
          `Schedule order queue with id ${scheduleOrderQueueId} not found`
        );
      }

      if (scheduleOrderQueue.queueIndex !== 1) {
        throw new Error(
          `Schedule order queue must be at index 1 (next in line for mashing) to create production order recipe instance. Current index: ${scheduleOrderQueue.queueIndex}`
        );
      }

      const productionOrder =
        scheduleOrderQueue.scheduleOrder?.productionOrders?.[0];
      if (!productionOrder) {
        throw new Error(
          `No production order found for schedule order queue ${scheduleOrderQueueId}`
        );
      }

      const recipe = productionOrder.recipe;
      if (!recipe) {
        throw new Error(
          `No recipe found for production order ${productionOrder.id}`
        );
      }

      // 2. Create the production order recipe instance
      const productionOrderRecipeInstance =
        await prisma.productionOrderRecipeInstance.create({
          data: {
            productionOrder: { connect: { id: productionOrder.id } },
            recipe: { connect: { id: recipe.id } },
            createdBy,
          },
        });

      // 3. Create recipe parameter instances
      const recipeParameterInstances = [];
      if (recipe.parameters && recipe.parameters.length > 0) {
        for (const parameter of recipe.parameters) {
          const parameterInstance = await prisma.recipeParameter.create({
            data: {
              recipeParamName: parameter.recipeParamName,
              recipeParamDescription: parameter.recipeParamDescription,
              description: parameter.description,
              className: parameter.className,
              active: parameter.active,
              required: parameter.required,
              recipeSetpointType: parameter.recipeSetpointType,
              recipeNumericalSetpoint: parameter.recipeNumericalSetpoint,
              recipeSetpointBooleanValue: parameter.recipeSetpointBooleanValue,
              recipeSetpointLowerLimit: parameter.recipeSetpointLowerLimit,
              recipeSetpointUpperLimit: parameter.recipeSetpointUpperLimit,
              revision: parameter.revision,
              schemaVersion: parameter.schemaVersion,
              isClassDefinition: false, // This is an instance, not a class definition
              createdBy,
              // Link to units and operation if they exist
              ...(parameter.unitsId && {
                units: { connect: { id: parameter.unitsId } },
              }),
              ...(parameter.operationId && {
                operation: { connect: { id: parameter.operationId } },
              }),
            },
          });
          recipeParameterInstances.push(parameterInstance);
        }
      }

      // 4. Create recipe BOM instances
      const recipeBomInstances = [];
      if (recipe.recipeBoms && recipe.recipeBoms.length > 0) {
        for (const recipeBom of recipe.recipeBoms) {
          const bomInstance = await prisma.recipeBom.create({
            data: {
              revision: recipeBom.revision,
              master: false, // This is an instance, not a master
              running: true, // Set as running since it's active
              masterRecipeBom: { connect: { id: recipeBom.id } }, // Link to the master BOM
              productionOrderRecipeInstances: {
                connect: { id: productionOrderRecipeInstance.id },
              },
            },
          });

          // Create BOM item instances
          if (recipeBom.recipeBomITem && recipeBom.recipeBomITem.length > 0) {
            for (const bomItem of recipeBom.recipeBomITem) {
              await prisma.recipeBomItem.create({
                data: {
                  quantity: bomItem.quantity,
                  operation: bomItem.operation,
                  createdBy,
                  isClassDefinition: false, // This is an instance
                  recipeBoms: { connect: { id: bomInstance.id } },
                  ...(bomItem.itemId && {
                    item: { connect: { id: bomItem.itemId } },
                  }),
                  ...(bomItem.displayUnitsId && {
                    displayUnits: { connect: { id: bomItem.displayUnitsId } },
                  }),
                },
              });
            }
          }

          recipeBomInstances.push(bomInstance);
        }
      }

      // 5. Create mashing protocol instances
      const mashingProtocolInstances = [];
      if (recipe.mashingProtocol) {
        const protocolInstance = await prisma.mashingProtocol.create({
          data: {
            name: `${recipe.mashingProtocol.name}_Instance_${Date.now()}`,
            isTemplate: false,
            master: false,
            running: true, // Set as running since it's active
            revision: recipe.mashingProtocol.revision,
            templateCategory: recipe.mashingProtocol.templateCategory,
            templateDescription: recipe.mashingProtocol.templateDescription,
            createdBy,
            masterMashingProtocol: {
              connect: { id: recipe.mashingProtocol.id },
            }, // Link to the master protocol
            productionOrderRecipeInstances: {
              connect: { id: productionOrderRecipeInstance.id },
            },
          },
        });

        // Create mashing protocol step instances
        if (
          recipe.mashingProtocol.steps &&
          recipe.mashingProtocol.steps.length > 0
        ) {
          for (const step of recipe.mashingProtocol.steps) {
            await prisma.mashingProtocolStep.create({
              data: {
                index: step.index,
                stepType: step.stepType,
                holdType: step.holdType,
                stepTime: step.stepTime,
                temperatureSetpoint: step.temperatureSetpoint,
                temperatureActual: step.temperatureActual,
                heatEnabled: step.heatEnabled,
                heatTempSp: step.heatTempSp,
                coolEnabled: step.coolEnabled,
                coolTempSp: step.coolTempSp,
                agitatorEnabled: step.agitatorEnabled,
                agitatorSpdSp: step.agitatorSpdSp,
                promptMessage: step.promptMessage,
                createdBy,
                mashingProtocol: { connect: { id: protocolInstance.id } },
              },
            });
          }
        }

        mashingProtocolInstances.push(protocolInstance);
      }

      // 6. Return the complete production order recipe instance with all related instances
      return await prisma.productionOrderRecipeInstance.findUnique({
        where: { id: productionOrderRecipeInstance.id },
        include: {
          productionOrder: {
            include: {
              recipe: true,
              scheduleOrder: true,
            },
          },
          recipe: true,
          recipeBom: {
            include: {
              recipeBomITem: {
                include: {
                  item: true,
                  displayUnits: true,
                },
              },
            },
          },
          mashingProtocol: {
            include: {
              steps: {
                include: {
                  recipeBomItem: {
                    include: {
                      item: true,
                      displayUnits: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    });
  }
}
