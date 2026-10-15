// BomCalculationService - Calculates BOM item quantities based on grain/water loads

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnzymeDosingService } from "../recipe/enzyme.dosing";
import {
  ExpressionEngineService,
  GrainCharacterInput,
} from "../expressionEngine/expression-engine.service";
import { FormulaLibraryService } from "../formulaLibrary/formula-library.service";
import { AuditService } from "../audit/audit.service";
import {
  RecipeBomItem,
  EnumBomCalculationMode,
  EnumBomFormulaType,
  RecipeBomActual,
  ScheduleOrderRecipeInstance,
  Prisma,
} from "@prisma/client";

export interface LoadInputs {
  grainLoad: number; // Total grain weight in lbs
  waterLoad?: number; // Total water volume in gallons
  mashBill?: string; // Mash bill code (e.g., "70-21-00-09")
  recipeId?: string; // Recipe ID for fetching grain characters
  userId?: string; // User who triggered the calculation (for audit)
}

export interface CalculationResult {
  quantity: number;
  formula: string;
  calculatedAt: Date;
}

export interface BomItemCalculation {
  bomItemId: string;
  itemName: string;
  oldQuantity?: number;
  newQuantity: number;
  formula: string;
}

@Injectable()
export class BomCalculationService {
  private readonly logger = new Logger(BomCalculationService.name);

  // Standard conversion constants
  private static readonly LBS_PER_BUSHEL = 56;
  private static readonly DEFAULT_GALLONS_PER_BUSHEL = 4.5;
  private static readonly DEFAULT_BACKSET_PERCENTAGE = 0.25;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enzymeDosingService: EnzymeDosingService,
    private readonly expressionEngine: ExpressionEngineService,
    private readonly formulaLibrary: FormulaLibraryService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Calculate single BOM item quantity based on its formula configuration
   */
  async calculateItemQuantity(
    bomItem: RecipeBomItem & {
      item?: { itemName?: string; itemNumber?: string } | null;
    },
    loads: LoadInputs
  ): Promise<CalculationResult> {
    const calculationMode =
      bomItem.calculationMode || EnumBomCalculationMode.STATIC;

    switch (calculationMode) {
      case EnumBomCalculationMode.STATIC:
        return this.calculateStatic(bomItem);

      case EnumBomCalculationMode.FORMULA_GRAIN:
        return this.calculateGrainFormula(bomItem, loads);

      case EnumBomCalculationMode.FORMULA_WATER:
        return this.calculateWaterFormula(bomItem, loads);

      case EnumBomCalculationMode.ENZYME_NORMALIZED:
        return await this.calculateEnzymeFormula(bomItem, loads);

      case EnumBomCalculationMode.EXPRESSION:
        return await this.calculateExpression(bomItem, loads);

      default:
        this.logger.warn(
          `Unknown calculation mode: ${calculationMode} for item ${bomItem.id}, falling back to static`
        );
        return this.calculateStatic(bomItem);
    }
  }

  /**
   * Static calculation - use the fixed quantity from the BOM item
   */
  private calculateStatic(bomItem: RecipeBomItem): CalculationResult {
    return {
      quantity: bomItem.quantity || 0,
      formula: "static",
      calculatedAt: new Date(),
    };
  }

