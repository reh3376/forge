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
      const { recipe, mashingUnitProcedure } =
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

    const cookOperations: Operation[] = [];

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
    cookOperations.push(newCook);

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
    const totalNumberOfCooks = this.totalNumberOfCooks;

    const mashingProtocol = mashingProtocolData;

    if (!newCook) {
      console.log(`Cook operation not found, skipping phase creation.`);
      return;
    }

    // Map the provided phase names to the actual enum values
    const phaseNameMap: { [key: string]: EnumEquipmentPhaseName } = {
      "Add Liquid": EnumEquipmentPhaseName.LiquidAdd,
      Hold: EnumEquipmentPhaseName.Hold,
      "Add Grain": EnumEquipmentPhaseName.GrainAdd,
      "Add Additive": EnumEquipmentPhaseName.AdditiveAdd,
    };

    for (const [phaseIndex, phase] of mashingProtocol.entries()) {
      const existingPhase = await this.prisma.equipmentPhase.findFirst({
        where: {
          name:
            phaseNameMap[phase.action] ||
            (phase.action as EnumEquipmentPhaseName),
          operation: {
            id: newCook.id,
          },
          operationSequenceIndex: phaseIndex,
        },
        include: {
          operation: true,
        },
      });

      if (!existingPhase) {
        const cookOperation: Operation | null =
          await this.prisma.operation.findFirst({
            where: {
              name: EnumOperationName.Cook,
              isClassDefinition: false,
              unitProcedure: { id: this.mashingUnitProcedure?.id },
              procedureSequenceIndex: this.executedCooks + 1,
            },
            orderBy: { createdAt: "desc" },
          });

        if (cookOperation) {
          const stepType =
            phase.action === "Hold"
              ? phase.holdType
              : phase.action === "Add Grain"
              ? phase.grainType
              : phase.action === "Add Liquid"
              ? phase.liquidType01
              : undefined;
          const newPhase = await this.prisma.equipmentPhase.create({
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
              operation: {
                connect: {
                  id: (cookOperation).id,
                },
              },
              stepType: stepType as EnumEquipmentPhaseStepType,
              operationSequenceIndex: phaseIndex,
            },
          });
          console.log(
            `Created new Equipment Phase: ${newPhase.name} for Cook ${
              this.executedCooks + 2
            }`
          );

          // Add phase parameters based on the action
          const parameterData: {
            name: string;
            value: number | string;
            units: string;
          }[] = [];
          if (phase.temperature) {
            parameterData.push({
              name: "Temperature",
              value: phase.temperature,
              units: "°F",
            });
          }
          if (phase.time) {
            parameterData.push({
              name: "Time",
              value: phase.time,
              units: "minutes",
            });
          }

          for (const param of parameterData) {
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

          // Link BOM components to their equipment phases - these will be the "class definitions"
          if (bom) {
            const bomComponents = await this.prisma.bomItem.findMany({
              where: {
                bom: { id: bom.id },
                isClassDefinition: true,
              },
              include: {
                item: true,
              },
            });

            for (const component of bomComponents) {
              if (
                (phase.action === "Add Grain" &&
                  phase.grainType &&
                  component.item.itemNumber
                    .toLowerCase()
                    .includes(phase.grainType.toLowerCase()) &&
                  phase.grainType != "Corn") ||
                (phase.action === "Add Liquid" &&
                  phase.liquidType01 &&
                  component.item.itemNumber
                    .toLowerCase()
                    .includes(phase.liquidType01.toLowerCase())) //||
                // (phase.liquidType02 && component.item.itemNumber.toLowerCase().includes(phase.liquidType02.toLowerCase()))
              ) {
                // Check if the quantity field is present in the phase object
                if (phase.qty !== undefined) {
                  // Only match if the bomItem quantity equals the phase quantity
                  if (component.quantity === phase.qty) {
                    await this.prisma.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(
                      `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                    );
                  } else {
                    console.log(
                      `Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`
                    );
                  }
                } else if (phase.notQty !== undefined) {
                  // Only match if the bomItem quantity does not equal the phase notQty
                  if (!component.quantity === phase.notQty) {
                    await this.prisma.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(
                      `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                    );
                  } else {
                    console.log(
                      `Skipped linking BOM component ${component.item.itemNumber} due to quantity match with notQty. NotQty: ${phase.notQty}, Actual: ${component.quantity}`
                    );
                  }
                } else {
                  await this.prisma.equipmentPhase.update({
                    where: { id: newPhase.id },
                    data: {
                      bomItem: {
                        connect: { id: component.id },
                      },
                    },
                  });
                  console.log(
                    `Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                  );
                }
              } else if (phase.grainType == "Corn") {
                console.log(`Corn: ${component.item.itemNumber}`);
                if (
                  component.item.itemNumber ===
                  "COR-DLF02-US #2 Yellow Dent GMO"
                ) {
                  if (phase.qty !== undefined) {
                    // Only match if the bomItem quantity equals the phase quantity
                    if (component.quantity === phase.qty) {
                      await this.prisma.equipmentPhase.update({
                        where: { id: newPhase.id },
                        data: {
                          bomItem: {
                            connect: { id: component.id },
                          },
                        },
                      });
                      console.log(
                        `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                      );
                    } else {
                      console.log(
                        `Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`
                      );
                    }
                  } else {
                    await this.prisma.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(
                      `Linked specific corn BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                    );
                  }
                }
              } else if (
                phase.action === "Add Additive" &&
                phase.additiveType &&
                component.item.itemNumber
                  .toLowerCase()
                  .includes(phase.additiveType.toLowerCase())
              ) {
                console.log(`Add Additive: ${component.item.itemNumber}`);
                await this.prisma.equipmentPhase.update({
                  where: { id: newPhase.id },
                  data: {
                    bomItem: {
                      connect: { id: component.id },
                    },
                  },
                });
                console.log(
                  `Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                );
              }
            }
          } else {
            console.log(
              "BOM not found, skipping linking BOM components to Equipment Phases"
            );
          }
        }
      } else {
        console.log(
          `Equipment Phase ${phase.action} already exists, skipping.`
        );
      }
    }
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

    return { recipe, mashingUnitProcedure };
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
}
