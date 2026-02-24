import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ClsService } from "nestjs-cls";
import { BomCalculationService } from "../recipeBom/bom-calculation.service";
import { ProductionEventService } from "../productionEvent/productionEvent.service";
import { BatchDeviationService } from "../batchDeviation/batchDeviation.service";
import {
  ScheduleOrderRecipeInstance,
  RecipeBomActual,
  RecipeParameterActual,
  MashingProtocolStepActual,
  EnumRecipeInstanceStatus,
  EnumProductionPhase,
  EnumRecipeParameterCategory,
  AuditAction,
  Prisma,
  PrismaClient,
} from "@prisma/client";

// Type for Prisma transaction client - using Prisma's built-in transaction type
type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Input types for recording actuals
export interface RecordBomActualInput {
  recipeBomItemId: string;
  quantityPlanned?: number;
  quantityActual: number;
  lotNumber?: string;
  inventoryId?: string;
  consumedAt?: Date;
  createdBy: string;
}

export interface RecordParameterActualInput {
  recipeParameterId: string;
  valuePlanned?: number;
  valueActual?: number;
  booleanValueActual?: boolean;
  textValueActual?: string;
  recordedBy: string;
  notes?: string;
}

export interface RecordStepActualInput {
  mashingProtocolStepId: string;
  actualValue: number;
  timeActualValue?: number;
  stepCompletedAt?: Date;
  createdBy: string;
}

// Actuals summary type
export interface ActualsSummary {
  bomActuals: {
    itemId: string | null;
    itemName: string;
    totalQuantityPlanned: number;
    totalQuantityActual: number;
    lots: string[];
  }[];
  parameterActuals: {
    parameterName: string;
    category: EnumRecipeParameterCategory | null;
    valuePlanned: number | null;
    valueActual: number | null;
  }[];
  yields: {
    totalWineGallons: number;
    totalProofGallons: number;
  };
}

@Injectable()
export class ScheduleOrderRecipeInstanceService {
  private readonly logger = new Logger(ScheduleOrderRecipeInstanceService.name);

  constructor(
    protected readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cls: ClsService,
    private readonly bomCalculationService: BomCalculationService,
    @Inject(forwardRef(() => ProductionEventService))
    private readonly productionEventService: ProductionEventService,
    @Inject(forwardRef(() => BatchDeviationService))
    private readonly batchDeviationService: BatchDeviationService
  ) {
    // Log to confirm change tracking code is loaded
    this.logger.log(
      "🔄 ScheduleOrderRecipeInstanceService initialized WITH CHANGE TRACKING v1"
    );
  }