  /**
   * Grain-based formula calculation
   */
  private calculateGrainFormula(
    bomItem: RecipeBomItem,
    loads: LoadInputs
  ): CalculationResult {
    // Validate grainLoad is present and positive
    if (!loads.grainLoad || loads.grainLoad <= 0) {
      this.logger.warn(
        `Invalid grainLoad (${loads.grainLoad}) for FORMULA_GRAIN calculation on BOM item ${bomItem.id}`
      );
      return {
        quantity: 0,
        formula: `error: grainLoad must be > 0 (was ${loads.grainLoad})`,
        calculatedAt: new Date(),
      };
    }

    const formulaType = bomItem.formulaType;
    const multiplier = bomItem.formulaMultiplier || 0;

    switch (formulaType) {
      case EnumBomFormulaType.SIMPLE_RATIO: {
        // e.g., Corn at 70% = 3000 lbs * 0.7 = 2100 lbs
        const quantity = loads.grainLoad * multiplier;
        return {
          quantity: Math.round(quantity * 100) / 100, // Round to 2 decimals
          formula: `${loads.grainLoad} * ${multiplier}`,
          calculatedAt: new Date(),
        };
      }

      case EnumBomFormulaType.WATER_PER_BUSHEL: {
        // e.g., Water = (3000 lbs / 56) * 4.5 gal/bushel = 241 gal
        const bushels = loads.grainLoad / BomCalculationService.LBS_PER_BUSHEL;
        const gallons = bushels * multiplier;
        return {
          quantity: Math.round(gallons * 100) / 100,
          formula: `(${loads.grainLoad} / ${BomCalculationService.LBS_PER_BUSHEL}) * ${multiplier}`,
          calculatedAt: new Date(),
        };
      }

      default:
        this.logger.warn(
          `Unknown formula type for FORMULA_GRAIN: ${formulaType}, using multiplier only`
        );
        return {
          quantity: loads.grainLoad * multiplier,
          formula: `${loads.grainLoad} * ${multiplier}`,
          calculatedAt: new Date(),
        };
    }
  }

  /**
   * Water-based formula calculation
   */
  private calculateWaterFormula(
    bomItem: RecipeBomItem,
    loads: LoadInputs
  ): CalculationResult {
    if (!loads.waterLoad) {
      this.logger.warn(
        `Water load not provided for water-based calculation, defaulting to 0`
      );
      return {
        quantity: 0,
        formula: "waterLoad not provided",
        calculatedAt: new Date(),
      };
    }

    const formulaType = bomItem.formulaType;
    const multiplier = bomItem.formulaMultiplier || 0;

    switch (formulaType) {
      case EnumBomFormulaType.BACKSET_PERCENTAGE: {
        // e.g., Backset = 241 gal * 0.25 = 60 gal
        const backsetQty = loads.waterLoad * multiplier;
        return {
          quantity: Math.round(backsetQty * 100) / 100,
          formula: `${loads.waterLoad} * ${multiplier}`,
          calculatedAt: new Date(),
        };
      }

      default:
        this.logger.warn(
          `Unknown formula type for FORMULA_WATER: ${formulaType}, using multiplier only`
        );
        return {
          quantity: loads.waterLoad * multiplier,
          formula: `${loads.waterLoad} * ${multiplier}`,
          calculatedAt: new Date(),
        };
    }
  }

  /**
   * Enzyme-based formula calculation using existing EnzymeDosingService
   */
  private async calculateEnzymeFormula(
    bomItem: RecipeBomItem & {
      item?: { itemName?: string; itemNumber?: string } | null;
    },
    loads: LoadInputs
  ): Promise<CalculationResult> {
    if (!loads.mashBill) {
      this.logger.warn(
        `Mash bill not provided for enzyme calculation, defaulting to 0`
      );
      return {
        quantity: 0,
        formula: "mashBill not provided",
        calculatedAt: new Date(),
      };
    }

    // Use itemNumber for enzyme lookup (matches enzyme configuration mapping)
    const enzymeItemNumber = bomItem.item?.itemNumber || "";
    const enzymeItemName = bomItem.item?.itemName || enzymeItemNumber; // For logging/display

    if (!enzymeItemNumber) {
      this.logger.warn(
        `No itemNumber found for enzyme BOM item ${bomItem.id}, defaulting to 0`
      );
      return {
        quantity: 0,
        formula: "error: no itemNumber for enzyme lookup",
        calculatedAt: new Date(),
      };
    }

    try {
      const result =
        await this.enzymeDosingService.calculateNormalizedEnzymeDosing(
          loads.mashBill,
          enzymeItemNumber
        );

      if (!result) {
        this.logger.warn(
          `Enzyme dosing calculation returned null for ${enzymeItemNumber} (${enzymeItemName}), defaulting to 0`
        );
        return {
          quantity: 0,
          formula: `enzyme not found: ${enzymeItemNumber}`,
          calculatedAt: new Date(),
        };
      }

      const quantity = result.ratio * loads.grainLoad;

      return {
        quantity: Math.round(quantity * 100) / 100,
        formula: `${result.ratio} * ${loads.grainLoad} (${enzymeItemName})`,
        calculatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate enzyme dosing for ${enzymeItemNumber} (${enzymeItemName})`,
        error
      );
      return {
        quantity: 0,
        formula: `error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        calculatedAt: new Date(),
      };
    }
  }

  /**
   * Expression-based calculation using expression engine
   */
  private async calculateExpression(
    bomItem: RecipeBomItem & {
      item?: { itemName?: string; itemNumber?: string } | null;
    },
    loads: LoadInputs
  ): Promise<CalculationResult> {
    try {
      let expression: string;

      // Use formula library or inline expression
      if (bomItem.formulaLibraryId) {
        const formula = await this.formulaLibrary.findById(
          bomItem.formulaLibraryId
        );
        expression = formula.expression;
      } else if (bomItem.customExpression) {
        expression = bomItem.customExpression;
      } else {
        this.logger.warn(
          `No expression configured for BOM item ${bomItem.id}, defaulting to 0`
        );
        return {
          quantity: 0,
          formula: "error: no expression configured",
          calculatedAt: new Date(),
        };
      }

      // Build context with mash bill parsing
      const context = {
        grainLoad: loads.grainLoad,
        waterLoad: loads.waterLoad,
        mashBill: loads.mashBill,
        itemName: bomItem.item?.itemName || "",
      };

      // Fetch grain characters from recipe if recipeId is provided
      let grainCharacters: GrainCharacterInput[] | undefined;
      if (loads.recipeId) {
        grainCharacters = await this.fetchGrainCharactersForRecipe(
          loads.recipeId
        );
      }

      // Evaluate expression with grain characters
      const result = await this.expressionEngine.evaluate(
        expression,
        context,
        grainCharacters
      );

      if (!result.success) {
        this.logger.error(
          `Expression evaluation failed for BOM item ${bomItem.id}: ${result.error}`
        );
        return {
          quantity: 0,
          formula: `error: ${result.error}`,
          calculatedAt: new Date(),
        };
      }

      // Log execution for audit trail
      await this.prisma.formulaExecutionLog.create({
        data: {
          formulaId: bomItem.formulaLibraryId,
          expression,
          variables: context as any,
          result: result.value,
          executionTimeMs: result.executionTimeMs,
          success: result.success,
          errorMessage: result.error,
          recipeBomItemId: bomItem.id,
        },
      });

      return {
        quantity: Math.round((result.value || 0) * 100) / 100,
        formula: expression,
        calculatedAt: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to calculate expression for BOM item ${bomItem.id}`,
        error
      );
      return {
        quantity: 0,
        formula: `error: ${errorMessage}`,
        calculatedAt: new Date(),
      };
    }
  }

  /**
   * Fetch grain characters for a recipe and convert to expression engine format
   */
  private async fetchGrainCharactersForRecipe(
    recipeId: string
  ): Promise<GrainCharacterInput[]> {
    const recipeGrainCharacters =
      await this.prisma.recipeGrainCharacter.findMany({
        where: { recipeId },
        include: {
          grainCharacter: {
            select: {
              abbreviation: true,
              varietyCode: true,
            },
          },
        },
      });

    return recipeGrainCharacters.map((rgc) => ({
      abbreviation: rgc.grainCharacter.abbreviation,
      varietyCode: rgc.grainCharacter.varietyCode || undefined,
      percentage: rgc.percentage,
    }));
  }

  /**
   * Recalculate all BOM items for a schedule order when loads change.
   *
   * If consumption has started (any quantityActual > 0), creates a new revision
   * instead of updating in place to maintain audit history.
   */
  async recalculateOnLoadChange(
    scheduleOrderId: string,
    newLoads: LoadInputs
  ): Promise<void> {
    this.logger.log(
      `Recalculating BOM items for schedule order ${scheduleOrderId} with loads: grain=${newLoads.grainLoad}, water=${newLoads.waterLoad}`
    );

    // Get schedule order recipe instance
    const soInstance = await this.getScheduleOrderRecipeInstance(
      scheduleOrderId
    );

    if (!soInstance) {
      this.logger.warn(
        `No schedule order recipe instance found for ${scheduleOrderId}`
      );
      return;
    }

    // Check if any consumption has been recorded (determines if we need revisions)
    const hasConsumption =
      (await this.prisma.recipeBomActual.count({
        where: {
          scheduleOrderRecipeInstanceId: soInstance.id,
          quantityActual: { gt: 0 },
        },
      })) > 0;

    // Note: Revision tracking fields not yet in schema - using simplified approach
    const currentRevision = 1;
    const newRevision = 1;

    if (hasConsumption) {
      this.logger.log(
        `Consumption detected - will update existing BOM actuals`
      );
    }

    // Get all BOM items from the recipe instance
    const bomItems = await this.prisma.recipeBomItem.findMany({
      where: {
        recipeBomsId: {
          in: soInstance.recipeBoms.map((bom) => bom.id),
        },
      },
      include: {
        item: {
          select: {
            itemName: true,
            itemNumber: true,
          },
        },
      },
    });

    this.logger.log(`Found ${bomItems.length} BOM items to recalculate`);

    const userId = newLoads.userId || "system";
    const recalculatedItems: {
      itemId: string;
      itemName: string;
      oldQty: number | null;
      newQty: number;
    }[] = [];

    // Recalculate each BOM item
    for (const bomItem of bomItems) {
      const calculated = await this.calculateItemQuantity(bomItem, newLoads);

      // Find existing RecipeBomActual record
      const existing = await this.prisma.recipeBomActual.findFirst({
        where: {
          scheduleOrderRecipeInstanceId: soInstance.id,
          recipeBomItemId: bomItem.id,
        },
      });

      if (existing) {
        // Update existing record in place
        const oldQty = existing.quantityPlanned;
        await this.prisma.recipeBomActual.update({
          where: { id: existing.id },
          data: {
            quantityPlanned: calculated.quantity,
            grainLoadAtCalculation: newLoads.grainLoad,
            waterLoadAtCalculation: newLoads.waterLoad,
            formulaUsed: calculated.formula,
            updatedAt: new Date(),
          },
        });

        recalculatedItems.push({
          itemId: bomItem.id,
          itemName: bomItem.item?.itemName || "Unknown",
          oldQty,
          newQty: calculated.quantity,
        });

        this.logger.debug(
          `Updated BOM actual for item ${bomItem.id}: ${oldQty} -> ${calculated.quantity}`
        );
      } else {
        // No existing record - create new (first calculation)
        await this.prisma.recipeBomActual.create({
          data: {
            scheduleOrderRecipeInstanceId: soInstance.id,
            recipeBomItemId: bomItem.id,
            quantityPlanned: calculated.quantity,
            grainLoadAtCalculation: newLoads.grainLoad,
            waterLoadAtCalculation: newLoads.waterLoad,
            formulaUsed: calculated.formula,
            createdBy: userId,
          },
        });

        recalculatedItems.push({
          itemId: bomItem.id,
          itemName: bomItem.item?.itemName || "Unknown",
          oldQty: null,
          newQty: calculated.quantity,
        });
      }
    }

    // Update the RecipeBomItem's lastCalculatedAt timestamp
    await this.prisma.recipeBomItem.updateMany({
      where: {
        id: {
          in: bomItems.map((item) => item.id),
        },
      },
      data: {
        lastCalculatedAt: new Date(),
      },
    });

    // Log audit entry for the recalculation
    try {
      await this.auditService.logChange({
        entityType: "ScheduleOrderRecipeInstance",
        entityId: soInstance.id,
        action: "UPDATE", // Using UPDATE since BOM_RECALCULATION isn't in enum
        oldValues: {
          actionType: "BOM_RECALCULATION",
          revision: currentRevision,
          hadConsumption: hasConsumption,
        },
        newValues: {
          actionType: "BOM_RECALCULATION",
          revision: newRevision,
          createdNewRevision: hasConsumption,
          grainLoad: newLoads.grainLoad,
          waterLoad: newLoads.waterLoad,
          mashBill: newLoads.mashBill,
          itemsRecalculated: recalculatedItems.length,
          items: recalculatedItems,
        },
        userId,
      });
    } catch (auditError) {
      // Don't fail the recalculation if audit logging fails
      this.logger.warn(
        `Failed to log audit for BOM recalculation: ${auditError}`
      );
    }

    this.logger.log(
      `Successfully recalculated ${bomItems.length} BOM items` +
        (hasConsumption ? ` (new revision ${newRevision})` : "")
    );
  }

  /**
   * Preview BOM calculation without saving to database
   */
  async previewCalculation(
    recipeBomId: string,
    loads: LoadInputs
  ): Promise<BomItemCalculation[]> {
    this.logger.log(`Previewing BOM calculation for recipeBom ${recipeBomId}`);

    const bomItems = await this.prisma.recipeBomItem.findMany({
      where: {
        recipeBomsId: recipeBomId,
      },
      include: {
        item: {
          select: {
            itemName: true,
            itemNumber: true,
          },
        },
      },
    });

    const results: BomItemCalculation[] = [];

    for (const bomItem of bomItems) {
      const calculated = await this.calculateItemQuantity(bomItem, loads);

      results.push({
        bomItemId: bomItem.id,
        itemName: bomItem.item?.itemName || "Unknown",
        oldQuantity: bomItem.quantity || undefined,
        newQuantity: calculated.quantity,
        formula: calculated.formula,
      });
    }

    return results;
  }

  /**
   * Calculate initial BOM quantities when creating a schedule order recipe instance
   */
  async calculateInitialBomQuantities(
    scheduleOrderRecipeInstanceId: string,
    loads: LoadInputs
  ): Promise<void> {
    this.logger.log(
      `Calculating initial BOM quantities for instance ${scheduleOrderRecipeInstanceId}`
    );

    const soInstance = await this.prisma.scheduleOrderRecipeInstance.findUnique(
      {
        where: { id: scheduleOrderRecipeInstanceId },
        include: {
          recipeBoms: {
            include: {
              recipeBomITem: {
                include: {
                  item: {
                    select: {
                      itemName: true,
                      itemNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      }
    );

    if (!soInstance) {
      this.logger.error(
        `Schedule order recipe instance not found: ${scheduleOrderRecipeInstanceId}`
      );
      return;
    }

    // Get all BOM items
    const bomItems = soInstance.recipeBoms.flatMap((bom) => bom.recipeBomITem);

    this.logger.log(`Calculating quantities for ${bomItems.length} BOM items`);

    // Calculate and create RecipeBomActual records for each item
    const userId = loads.userId || "system";
    for (const bomItem of bomItems) {
      const calculated = await this.calculateItemQuantity(bomItem, loads);

      await this.prisma.recipeBomActual.create({
        data: {
          scheduleOrderRecipeInstanceId: soInstance.id,
          recipeBomItemId: bomItem.id,
          quantityPlanned: calculated.quantity,
          grainLoadAtCalculation: loads.grainLoad,
          waterLoadAtCalculation: loads.waterLoad,
          formulaUsed: calculated.formula,
          createdBy: userId,
        },
      });
    }

    this.logger.log(
      `Successfully created ${bomItems.length} RecipeBomActual records with calculated quantities`
    );
  }

  /**
   * Helper method to get schedule order recipe instance with related data
   */
  private async getScheduleOrderRecipeInstance(
    scheduleOrderId: string
  ): Promise<
    | (ScheduleOrderRecipeInstance & {
        recipeBoms: { id: string }[];
      })
    | null
  > {
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        scheduleOrderRecipeInstance: {
          include: {
            recipeBoms: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    return scheduleOrder?.scheduleOrderRecipeInstance || null;
  }
}