  /**
   * Creates a ScheduleOrderRecipeInstance when a ScheduleOrder becomes active (queue position 0)
   * This is the hybrid model entry point - actuals are tracked at SO level during combined execution
   */
  async createFromScheduleOrder(
    scheduleOrderId: string,
    createdBy: string
  ): Promise<ScheduleOrderRecipeInstance> {
    return await this.prisma.$transaction(
      async (prisma) => {
        // 1. Get the schedule order with related data
        const scheduleOrder = await prisma.scheduleOrder.findUnique({
          where: { id: scheduleOrderId },
          include: {
            scheduleOrderRecipe: {
              include: {
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
                        recipeBomItem: true,
                      },
                    },
                  },
                },
                parameters: {
                  include: {
                    units: true,
                  },
                },
              },
            },
            productionOrders: true,
            scheduleOrderRecipeInstance: true,
          },
        });

        if (!scheduleOrder) {
          throw new Error(
            `Schedule order with id ${scheduleOrderId} not found`
          );
        }

        // Check if instance already exists
        if (scheduleOrder.scheduleOrderRecipeInstance) {
          this.logger.warn(
            `ScheduleOrderRecipeInstance already exists for SO ${scheduleOrderId}`
          );
          return scheduleOrder.scheduleOrderRecipeInstance;
        }

        const recipe = scheduleOrder.scheduleOrderRecipe;
        if (!recipe) {
          throw new Error(
            `No recipe found for schedule order ${scheduleOrderId}`
          );
        }

        // Validate grain weight is set before creating instance (required for BOM calculations)
        if (
          !scheduleOrder.totalGrainWeight ||
          scheduleOrder.totalGrainWeight <= 0
        ) {
          throw new Error(
            `Cannot create recipe instance for schedule order ${scheduleOrderId}: totalGrainWeight must be set and > 0 (current value: ${scheduleOrder.totalGrainWeight})`
          );
        }

        // 2. Create the ScheduleOrderRecipeInstance
        const instance = await prisma.scheduleOrderRecipeInstance.create({
          data: {
            scheduleOrder: { connect: { id: scheduleOrderId } },
            recipe: { connect: { id: recipe.id } },
            status: EnumRecipeInstanceStatus.Created,
            currentPhase: EnumProductionPhase.Mashing,
            createdBy,
          },
        });

        // 3. Create SO-level RecipeBom copies
        // Track mapping from master RecipeBomItem IDs to new SO RecipeBomItem IDs
        const bomItemIdMap = new Map<string, string>();

        if (recipe.recipeBoms && recipe.recipeBoms.length > 0) {
          for (const recipeBom of recipe.recipeBoms) {
            const bomInstance = await prisma.recipeBom.create({
              data: {
                revision: recipeBom.revision,
                master: false,
                running: true,
                masterRecipeBom: { connect: { id: recipeBom.id } },
                scheduleOrderRecipeInstance: { connect: { id: instance.id } },
              },
            });

            // Create BOM item instances (including formula configuration)
            if (recipeBom.recipeBomITem && recipeBom.recipeBomITem.length > 0) {
              for (const bomItem of recipeBom.recipeBomITem) {
                const newBomItem = await prisma.recipeBomItem.create({
                  data: {
                    quantity: bomItem.quantity,
                    operation: bomItem.operation,
                    createdBy,
                    isClassDefinition: false,
                    recipeBoms: { connect: { id: bomInstance.id } },
                    ...(bomItem.itemId && {
                      item: { connect: { id: bomItem.itemId } },
                    }),
                    ...(bomItem.displayUnitsId && {
                      displayUnits: { connect: { id: bomItem.displayUnitsId } },
                    }),
                    // Copy formula configuration from master BOM item (only if set)
                    ...(bomItem.calculationMode && {
                      calculationMode: bomItem.calculationMode,
                    }),
                    ...(bomItem.formulaType && {
                      formulaType: bomItem.formulaType,
                    }),
                    ...(bomItem.formulaMultiplier != null && {
                      formulaMultiplier: bomItem.formulaMultiplier,
                    }),
                    ...(bomItem.customExpression && {
                      customExpression: bomItem.customExpression,
                    }),
                    ...(bomItem.formulaLibraryId && {
                      formulaLibrary: {
                        connect: { id: bomItem.formulaLibraryId },
                      },
                    }),
                    ...(bomItem.expressionVariables && {
                      expressionVariables: bomItem.expressionVariables,
                    }),
                    ...(bomItem.expressionValidated != null && {
                      expressionValidated: bomItem.expressionValidated,
                    }),
                  },
                });
                // Store mapping from master BOM item ID to new SO BOM item ID
                bomItemIdMap.set(bomItem.id, newBomItem.id);
              }
            }
          }
        }

        // 4. Create SO-level MashingProtocol copy
        if (recipe.mashingProtocol) {
          const protocolInstance = await prisma.mashingProtocol.create({
            data: {
              name: `${recipe.mashingProtocol.name}_SO_${scheduleOrderId.slice(
                -6
              )}_${Date.now()}`,
              isTemplate: false,
              master: false,
              running: true,
              revision: recipe.mashingProtocol.revision,
              templateCategory: recipe.mashingProtocol.templateCategory,
              templateDescription: recipe.mashingProtocol.templateDescription,
              createdBy,
              masterMashingProtocol: {
                connect: { id: recipe.mashingProtocol.id },
              },
              scheduleOrderRecipeInstance: { connect: { id: instance.id } },
            },
          });

          // Create step instances
          if (
            recipe.mashingProtocol.steps &&
            recipe.mashingProtocol.steps.length > 0
          ) {
            for (const step of recipe.mashingProtocol.steps) {
              // Map master recipeBomItem IDs to new SO recipeBomItem IDs
              const newRecipeBomItemIds: string[] = [];
              if (step.recipeBomItem && step.recipeBomItem.length > 0) {
                for (const bomItem of step.recipeBomItem) {
                  const newId = bomItemIdMap.get(bomItem.id);
                  if (newId) {
                    newRecipeBomItemIds.push(newId);
                  }
                }
              }

              await prisma.mashingProtocolStep.create({
                data: {
                  index: step.index,
                  stepType: step.stepType,
                  holdType: step.holdType,
                  stepTime: step.stepTime,
                  temperatureSetpoint: step.temperatureSetpoint,
                  heatEnabled: step.heatEnabled,
                  heatTempSp: step.heatTempSp,
                  coolEnabled: step.coolEnabled,
                  coolTempSp: step.coolTempSp,
                  agitatorEnabled: step.agitatorEnabled,
                  agitatorSpdSp: step.agitatorSpdSp,
                  promptMessage: step.promptMessage,
                  createdBy,
                  mashingProtocol: { connect: { id: protocolInstance.id } },
                  // Connect to the new SO-level recipeBomItems
                  ...(newRecipeBomItemIds.length > 0 && {
                    recipeBomItem: {
                      connect: newRecipeBomItemIds.map((id) => ({ id })),
                    },
                  }),
                },
              });
            }
          }
        }

        // 5. Create SO-level RecipeParameter copies (BATCH OPERATION for performance)
        if (recipe.parameters && recipe.parameters.length > 0) {
          // Deduplicate parameters by name - keep first occurrence of each
          const seenNames = new Set<string>();
          const uniqueParams = recipe.parameters.filter((param) => {
            const name = param.recipeParamName || "";
            if (seenNames.has(name)) {
              return false;
            }
            seenNames.add(name);
            return true;
          });

          if (uniqueParams.length < recipe.parameters.length) {
            this.logger.warn(
              `Deduplicated parameters: ${recipe.parameters.length} -> ${
                uniqueParams.length
              } (removed ${
                recipe.parameters.length - uniqueParams.length
              } duplicates)`
            );
          }

          this.logger.log(
            `Creating ${uniqueParams.length} SO-level RecipeParameter copies for instance ${instance.id} via batch operation`
          );
          try {
            // Build array of parameter data for batch insert
            const paramData = uniqueParams.map((param) => ({
              recipeParamName: param.recipeParamName,
              recipeParamDescription: param.recipeParamDescription,
              description: param.description,
              recipeSetpointType: param.recipeSetpointType,
              recipeNumericalSetpoint: param.recipeNumericalSetpoint,
              recipeSetpointBooleanValue: param.recipeSetpointBooleanValue,
              recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
              recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
              parameterCategory: param.parameterCategory,
              configurable: param.configurable,
              required: param.required,
              master: false,
              running: true,
              createdBy,
              masterRecipeParameterId: param.id, // createMany uses direct ID instead of connect
              scheduleOrderRecipeInstanceId: instance.id,
              unitsId: param.unitsId, // createMany doesn't support nested connects
            }));

            // Batch create all parameters in one operation (15x faster than sequential)
            await prisma.recipeParameter.createMany({
              data: paramData,
              skipDuplicates: false, // Fail if duplicates to catch issues
            });

            // Log batch audit entry
            await this.logBatchAudit({
              entityType: "RecipeParameter",
              action: "CREATE",
              count: paramData.length,
              summary: {
                scheduleOrderRecipeInstanceId: instance.id,
                scheduleOrderId,
                parameterNames: uniqueParams.map((p) => p.recipeParamName),
              },
              userId: createdBy,
            });

            this.logger.log(
              `Successfully batch created ${paramData.length} RecipeParameter records for instance ${instance.id}`
            );
          } catch (err) {
            this.logger.error(
              `Failed to batch create RecipeParameter copies: ${err}`
            );
            throw err;
          }
        }

        // 6. Calculate initial BOM quantities based on grain/water loads
        // Note: totalGrainWeight is validated above, so we know it exists
        try {
          await this.bomCalculationService.calculateInitialBomQuantities(
            instance.id,
            {
              grainLoad: scheduleOrder.totalGrainWeight,
              waterLoad: scheduleOrder.totalWaterVolume || undefined,
              mashBill: recipe.customerCode || undefined,
              recipeId: recipe.id,
            }
          );
          this.logger.log(
            `Successfully calculated initial BOM quantities for instance ${instance.id}`
          );
        } catch (err) {
          this.logger.error(
            `Failed to calculate initial BOM quantities: ${err}`
          );
          // Don't throw - continue with instance creation even if BOM calculation fails
        }

        this.logger.log(
          `Created ScheduleOrderRecipeInstance ${instance.id} for SO ${scheduleOrderId}`
        );

        // Return with includes
        return prisma.scheduleOrderRecipeInstance.findUnique({
          where: { id: instance.id },
          include: {
            scheduleOrder: true,
            recipe: true,
            mashingProtocols: { include: { steps: true } },
            recipeBoms: {
              include: { recipeBomITem: { include: { item: true } } },
            },
            recipeParameters: { include: { units: true } },
          },
        }) as Promise<ScheduleOrderRecipeInstance>;
      },
      {
        // Increase timeout for complex recipe instance creation with remote DB
        // Increased to 90s to provide safety margin with batch optimizations
        timeout: 90000, // 90 seconds (was 30s)
      }
    );
  }

  /**
   * Creates a ScheduleOrderRecipeInstance using an existing Prisma transaction client.
   * This allows the creation to be part of a larger atomic transaction.
   * Used when creating ScheduleOrder and its instance must both succeed or fail together.
   */
  async createFromScheduleOrderWithTransaction(
    tx: PrismaTransactionClient,
    scheduleOrderId: string,
    createdBy: string
  ): Promise<ScheduleOrderRecipeInstance> {
    this.logger.log(
      `[createFromScheduleOrderWithTransaction] ENTERED - SO: ${scheduleOrderId}, createdBy: ${createdBy}`
    );

    // 1. Get the schedule order with related data
    this.logger.log(
      `[createFromScheduleOrderWithTransaction] About to query SO ${scheduleOrderId}`
    );
    const scheduleOrder = await tx.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        scheduleOrderRecipe: {
          include: {
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
                    recipeBomItem: true,
                  },
                },
              },
            },
            parameters: {
              include: {
                units: true,
              },
            },
          },
        },
        productionOrders: true,
        scheduleOrderRecipeInstance: true,
      },
    });

    this.logger.log(
      `[createFromScheduleOrderWithTransaction] Query completed for SO ${scheduleOrderId}`
    );

    if (!scheduleOrder) {
      this.logger.error(
        `[createFromScheduleOrderWithTransaction] Schedule order ${scheduleOrderId} not found`
      );
      throw new Error(`Schedule order with id ${scheduleOrderId} not found`);
    }

    this.logger.log(
      `[createFromScheduleOrderWithTransaction] SO found, checking for existing instance`
    );

    // Check if instance already exists
    if (scheduleOrder.scheduleOrderRecipeInstance) {
      this.logger.warn(
        `ScheduleOrderRecipeInstance already exists for SO ${scheduleOrderId}`
      );
      return scheduleOrder.scheduleOrderRecipeInstance;
    }

    const recipe = scheduleOrder.scheduleOrderRecipe;
    this.logger.log(
      `[createFromScheduleOrderWithTransaction] Recipe check: ${
        recipe ? recipe.id : "NULL"
      }`
    );

    if (!recipe) {
      this.logger.error(
        `[createFromScheduleOrderWithTransaction] No recipe found for SO ${scheduleOrderId}`
      );
      throw new Error(`No recipe found for schedule order ${scheduleOrderId}`);
    }

    // Validate grain weight is set before creating instance (required for BOM calculations)
    if (
      !scheduleOrder.totalGrainWeight ||
      scheduleOrder.totalGrainWeight <= 0
    ) {
      this.logger.error(
        `[createFromScheduleOrderWithTransaction] No totalGrainWeight for SO ${scheduleOrderId}`
      );
      throw new Error(
        `Cannot create recipe instance for schedule order ${scheduleOrderId}: totalGrainWeight must be set and > 0 (current value: ${scheduleOrder.totalGrainWeight})`
      );
    }

    this.logger.log(
      `[createFromScheduleOrderWithTransaction] Creating instance for recipe ${
        recipe.id
      }, has ${recipe.recipeBoms?.length || 0} BOMs, ${
        recipe.parameters?.length || 0
      } params, mashingProtocol: ${recipe.mashingProtocol ? "yes" : "no"}`
    );

    // 2. Create the ScheduleOrderRecipeInstance
    this.logger.log(
      `[createFromScheduleOrderWithTransaction] Creating ScheduleOrderRecipeInstance...`
    );
    let instance;
    try {
      instance = await tx.scheduleOrderRecipeInstance.create({
        data: {
          scheduleOrder: { connect: { id: scheduleOrderId } },
          recipe: { connect: { id: recipe.id } },
          status: EnumRecipeInstanceStatus.Created,
          currentPhase: EnumProductionPhase.Mashing,
          createdBy,
        },
      });
      this.logger.log(
        `[createFromScheduleOrderWithTransaction] Created instance ${instance.id}`
      );
    } catch (err) {
      this.logger.error(
        `[createFromScheduleOrderWithTransaction] Failed to create instance: ${err}`
      );
      throw err;
    }

    // 3. Create SO-level RecipeBom copies
    // Track mapping from master RecipeBomItem IDs to new SO RecipeBomItem IDs
    const bomItemIdMap = new Map<string, string>();

    if (recipe.recipeBoms && recipe.recipeBoms.length > 0) {
      this.logger.log(
        `[createFromScheduleOrderWithTransaction] Creating ${recipe.recipeBoms.length} BOM copies...`
      );
      try {
        for (const recipeBom of recipe.recipeBoms) {
          const bomInstance = await tx.recipeBom.create({
            data: {
              revision: recipeBom.revision,
              master: false,
              running: true,
              masterRecipeBom: { connect: { id: recipeBom.id } },
              scheduleOrderRecipeInstance: { connect: { id: instance.id } },
            },
          });

          // Create BOM item instances (including formula configuration)
          if (recipeBom.recipeBomITem && recipeBom.recipeBomITem.length > 0) {
            for (const bomItem of recipeBom.recipeBomITem) {
              const newBomItem = await tx.recipeBomItem.create({
                data: {
                  quantity: bomItem.quantity,
                  operation: bomItem.operation,
                  createdBy,
                  isClassDefinition: false,
                  recipeBoms: { connect: { id: bomInstance.id } },
                  ...(bomItem.itemId && {
                    item: { connect: { id: bomItem.itemId } },
                  }),
                  ...(bomItem.displayUnitsId && {
                    displayUnits: { connect: { id: bomItem.displayUnitsId } },
                  }),
                  // Copy formula configuration from master BOM item (only if set)
                  ...(bomItem.calculationMode && {
                    calculationMode: bomItem.calculationMode,
                  }),
                  ...(bomItem.formulaType && {
                    formulaType: bomItem.formulaType,
                  }),
                  ...(bomItem.formulaMultiplier != null && {
                    formulaMultiplier: bomItem.formulaMultiplier,
                  }),
                  ...(bomItem.customExpression && {
                    customExpression: bomItem.customExpression,
                  }),
                  ...(bomItem.formulaLibraryId && {
                    formulaLibrary: {
                      connect: { id: bomItem.formulaLibraryId },
                    },
                  }),
                  ...(bomItem.expressionVariables && {
                    expressionVariables: bomItem.expressionVariables,
                  }),
                  ...(bomItem.expressionValidated != null && {
                    expressionValidated: bomItem.expressionValidated,
                  }),
                },
              });
              // Store mapping from master BOM item ID to new SO BOM item ID
              bomItemIdMap.set(bomItem.id, newBomItem.id);
            }
          }
        }
        this.logger.log(
          `[createFromScheduleOrderWithTransaction] BOM copies created successfully, mapped ${bomItemIdMap.size} BOM items`
        );
      } catch (err) {
        this.logger.error(
          `[createFromScheduleOrderWithTransaction] Failed to create BOM copies: ${err}`
        );
        throw err;
      }
    }

    // 4. Create SO-level MashingProtocol copy
    if (recipe.mashingProtocol) {
      this.logger.log(
        `[createFromScheduleOrderWithTransaction] Creating MashingProtocol copy...`
      );
      try {
        const protocolInstance = await tx.mashingProtocol.create({
          data: {
            name: `${recipe.mashingProtocol.name}_SO_${scheduleOrderId.slice(
              -6
            )}_${Date.now()}`,
            isTemplate: false,
            master: false,
            running: true,
            revision: recipe.mashingProtocol.revision,
            templateCategory: recipe.mashingProtocol.templateCategory,
            templateDescription: recipe.mashingProtocol.templateDescription,
            createdBy,
            masterMashingProtocol: {
              connect: { id: recipe.mashingProtocol.id },
            },
            scheduleOrderRecipeInstance: { connect: { id: instance.id } },
          },
        });

        // Create step instances
        if (
          recipe.mashingProtocol.steps &&
          recipe.mashingProtocol.steps.length > 0
        ) {
          this.logger.log(
            `[createFromScheduleOrderWithTransaction] Creating ${recipe.mashingProtocol.steps.length} mashing steps...`
          );
          for (const step of recipe.mashingProtocol.steps) {
            // Map master recipeBomItem IDs to new SO recipeBomItem IDs
            const newRecipeBomItemIds: string[] = [];
            if (step.recipeBomItem && step.recipeBomItem.length > 0) {
              for (const bomItem of step.recipeBomItem) {
                const newId = bomItemIdMap.get(bomItem.id);
                if (newId) {
                  newRecipeBomItemIds.push(newId);
                }
              }
            }

            await tx.mashingProtocolStep.create({
              data: {
                index: step.index,
                stepType: step.stepType,
                holdType: step.holdType,
                stepTime: step.stepTime,
                temperatureSetpoint: step.temperatureSetpoint,
                heatEnabled: step.heatEnabled,
                heatTempSp: step.heatTempSp,
                coolEnabled: step.coolEnabled,
                coolTempSp: step.coolTempSp,
                agitatorEnabled: step.agitatorEnabled,
                agitatorSpdSp: step.agitatorSpdSp,
                promptMessage: step.promptMessage,
                createdBy,
                mashingProtocol: { connect: { id: protocolInstance.id } },
                // Connect to the new SO-level recipeBomItems
                ...(newRecipeBomItemIds.length > 0 && {
                  recipeBomItem: {
                    connect: newRecipeBomItemIds.map((id) => ({ id })),
                  },
                }),
              },
            });
          }
        }
        this.logger.log(
          `[createFromScheduleOrderWithTransaction] MashingProtocol copy created successfully`
        );
      } catch (err) {
        this.logger.error(
          `[createFromScheduleOrderWithTransaction] Failed to create MashingProtocol copy: ${err}`
        );
        throw err;
      }
    }

    // 5. Create SO-level RecipeParameter copies (BATCH OPERATION for performance)
    if (recipe.parameters && recipe.parameters.length > 0) {
      // Deduplicate parameters by name - keep first occurrence of each
      const seenParamNames = new Set<string>();
      const uniqueParameters = recipe.parameters.filter((param) => {
        const name = param.recipeParamName || "";
        if (seenParamNames.has(name)) {
          return false;
        }
        seenParamNames.add(name);
        return true;
      });

      if (uniqueParameters.length < recipe.parameters.length) {
        this.logger.warn(
          `Deduplicated parameters: ${recipe.parameters.length} -> ${
            uniqueParameters.length
          } (removed ${
            recipe.parameters.length - uniqueParameters.length
          } duplicates)`
        );
      }

      this.logger.log(
        `Creating ${uniqueParameters.length} SO-level RecipeParameter copies for instance ${instance.id} via batch operation`
      );
      try {
        // Build array of parameter data for batch insert
        const paramData = uniqueParameters.map((param) => ({
          recipeParamName: param.recipeParamName,
          recipeParamDescription: param.recipeParamDescription,
          description: param.description,
          recipeSetpointType: param.recipeSetpointType,
          recipeNumericalSetpoint: param.recipeNumericalSetpoint,
          recipeSetpointBooleanValue: param.recipeSetpointBooleanValue,
          recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
          recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
          parameterCategory: param.parameterCategory,
          configurable: param.configurable,
          required: param.required,
          master: false,
          running: true,
          createdBy,
          masterRecipeParameterId: param.id, // createMany uses direct ID instead of connect
          scheduleOrderRecipeInstanceId: instance.id,
          unitsId: param.unitsId, // createMany doesn't support nested connects
        }));

        // Batch create all parameters in one operation (15x faster than sequential)
        await tx.recipeParameter.createMany({
          data: paramData,
          skipDuplicates: false, // Fail if duplicates to catch issues
        });

        // Log batch audit entry
        await this.logBatchAudit({
          entityType: "RecipeParameter",
          action: "CREATE",
          count: paramData.length,
          summary: {
            scheduleOrderRecipeInstanceId: instance.id,
            scheduleOrderId,
            parameterNames: uniqueParameters.map((p) => p.recipeParamName),
          },
          userId: createdBy,
        });

        this.logger.log(
          `Successfully batch created ${paramData.length} RecipeParameter records for instance ${instance.id}`
        );
      } catch (err) {
        this.logger.error(
          `Failed to batch create RecipeParameter copies: ${err}`
        );
        throw err;
      }
    }

    // 6. Calculate initial BOM quantities based on grain/water loads
    // Note: totalGrainWeight is validated above, so we know it exists
    try {
      await this.bomCalculationService.calculateInitialBomQuantities(
        instance.id,
        {
          grainLoad: scheduleOrder.totalGrainWeight ?? undefined,
          waterLoad: scheduleOrder.totalWaterVolume ?? undefined,
          mashBill: recipe.customerCode ?? undefined,
          recipeId: recipe.id,
        }
      );
      this.logger.log(
        `Successfully calculated initial BOM quantities for instance ${instance.id}`
      );
    } catch (err) {
      this.logger.error(`Failed to calculate initial BOM quantities: ${err}`);
      // Don't throw - continue with instance creation even if BOM calculation fails
    }

    this.logger.log(
      `[createFromScheduleOrderWithTransaction] SUCCESS - Created ScheduleOrderRecipeInstance ${instance.id} for SO ${scheduleOrderId}`
    );

    // Return the instance (without additional fetching to stay within transaction)
    return instance;
  }

  /**
   * Log a batch audit entry for bulk create operations
   * This helper method creates a summary audit log for batch operations to avoid per-record overhead
   * @param params Audit parameters including entity type, count, summary, and user info
   */
  private async logBatchAudit(params: {
    entityType: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    count: number;
    summary: Record<string, any>;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      // Get audit context from CLS if not provided
      const auditContext = {
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      };

      // Try to get from CLS if not provided
      if (!auditContext.ipAddress || !auditContext.userAgent) {
        try {
          auditContext.ipAddress =
            auditContext.ipAddress || this.cls.get("ipAddress");
          auditContext.userAgent =
            auditContext.userAgent || this.cls.get("userAgent");
        } catch {
          // CLS context not available, use defaults
          auditContext.ipAddress = auditContext.ipAddress || "internal";
          auditContext.userAgent =
            auditContext.userAgent || "system-batch-operation";
        }
      }

      await this.auditService.logBatchCreate({
        entityType: params.entityType,
        count: params.count,
        userId: params.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        summary: {
          ...params.summary,
          batchOperation: true,
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.log(
        `Batch audit logged: ${params.action} ${params.count} ${params.entityType} records`
      );
    } catch (error) {
      this.logger.error(
        `Failed to log batch audit for ${params.entityType}:`,
        error
      );
      // Don't throw - audit failure shouldn't break transaction
    }
  }

  /**
   * Transition the instance to a new production phase
   */
  async transitionToPhase(
    instanceId: string,
    phase: EnumProductionPhase
  ): Promise<ScheduleOrderRecipeInstance> {
    const instance = await this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { id: instanceId },
      include: {
        batches: true,
      },
    });

    if (!instance) {
      throw new Error(`ScheduleOrderRecipeInstance ${instanceId} not found`);
    }

    const previousPhase = instance.currentPhase;

    // Update status based on phase
    let status = instance.status;
    if (phase === EnumProductionPhase.Barreling) {
      status = EnumRecipeInstanceStatus.InSeparation;
    }

    const updatedInstance =
      await this.prisma.scheduleOrderRecipeInstance.update({
        where: { id: instanceId },
        data: {
          currentPhase: phase,
          status,
          separationStarted: phase === EnumProductionPhase.Barreling,
        },
      });

    // Log production events for each batch associated with this instance
    if (instance.batches && instance.batches.length > 0) {
      for (const batch of instance.batches) {
        try {
          // Log phase completed event for previous phase (if there was one)
          if (previousPhase && previousPhase !== phase) {
            await this.productionEventService.logPhaseCompleted(
              batch.id,
              previousPhase,
              { instanceId, scheduleOrderId: instance.scheduleOrderId }
            );
          }

          // Log phase started event for new phase
          await this.productionEventService.logPhaseStarted(batch.id, phase, {
            instanceId,
            scheduleOrderId: instance.scheduleOrderId,
          });
        } catch (error) {
          // Log but don't fail - event logging should not block phase transition
          this.logger.warn(
            `Failed to log production event for batch ${batch.id}: ${error}`
          );
        }
      }
    }

    this.logger.log(
      `Transitioned instance ${instanceId} from ${previousPhase} to ${phase}`
    );

    return updatedInstance;
  }

  /**
   * Record a BOM actual (material consumption)
   */
  async recordBomActual(
    instanceId: string,
    input: RecordBomActualInput
  ): Promise<RecipeBomActual> {
    const instance = await this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { id: instanceId },
      include: {
        batches: true,
      },
    });

    if (!instance) {
      throw new Error(`ScheduleOrderRecipeInstance ${instanceId} not found`);
    }

    // Get the BOM item details for event logging
    const bomItem = await this.prisma.recipeBomItem.findUnique({
      where: { id: input.recipeBomItemId },
      include: {
        item: true,
        displayUnits: true,
      },
    });

    const actual = await this.prisma.recipeBomActual.create({
      data: {
        scheduleOrderRecipeInstance: { connect: { id: instanceId } },
        recipeBomItem: { connect: { id: input.recipeBomItemId } },
        quantityPlanned: input.quantityPlanned,
        quantityActual: input.quantityActual,
        lotNumber: input.lotNumber,
        inventoryId: input.inventoryId,
        consumedAt: input.consumedAt || new Date(),
        createdBy: input.createdBy,
      },
    });

    // Log material consumed event for each batch associated with this instance
    if (instance.batches && instance.batches.length > 0 && bomItem) {
      const itemName = bomItem.item?.itemName || "Unknown Item";
      const units = bomItem.displayUnits?.abbreviation || "units";

      for (const batch of instance.batches) {
        try {
          await this.productionEventService.logMaterialConsumed(
            batch.id,
            itemName,
            input.quantityActual,
            units,
            input.lotNumber,
            instance.currentPhase || undefined,
            {
              instanceId,
              scheduleOrderId: instance.scheduleOrderId,
              recipeBomItemId: input.recipeBomItemId,
              recipeBomActualId: actual.id,
              inventoryId: input.inventoryId,
            }
          );
        } catch (error) {
          // Log but don't fail - event logging should not block material recording
          this.logger.warn(
            `Failed to log material consumed event for batch ${batch.id}: ${error}`
          );
        }
      }
    }

    return actual;
  }

  /**
   * Record a parameter actual (input setpoint or output yield)
   * Auto-detects deviations when value exceeds parameter limits
   */
  async recordParameterActual(
    instanceId: string,
    input: RecordParameterActualInput
  ): Promise<RecipeParameterActual> {
    const instance = await this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { id: instanceId },
      include: {
        batches: true,
      },
    });

    if (!instance) {
      throw new Error(`ScheduleOrderRecipeInstance ${instanceId} not found`);
    }

    // Fetch the recipe parameter to get limits
    const recipeParameter = await this.prisma.recipeParameter.findUnique({
      where: { id: input.recipeParameterId },
    });

    // Create the actual record
    const actual = await this.prisma.recipeParameterActual.create({
      data: {
        scheduleOrderRecipeInstance: { connect: { id: instanceId } },
        recipeParameter: { connect: { id: input.recipeParameterId } },
        valuePlanned: input.valuePlanned,
        valueActual: input.valueActual,
        booleanValueActual: input.booleanValueActual,
        textValueActual: input.textValueActual,
        recordedAt: new Date(),
        recordedBy: input.recordedBy,
        notes: input.notes,
        createdBy: input.recordedBy,
      },
    });

    // Auto-detect deviations if we have numeric values and limits
    if (
      recipeParameter &&
      recipeParameter.recipeParamName &&
      input.valueActual != null &&
      (recipeParameter.recipeSetpointUpperLimit != null ||
        recipeParameter.recipeSetpointLowerLimit != null)
    ) {
      const plannedValue =
        input.valuePlanned ?? recipeParameter.recipeNumericalSetpoint ?? 0;

      // Fetch units if available
      const units = recipeParameter.unitsId
        ? await this.prisma.units.findUnique({
            where: { id: recipeParameter.unitsId },
          })
        : null;

      // Check if value is out of spec and create deviation for each batch
      for (const batch of instance.batches || []) {
        try {
          await this.batchDeviationService.autoDetectFromParameterActual(
            batch.id,
            recipeParameter.recipeParamName,
            plannedValue,
            input.valueActual,
            recipeParameter.recipeSetpointUpperLimit,
            recipeParameter.recipeSetpointLowerLimit,
            units?.abbreviation || null,
            instance.currentPhase || undefined,
            undefined, // stepIndex
            undefined // triggerEventId
          );
        } catch (error) {
          this.logger.warn(
            `Failed to auto-detect deviation for batch ${batch.id}: ${error}`
          );
        }
      }
    }

    return actual;
  }

  /**
   * Record yields (convenience method for output parameters)
   */
  async recordYields(
    instanceId: string,
    yields: { wineGallons?: number; proofGallons?: number },
    recordedBy: string
  ): Promise<RecipeParameterActual[]> {
    const results: RecipeParameterActual[] = [];

    // Find or create the yield parameters
    if (yields.wineGallons !== undefined) {
      let wineGallonsParam = await this.prisma.recipeParameter.findFirst({
        where: {
          recipeParamName: { contains: "wineGallons", mode: "insensitive" },
          parameterCategory: EnumRecipeParameterCategory.Output,
        },
      });

      if (!wineGallonsParam) {
        wineGallonsParam = await this.prisma.recipeParameter.create({
          data: {
            recipeParamName: "totalWineGallons",
            description: "Total wine gallons yielded",
            parameterCategory: EnumRecipeParameterCategory.Output,
            recipeSetpointType: "Numeric",
            createdBy: recordedBy,
          },
        });
      }

      const actual = await this.recordParameterActual(instanceId, {
        recipeParameterId: wineGallonsParam.id,
        valueActual: yields.wineGallons,
        recordedBy,
      });
      results.push(actual);
    }

    if (yields.proofGallons !== undefined) {
      let proofGallonsParam = await this.prisma.recipeParameter.findFirst({
        where: {
          recipeParamName: { contains: "proofGallons", mode: "insensitive" },
          parameterCategory: EnumRecipeParameterCategory.Output,
        },
      });

      if (!proofGallonsParam) {
        proofGallonsParam = await this.prisma.recipeParameter.create({
          data: {
            recipeParamName: "totalProofGallons",
            description: "Total proof gallons yielded",
            parameterCategory: EnumRecipeParameterCategory.Output,
            recipeSetpointType: "Numeric",
            createdBy: recordedBy,
          },
        });
      }

      const actual = await this.recordParameterActual(instanceId, {
        recipeParameterId: proofGallonsParam.id,
        valueActual: yields.proofGallons,
        recordedBy,
      });
      results.push(actual);
    }

    return results;
  }

  /**
   * Get instance with all actuals included
   */
  async getWithActuals(instanceId: string) {
    return this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { id: instanceId },
      include: {
        scheduleOrder: {
          include: {
            productionOrders: {
              include: {
                customer: true,
              },
            },
          },
        },
        recipe: true,
        recipeBomActuals: {
          include: {
            recipeBomItem: { include: { item: true } },
          },
        },
        recipeParameterActuals: {
          include: {
            recipeParameter: true,
          },
        },
        separationEvent: {
          include: {
            fifoAllocations: {
              include: {
                productionOrder: true,
                lots: true,
              },
            },
          },
        },
        recipeBoms: {
          include: {
            recipeBomITem: {
              include: {
                item: true,
              },
            },
          },
        },
        mashingProtocols: {
          include: {
            steps: true,
            mashingProtocolStepActuals: true,
          },
        },
      },
    });
  }

  /**
   * Get actuals summary for reporting/separation
   */
  async getActualsSummary(instanceId: string): Promise<ActualsSummary> {
    const instance = await this.getWithActuals(instanceId);

    if (!instance) {
      throw new Error(`ScheduleOrderRecipeInstance ${instanceId} not found`);
    }

    // Aggregate BOM actuals by item
    const bomMap = new Map<
      string,
      {
        itemId: string | null;
        itemName: string;
        totalQuantityPlanned: number;
        totalQuantityActual: number;
        lots: Set<string>;
      }
    >();

    for (const actual of instance.recipeBomActuals || []) {
      const itemId = actual.recipeBomItem?.itemId || "unknown";
      const existing = bomMap.get(itemId);
      if (existing) {
        existing.totalQuantityPlanned += actual.quantityPlanned || 0;
        existing.totalQuantityActual += actual.quantityActual || 0;
        if (actual.lotNumber) {
          existing.lots.add(actual.lotNumber);
        }
      } else {
        bomMap.set(itemId, {
          itemId: actual.recipeBomItem?.itemId || null,
          itemName: actual.recipeBomItem?.item?.itemName || "Unknown",
          totalQuantityPlanned: actual.quantityPlanned || 0,
          totalQuantityActual: actual.quantityActual || 0,
          lots: new Set(actual.lotNumber ? [actual.lotNumber] : []),
        });
      }
    }

    // Get parameter actuals
    const parameterActuals = (instance.recipeParameterActuals || []).map(
      (actual) => ({
        parameterName: actual.recipeParameter.recipeParamName || "Unknown",
        category: actual.recipeParameter.parameterCategory,
        valuePlanned: actual.valuePlanned,
        valueActual: actual.valueActual,
      })
    );

    // Calculate yields from output parameters
    let totalWineGallons = 0;
    let totalProofGallons = 0;
    for (const actual of instance.recipeParameterActuals || []) {
      const paramName =
        actual.recipeParameter.recipeParamName?.toLowerCase() || "";
      if (
        actual.recipeParameter.parameterCategory ===
        EnumRecipeParameterCategory.Output
      ) {
        if (
          paramName.includes("winegallons") ||
          paramName.includes("wine_gallons")
        ) {
          totalWineGallons += actual.valueActual || 0;
        } else if (
          paramName.includes("proofgallons") ||
          paramName.includes("proof_gallons")
        ) {
          totalProofGallons += actual.valueActual || 0;
        }
      }
    }

    return {
      bomActuals: Array.from(bomMap.values()).map((b) => ({
        ...b,
        lots: Array.from(b.lots),
      })),
      parameterActuals,
      yields: {
        totalWineGallons,
        totalProofGallons,
      },
    };
  }

  /**
   * Find by schedule order ID
   */
  async findByScheduleOrderId(scheduleOrderId: string) {
    return this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { scheduleOrderId },
    });
  }

  /**
   * Mark instance as completed
   */
  async markCompleted(
    instanceId: string
  ): Promise<ScheduleOrderRecipeInstance> {
    return this.prisma.scheduleOrderRecipeInstance.update({
      where: { id: instanceId },
      data: {
        status: EnumRecipeInstanceStatus.Completed,
        separationCompletedAt: new Date(),
      },
    });
  }

  /**
   * Get SO instance with all editable components (BOM, Parameters, MashingProtocol)
   * Used for the recipe editing modal
   */
  async getWithAllComponents(scheduleOrderId: string) {
    return this.prisma.scheduleOrderRecipeInstance.findFirst({
      where: { scheduleOrderId },
      include: {
        scheduleOrder: {
          select: {
            id: true,
            status: true,
            name: true, // ScheduleOrder uses 'name' field
          },
        },
        recipe: {
          select: {
            id: true,
            Recipe: true, // Recipe uses 'Recipe' as the name field
            revision: true,
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
        mashingProtocols: {
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
              orderBy: { index: "asc" },
            },
          },
        },
        recipeParameters: {
          include: {
            units: true,
            masterRecipeParameter: {
              select: { id: true, recipeParamName: true },
            },
          },
        },
      },
    });
  }

  /**
   * Update SO-level recipe components (BOM items, parameters, mashing steps)
   * This is a batch update within a transaction with change tracking for audit
   */
  async updateComponents(
    instanceId: string,
    input: {
      bomItems?: Array<{
        id: string;
        quantity?: number;
      }>;
      parameters?: Array<{
        id: string;
        recipeNumericalSetpoint?: number;
        recipeSetpointBooleanValue?: boolean;
        recipeSetpointUpperLimit?: number;
        recipeSetpointLowerLimit?: number;
      }>;
      mashingSteps?: Array<{
        id: string;
        index?: number;
        stepTime?: number;
        temperatureSetpoint?: number;
        heatEnabled?: boolean;
        heatTempSp?: number;
        coolEnabled?: boolean;
        coolTempSp?: number;
        agitatorEnabled?: boolean;
        agitatorSpdSp?: number;
        promptMessage?: string;
      }>;
    },
    updatedBy: string
  ): Promise<ScheduleOrderRecipeInstance> {
    // PHASE 1: Capture current values BEFORE the transaction
    const oldValues = await this.captureCurrentComponentValues(
      instanceId,
      input
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Verify the instance exists
        const instance = await tx.scheduleOrderRecipeInstance.findUnique({
          where: { id: instanceId },
        });

        if (!instance) {
          throw new Error(
            `ScheduleOrderRecipeInstance ${instanceId} not found`
          );
        }

        // Update RecipeBomItems
        // Note: RecipeBomItem.updatedBy is DateTime? in schema (unlike other models which use String?)
        if (input.bomItems && input.bomItems.length > 0) {
          for (const item of input.bomItems) {
            await tx.recipeBomItem.update({
              where: { id: item.id },
              data: {
                ...(item.quantity !== undefined && { quantity: item.quantity }),
                updatedBy: new Date(),
              },
            });
          }
          this.logger.log(
            `Updated ${input.bomItems.length} BOM items for instance ${instanceId}`
          );
        }

        // Update RecipeParameters (SO copies)
        if (input.parameters && input.parameters.length > 0) {
          for (const param of input.parameters) {
            await tx.recipeParameter.update({
              where: { id: param.id },
              data: {
                ...(param.recipeNumericalSetpoint !== undefined && {
                  recipeNumericalSetpoint: param.recipeNumericalSetpoint,
                }),
                ...(param.recipeSetpointBooleanValue !== undefined && {
                  recipeSetpointBooleanValue: param.recipeSetpointBooleanValue,
                }),
                ...(param.recipeSetpointUpperLimit !== undefined && {
                  recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
                }),
                ...(param.recipeSetpointLowerLimit !== undefined && {
                  recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
                }),
                updatedBy,
              },
            });
          }
          this.logger.log(
            `Updated ${input.parameters.length} parameters for instance ${instanceId}`
          );
        }

        // Update MashingProtocolSteps
        if (input.mashingSteps && input.mashingSteps.length > 0) {
          for (const step of input.mashingSteps) {
            await tx.mashingProtocolStep.update({
              where: { id: step.id },
              data: {
                ...(step.index !== undefined && { index: step.index }),
                ...(step.stepTime !== undefined && { stepTime: step.stepTime }),
                ...(step.temperatureSetpoint !== undefined && {
                  temperatureSetpoint: step.temperatureSetpoint,
                }),
                ...(step.heatEnabled !== undefined && {
                  heatEnabled: step.heatEnabled,
                }),
                ...(step.heatTempSp !== undefined && {
                  heatTempSp: step.heatTempSp,
                }),
                ...(step.coolEnabled !== undefined && {
                  coolEnabled: step.coolEnabled,
                }),
                ...(step.coolTempSp !== undefined && {
                  coolTempSp: step.coolTempSp,
                }),
                ...(step.agitatorEnabled !== undefined && {
                  agitatorEnabled: step.agitatorEnabled,
                }),
                ...(step.agitatorSpdSp !== undefined && {
                  agitatorSpdSp: step.agitatorSpdSp,
                }),
                ...(step.promptMessage !== undefined && {
                  promptMessage: step.promptMessage,
                }),
                updatedBy,
              },
            });
          }
          this.logger.log(
            `Updated ${input.mashingSteps.length} mashing steps for instance ${instanceId}`
          );
        }

        // Return the updated instance with all components
        return tx.scheduleOrderRecipeInstance.findUnique({
          where: { id: instanceId },
          include: {
            scheduleOrder: true,
            recipe: true,
            recipeBoms: {
              include: {
                recipeBomITem: {
                  include: { item: true, displayUnits: true },
                },
              },
            },
            mashingProtocols: {
              include: { steps: { orderBy: { index: "asc" } } },
            },
            recipeParameters: {
              include: { units: true },
            },
          },
        }) as Promise<ScheduleOrderRecipeInstance>;
      },
      {
        // Increased timeout for complex recipe instance creation
        // Provides safety margin with batch optimizations
        timeout: 90000, // 90 seconds (was 30s)
      }
    );

    // PHASE 2: Create audit log entry AFTER successful transaction
    await this.createComponentChangeAuditLog(
      instanceId,
      input,
      oldValues,
      updatedBy
    );

    return result;
  }

  /**
   * Capture current values of components before updating them
   * Used for change tracking audit logs
   */
  private async captureCurrentComponentValues(
    instanceId: string,
    input: {
      bomItems?: Array<{ id: string; quantity?: number }>;
      parameters?: Array<{
        id: string;
        recipeNumericalSetpoint?: number;
        recipeSetpointBooleanValue?: boolean;
        recipeSetpointUpperLimit?: number;
        recipeSetpointLowerLimit?: number;
      }>;
      mashingSteps?: Array<{
        id: string;
        index?: number;
        stepTime?: number;
        temperatureSetpoint?: number;
        heatEnabled?: boolean;
        heatTempSp?: number;
        coolEnabled?: boolean;
        coolTempSp?: number;
        agitatorEnabled?: boolean;
        agitatorSpdSp?: number;
        promptMessage?: string;
      }>;
    }
  ): Promise<{
    bomItems: Map<string, { quantity: number | null; itemName: string }>;
    parameters: Map<
      string,
      {
        recipeParamName: string;
        recipeNumericalSetpoint: number | null;
        recipeSetpointBooleanValue: boolean | null;
        recipeSetpointUpperLimit: number | null;
        recipeSetpointLowerLimit: number | null;
      }
    >;
    mashingSteps: Map<
      string,
      {
        index: number | null;
        stepType: string | null;
        stepTime: number | null;
        temperatureSetpoint: number | null;
        heatEnabled: boolean | null;
        heatTempSp: number | null;
        coolEnabled: boolean | null;
        coolTempSp: number | null;
        agitatorEnabled: boolean | null;
        agitatorSpdSp: number | null;
        promptMessage: string | null;
      }
    >;
  }> {
    const result = {
      bomItems: new Map<
        string,
        { quantity: number | null; itemName: string }
      >(),
      parameters: new Map<
        string,
        {
          recipeParamName: string;
          recipeNumericalSetpoint: number | null;
          recipeSetpointBooleanValue: boolean | null;
          recipeSetpointUpperLimit: number | null;
          recipeSetpointLowerLimit: number | null;
        }
      >(),
      mashingSteps: new Map<
        string,
        {
          index: number | null;
          stepType: string | null;
          stepTime: number | null;
          temperatureSetpoint: number | null;
          heatEnabled: boolean | null;
          heatTempSp: number | null;
          coolEnabled: boolean | null;
          coolTempSp: number | null;
          agitatorEnabled: boolean | null;
          agitatorSpdSp: number | null;
          promptMessage: string | null;
        }
      >(),
    };

    // Fetch BOM items
    if (input.bomItems && input.bomItems.length > 0) {
      const bomItemIds = input.bomItems.map((i) => i.id);
      const bomItems = await this.prisma.recipeBomItem.findMany({
        where: { id: { in: bomItemIds } },
        include: { item: true },
      });
      for (const item of bomItems) {
        result.bomItems.set(item.id, {
          quantity: item.quantity,
          itemName: item.item?.itemName || "Unknown Item",
        });
      }
    }

    // Fetch parameters
    if (input.parameters && input.parameters.length > 0) {
      const paramIds = input.parameters.map((p) => p.id);
      const params = await this.prisma.recipeParameter.findMany({
        where: { id: { in: paramIds } },
      });
      for (const param of params) {
        result.parameters.set(param.id, {
          recipeParamName: param.recipeParamName || "Unknown Parameter",
          recipeNumericalSetpoint: param.recipeNumericalSetpoint,
          recipeSetpointBooleanValue: param.recipeSetpointBooleanValue,
          recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
          recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
        });
      }
    }

    // Fetch mashing steps
    if (input.mashingSteps && input.mashingSteps.length > 0) {
      const stepIds = input.mashingSteps.map((s) => s.id);
      const steps = await this.prisma.mashingProtocolStep.findMany({
        where: { id: { in: stepIds } },
      });
      for (const step of steps) {
        result.mashingSteps.set(step.id, {
          index: step.index,
          stepType: step.stepType,
          stepTime: step.stepTime,
          temperatureSetpoint: step.temperatureSetpoint,
          heatEnabled: step.heatEnabled,
          heatTempSp: step.heatTempSp,
          coolEnabled: step.coolEnabled,
          coolTempSp: step.coolTempSp,
          agitatorEnabled: step.agitatorEnabled,
          agitatorSpdSp: step.agitatorSpdSp,
          promptMessage: step.promptMessage,
        });
      }
    }

    return result;
  }

  /**
   * Create an aggregated audit log entry for component changes
   * Records all BOM, parameter, and mashing step changes in a single entry
   */
  private async createComponentChangeAuditLog(
    instanceId: string,
    input: {
      bomItems?: Array<{ id: string; quantity?: number }>;
      parameters?: Array<{
        id: string;
        recipeNumericalSetpoint?: number;
        recipeSetpointBooleanValue?: boolean;
        recipeSetpointUpperLimit?: number;
        recipeSetpointLowerLimit?: number;
      }>;
      mashingSteps?: Array<{
        id: string;
        index?: number;
        stepTime?: number;
        temperatureSetpoint?: number;
        heatEnabled?: boolean;
        heatTempSp?: number;
        coolEnabled?: boolean;
        coolTempSp?: number;
        agitatorEnabled?: boolean;
        agitatorSpdSp?: number;
        promptMessage?: string;
      }>;
    },
    oldValues: {
      bomItems: Map<string, { quantity: number | null; itemName: string }>;
      parameters: Map<
        string,
        {
          recipeParamName: string;
          recipeNumericalSetpoint: number | null;
          recipeSetpointBooleanValue: boolean | null;
          recipeSetpointUpperLimit: number | null;
          recipeSetpointLowerLimit: number | null;
        }
      >;
      mashingSteps: Map<
        string,
        {
          index: number | null;
          stepType: string | null;
          stepTime: number | null;
          temperatureSetpoint: number | null;
          heatEnabled: boolean | null;
          heatTempSp: number | null;
          coolEnabled: boolean | null;
          coolTempSp: number | null;
          agitatorEnabled: boolean | null;
          agitatorSpdSp: number | null;
          promptMessage: string | null;
        }
      >;
    },
    updatedBy: string
  ): Promise<void> {
    this.logger.log(
      `[createComponentChangeAuditLog] CALLED for instance ${instanceId}, updatedBy: ${updatedBy}`
    );
    this.logger.log(
      `[createComponentChangeAuditLog] Input: bomItems=${
        input.bomItems?.length || 0
      }, parameters=${input.parameters?.length || 0}, mashingSteps=${
        input.mashingSteps?.length || 0
      }`
    );
    this.logger.log(
      `[createComponentChangeAuditLog] OldValues: bomItems=${oldValues.bomItems.size}, parameters=${oldValues.parameters.size}, mashingSteps=${oldValues.mashingSteps.size}`
    );

    try {
      const changes: {
        bomItems: Array<{
          id: string;
          itemName: string;
          changes: Record<string, { old: any; new: any }>;
        }>;
        parameters: Array<{
          id: string;
          parameterName: string;
          changes: Record<string, { old: any; new: any }>;
        }>;
        mashingSteps: Array<{
          id: string;
          stepIndex: number | null;
          stepType: string | null;
          changes: Record<string, { old: any; new: any }>;
        }>;
      } = {
        bomItems: [],
        parameters: [],
        mashingSteps: [],
      };

      // Detect BOM item changes
      if (input.bomItems) {
        for (const newItem of input.bomItems) {
          const oldItem = oldValues.bomItems.get(newItem.id);
          if (oldItem) {
            const fieldChanges: Record<string, { old: any; new: any }> = {};
            if (
              newItem.quantity !== undefined &&
              newItem.quantity !== oldItem.quantity
            ) {
              fieldChanges.quantity = {
                old: oldItem.quantity,
                new: newItem.quantity,
              };
            }
            if (Object.keys(fieldChanges).length > 0) {
              changes.bomItems.push({
                id: newItem.id,
                itemName: oldItem.itemName,
                changes: fieldChanges,
              });
            }
          }
        }
      }

      // Detect parameter changes
      if (input.parameters) {
        for (const newParam of input.parameters) {
          const oldParam = oldValues.parameters.get(newParam.id);
          if (oldParam) {
            const fieldChanges: Record<string, { old: any; new: any }> = {};
            if (
              newParam.recipeNumericalSetpoint !== undefined &&
              newParam.recipeNumericalSetpoint !==
                oldParam.recipeNumericalSetpoint
            ) {
              fieldChanges.recipeNumericalSetpoint = {
                old: oldParam.recipeNumericalSetpoint,
                new: newParam.recipeNumericalSetpoint,
              };
            }
            if (
              newParam.recipeSetpointBooleanValue !== undefined &&
              newParam.recipeSetpointBooleanValue !==
                oldParam.recipeSetpointBooleanValue
            ) {
              fieldChanges.recipeSetpointBooleanValue = {
                old: oldParam.recipeSetpointBooleanValue,
                new: newParam.recipeSetpointBooleanValue,
              };
            }
            if (
              newParam.recipeSetpointUpperLimit !== undefined &&
              newParam.recipeSetpointUpperLimit !==
                oldParam.recipeSetpointUpperLimit
            ) {
              fieldChanges.recipeSetpointUpperLimit = {
                old: oldParam.recipeSetpointUpperLimit,
                new: newParam.recipeSetpointUpperLimit,
              };
            }
            if (
              newParam.recipeSetpointLowerLimit !== undefined &&
              newParam.recipeSetpointLowerLimit !==
                oldParam.recipeSetpointLowerLimit
            ) {
              fieldChanges.recipeSetpointLowerLimit = {
                old: oldParam.recipeSetpointLowerLimit,
                new: newParam.recipeSetpointLowerLimit,
              };
            }
            if (Object.keys(fieldChanges).length > 0) {
              changes.parameters.push({
                id: newParam.id,
                parameterName: oldParam.recipeParamName,
                changes: fieldChanges,
              });
            }
          }
        }
      }

      // Detect mashing step changes
      if (input.mashingSteps) {
        this.logger.log(
          `[createComponentChangeAuditLog] Processing ${input.mashingSteps.length} mashing steps for change detection`
        );
        for (const newStep of input.mashingSteps) {
          const oldStep = oldValues.mashingSteps.get(newStep.id);
          this.logger.log(
            `[createComponentChangeAuditLog] Step ${
              newStep.id
            }: oldStep found=${!!oldStep}, newIndex=${
              newStep.index
            }, oldIndex=${oldStep?.index}`
          );
          if (oldStep) {
            const fieldChanges: Record<string, { old: any; new: any }> = {};
            const fieldsToCheck: (keyof typeof newStep)[] = [
              "index",
              "stepTime",
              "temperatureSetpoint",
              "heatEnabled",
              "heatTempSp",
              "coolEnabled",
              "coolTempSp",
              "agitatorEnabled",
              "agitatorSpdSp",
              "promptMessage",
            ];
            for (const field of fieldsToCheck) {
              const newValue = newStep[field];
              const oldValue = oldStep[field as keyof typeof oldStep];
              if (newValue !== undefined && newValue !== oldValue) {
                this.logger.log(
                  `[createComponentChangeAuditLog] Step ${newStep.id} field "${field}" changed: ${oldValue} -> ${newValue}`
                );
                fieldChanges[field] = {
                  old: oldValue,
                  new: newValue,
                };
              }
            }
            if (Object.keys(fieldChanges).length > 0) {
              changes.mashingSteps.push({
                id: newStep.id,
                stepIndex: oldStep.index,
                stepType: oldStep.stepType,
                changes: fieldChanges,
              });
            }
          } else {
            this.logger.warn(
              `[createComponentChangeAuditLog] Step ${newStep.id} NOT FOUND in oldValues`
            );
          }
        }
      }

      // Only create audit log if there were actual changes
      const totalChanges =
        changes.bomItems.length +
        changes.parameters.length +
        changes.mashingSteps.length;
      this.logger.log(
        `[createComponentChangeAuditLog] Total changes detected: ${totalChanges} (bom=${changes.bomItems.length}, params=${changes.parameters.length}, steps=${changes.mashingSteps.length})`
      );
      if (totalChanges === 0) {
        this.logger.log(
          `[createComponentChangeAuditLog] No actual changes detected for instance ${instanceId}, skipping audit log`
        );
        return;
      }

      // Get audit context from CLS
      let ipAddress = "unknown";
      let userAgent = "unknown";
      let userId = updatedBy;
      try {
        ipAddress = this.cls.get("ipAddress") || "unknown";
        userAgent = this.cls.get("userAgent") || "unknown";
        // CLS has the actual user ID; updatedBy may be an email
        const clsUserId = this.cls.get("userId");
        if (clsUserId) {
          userId = clsUserId;
        }
      } catch {
        // CLS context not available
      }

      // If userId looks like an email, resolve it to the actual user ID
      if (userId && userId.includes("@")) {
        try {
          const user = await this.prisma.user.findFirst({
            where: { username: userId },
            select: { id: true },
          });
          if (user) {
            userId = user.id;
          }
        } catch {
          // Fallback: keep the original value
        }
      }

      await this.auditService.logChange({
        entityType: "ScheduleOrderRecipeInstanceComponents",
        entityId: instanceId,
        action: AuditAction.UPDATE,
        newValues: {
          timestamp: new Date().toISOString(),
          updatedBy,
          changesSummary: {
            bomItemsModified: changes.bomItems.length,
            parametersModified: changes.parameters.length,
            mashingStepsModified: changes.mashingSteps.length,
          },
          changes,
        },
        userId,
        ipAddress,
        userAgent,
      });

      this.logger.log(
        `Audit log created for component changes: ${changes.bomItems.length} BOM items, ` +
          `${changes.parameters.length} parameters, ${changes.mashingSteps.length} mashing steps`
      );
    } catch (error) {
      // Log but don't fail - audit logging should not break the update operation
      this.logger.error(
        `Failed to create component change audit log: ${error}`
      );
    }
  }

  /**
   * Get change history for a schedule order's recipe instance components
   * Returns audit logs for ScheduleOrderRecipeInstanceComponents entity type
   */
  async getComponentChangeHistory(
    scheduleOrderId: string,
    options?: { limit?: number }
  ): Promise<
    Array<{
      id: string;
      timestamp: Date;
      userId: string | null;
      user?: {
        username: string;
        firstName: string | null;
        lastName: string | null;
      };
      changesSummary: {
        bomItemsModified: number;
        parametersModified: number;
        mashingStepsModified: number;
      };
      changes: {
        bomItems: Array<{
          id: string;
          itemName: string;
          changes: Record<string, { old: any; new: any }>;
        }>;
        parameters: Array<{
          id: string;
          parameterName: string;
          changes: Record<string, { old: any; new: any }>;
        }>;
        mashingSteps: Array<{
          id: string;
          stepIndex: number | null;
          stepType: string | null;
          changes: Record<string, { old: any; new: any }>;
        }>;
      };
    }>
  > {
    this.logger.log(
      `[getComponentChangeHistory] Called for scheduleOrderId: ${scheduleOrderId}`
    );

    // First get the instance ID from the schedule order
    const instance = await this.prisma.scheduleOrderRecipeInstance.findFirst({
      where: { scheduleOrderId },
      select: { id: true },
    });

    if (!instance) {
      this.logger.log(
        `[getComponentChangeHistory] No instance found for scheduleOrderId: ${scheduleOrderId}`
      );
      return [];
    }

    this.logger.log(
      `[getComponentChangeHistory] Found instance: ${instance.id}, querying audit logs...`
    );

    const auditLogs = await this.auditService.getEntityAuditHistory(
      "ScheduleOrderRecipeInstanceComponents",
      instance.id,
      { limit: options?.limit || 50 }
    );

    this.logger.log(
      `[getComponentChangeHistory] Found ${auditLogs.length} audit logs for instance ${instance.id}`
    );

    return auditLogs.map((log) => {
      const newValues = log.newValues as any;
      return {
        id: log.id,
        timestamp: log.createdAt,
        userId: log.userId,
        user: log.user
          ? {
              username: log.user.username,
              firstName: log.user.firstName,
              lastName: log.user.lastName,
            }
          : undefined,
        changesSummary: newValues?.changesSummary || {
          bomItemsModified: 0,
          parametersModified: 0,
          mashingStepsModified: 0,
        },
        changes: newValues?.changes || {
          bomItems: [],
          parameters: [],
          mashingSteps: [],
        },
      };
    });
  }
}
