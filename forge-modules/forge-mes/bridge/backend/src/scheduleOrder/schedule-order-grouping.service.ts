import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  ProductionOrder,
  ScheduleOrder,
  EnumProductionOrderContainerType,
  Prisma,
} from "@prisma/client";
import { OrderValidationService } from "../order-validation/order-validation.service";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { YieldEstimationService } from "../yieldEstimation/yieldEstimation.service";

export interface ProductionOrderGroupingData {
  productionOrderIds: string[];
  recipeGroupId: string;
  scheduleName?: string;
  estimatedStart?: Date;
  estimatedEnd?: Date;
  // Production execution estimates
  totalCooks?: number;
  totalFermenters?: number;
  plannedCooks?: number;
  plannedFermenters?: number;
  estimatedBarrelsPerFermenter?: number;
  estimatedPGsPerBbl?: number;
  estimatedPGsPerBushel?: number;
  totalGrainWeight?: number;
  // Production totals
  totalBarrels?: number;
  totalProofGallons?: number;
  // Duration fields
  duration?: number;
  durationUnits?: string;
  // Timing fields (optional - will be calculated if not provided)
  estimatedMashingDuration?: number;
  estimatedFermentationDuration?: number;
  estimatedDistillationDuration?: number;
}

export interface ScheduleEstimates {
  mashingDuration: number;
  fermentationDuration: number;
  distillationDuration: number;
  totalDuration: number;
  mashingStartTime?: Date;
  fermentationStartTime?: Date;
  distillationStartTime?: Date;
  barrelingStartTime?: Date;
}

export interface GroupingCompatibilityResult {
  isCompatible: boolean;
  incompatibilityReasons: string[];
  warnings: string[];
}

@Injectable()
export class ScheduleOrderGroupingService {
  private readonly logger = new Logger(ScheduleOrderGroupingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderValidationService: OrderValidationService,
    @Inject(forwardRef(() => ScheduleOrderRecipeInstanceService))
    private readonly scheduleOrderRecipeInstanceService: ScheduleOrderRecipeInstanceService,
    private readonly yieldEstimationService: YieldEstimationService
  ) {}

  /**
   * Validates that a group of Production Orders can be grouped into a single Schedule Order
   * Checks MES Phase 1 constraints: same mash bill (recipe group)
   */
  async validateProductionOrderGrouping(
    productionOrderIds: string[]
  ): Promise<GroupingCompatibilityResult> {
    const result: GroupingCompatibilityResult = {
      isCompatible: true,
      incompatibilityReasons: [],
      warnings: [],
    };

    if (productionOrderIds.length === 0) {
      result.isCompatible = false;
      result.incompatibilityReasons.push(
        "At least one Production Order must be selected for grouping"
      );
      return result;
    }

    // Fetch all production orders with their recipes and recipe groups
    const productionOrders = await this.prisma.productionOrder.findMany({
      where: {
        id: { in: productionOrderIds },
      },
      include: {
        recipe: {
          include: {
            recipeGroup: true,
          },
        },
        customer: true,
        bom: true,
        item: true,
      },
    });

    // Validate all orders were found
    if (productionOrders.length !== productionOrderIds.length) {
      const foundIds = productionOrders.map((po) => po.id);
      const missingIds = productionOrderIds.filter(
        (id) => !foundIds.includes(id)
      );
      result.isCompatible = false;
      result.incompatibilityReasons.push(
        `Production Orders not found: ${missingIds.join(", ")}`
      );
      return result;
    }

    // Validate mash bill consistency (MES Phase 1 constraint)
    await this.validateMashBillConsistency(productionOrders, result);

    // Validate no orders are already scheduled
    await this.validateNoExistingScheduleOrders(productionOrders, result);

    // Add warnings for different container types, proofs, customers
    this.addCompatibilityWarnings(productionOrders, result);

    return result;
  }

  /**
   * Creates a Schedule Order from a group of compatible Production Orders.
   * Uses a strict transactional approach - ScheduleOrder and ScheduleOrderRecipeInstance
   * are created atomically. If either fails, both are rolled back.
   */
  async createScheduleOrderFromProductionOrders(
    groupingData: ProductionOrderGroupingData
  ): Promise<ScheduleOrder> {
    this.logger.log(
      `Creating Schedule Order from ${groupingData.productionOrderIds.length} Production Orders`
    );

    // First validate the grouping is valid (outside transaction - read-only)
    const compatibilityResult = await this.validateProductionOrderGrouping(
      groupingData.productionOrderIds
    );
    if (!compatibilityResult.isCompatible) {
      throw new BadRequestException({
        message: "Production Orders cannot be grouped",
        errors: compatibilityResult.incompatibilityReasons,
      });
    }

    // Get production orders and recipe group (outside transaction - read-only)
    const productionOrders = await this.prisma.productionOrder.findMany({
      where: { id: { in: groupingData.productionOrderIds } },
      include: {
        recipe: {
          include: { recipeGroup: true },
        },
        customer: true,
      },
    });

    const recipeGroup = await this.prisma.recipeGroup.findUnique({
      where: { id: groupingData.recipeGroupId },
    });

    if (!recipeGroup) {
      throw new BadRequestException(
        `Recipe Group ${groupingData.recipeGroupId} not found`
      );
    }

    // Calculate aggregated values from production orders using yield estimation
    const aggregatedData = await this.calculateAggregatedProductionData(
      productionOrders,
      groupingData
    );

    // Calculate schedule timing estimates using the aggregated cooks value
    const estimatesData = {
      ...groupingData,
      totalCooks: groupingData.totalCooks || aggregatedData.totalCooks,
    };
    const estimates = this.calculateScheduleEstimates(
      estimatesData,
      productionOrders
    );

    this.logger.log(
      `Calculated schedule estimates: mashingDuration=${estimates.mashingDuration}h, fermentationDuration=${estimates.fermentationDuration}h, totalDuration=${estimates.totalDuration}h`
    );

    // Get unique customer IDs from production orders
    const customerIds = [
      ...new Set(
        productionOrders
          .map((po) => po.customerId)
          .filter((id): id is string => id != null)
      ),
    ];

    // Wrap all writes in a transaction - ScheduleOrder + RecipeInstance must both succeed
    const scheduleOrder = await this.prisma.$transaction(
      async (tx) => {
        // Create the Schedule Order
        const so = await tx.scheduleOrder.create({
          data: {
            name: this.generateScheduleOrderName(
              recipeGroup.recipe,
              groupingData.scheduleName
            ),
            recipeName: recipeGroup.recipe,
            recipeGroup: { connect: { id: groupingData.recipeGroupId } },
            scheduleOrderRecipe: productionOrders[0].recipe
              ? { connect: { id: productionOrders[0].recipe.id } }
              : undefined,
            productionOrderAllocation:
              this.createProductionOrderAllocation(productionOrders),
            estimatedStart: groupingData.estimatedStart,
            estimatedEnd: groupingData.estimatedEnd,
            // Connect customers from production orders
            customers:
              customerIds.length > 0
                ? {
                    connect: customerIds.map((id) => ({ id })),
                  }
                : undefined,
            // Production execution fields (moved from ProductionOrder)
            totalCooks: groupingData.totalCooks || aggregatedData.totalCooks,
            totalFermenters:
              groupingData.totalFermenters || aggregatedData.totalFermenters,
            plannedCooks:
              groupingData.plannedCooks || aggregatedData.plannedCooks,
            plannedFermenters:
              groupingData.plannedFermenters ||
              aggregatedData.plannedFermenters,
            estimatedBarrelsPerFermenter:
              groupingData.estimatedBarrelsPerFermenter ||
              aggregatedData.estimatedBarrelsPerFermenter,
            estimatedPGsPerBbl:
              groupingData.estimatedPGsPerBbl ||
              aggregatedData.estimatedPGsPerBbl,
            estimatedPGsPerBushel:
              groupingData.estimatedPGsPerBushel ||
              aggregatedData.estimatedPGsPerBushel,
            totalGrainWeight:
              groupingData.totalGrainWeight || aggregatedData.totalGrainWeight,
            grainPerCook: aggregatedData.grainPerCook,
            // Production totals
            totalBarrels:
              groupingData.totalBarrels || aggregatedData.totalBarrels,
            totalProofGallons:
              groupingData.totalProofGallons ||
              aggregatedData.totalProofGallons,
            // Timing fields from calculation
            estimatedMashingStartTime: estimates.mashingStartTime,
            estimatedMashingDuration: estimates.mashingDuration,
            estimatedFermentationStartTime: estimates.fermentationStartTime,
            estimatedFermentationDuration: estimates.fermentationDuration,
            estimatedDistillationStartTime: estimates.distillationStartTime,
            estimatedDistillationDuration: estimates.distillationDuration,
            estimatedBarrelingStartTime: estimates.barrelingStartTime,
            estimatedTotalProductionDuration: estimates.totalDuration,
            duration: groupingData.duration || estimates.totalDuration,
            durationUnits: groupingData.durationUnits || "Hours",
            // Initialize execution tracking
            executedCooks: 0,
            executedFermenters: 0,
            completedCooks: 0,
            completedFermenters: 0,
            createdBy: "system", // TODO: Get from context
            schemaVersion: "0001-b",
          },
          include: {
            recipeGroup: true,
            scheduleOrderRecipe: true,
            productionOrders: true,
            customers: true,
          },
        });

        // Update production orders to link to the new schedule order
        await tx.productionOrder.updateMany({
          where: { id: { in: groupingData.productionOrderIds } },
          data: {
            scheduleOrderId: so.id,
            scheduled: true,
          },
        });

        // Create ScheduleOrderRecipeInstance (STRICT - must succeed or roll back entire transaction)
        this.logger.log(
          `[grouping] About to call createFromScheduleOrderWithTransaction for SO ${so.id}`
        );
        try {
          await this.scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction(
            tx,
            so.id,
            "system" // TODO: Get from context
          );
          this.logger.log(
            `[grouping] createFromScheduleOrderWithTransaction completed successfully for SO ${so.id}`
          );
        } catch (err) {
          this.logger.error(
            `[grouping] createFromScheduleOrderWithTransaction FAILED for SO ${so.id}: ${err}`
          );
          throw err;
        }

        this.logger.log(
          `Created Schedule Order ${so.id} with ScheduleOrderRecipeInstance and ${groupingData.productionOrderIds.length} Production Orders`
        );

        return so;
      },
      {
        // Increase timeout for complex recipe instance creation with remote DB
        // Increased to 90s to provide safety margin with batch optimizations
        timeout: 90000, // 90 seconds (was 30s)
      }
    );

    return scheduleOrder;
  }

  /**
   * Finds compatible Production Orders that can be grouped with a given Production Order
   */
  async findCompatibleProductionOrders(
    baseProductionOrderId: string,
    limit: number = 10
  ): Promise<ProductionOrder[]> {
    const baseOrder = await this.prisma.productionOrder.findUnique({
      where: { id: baseProductionOrderId },
      include: {
        recipe: {
          include: { recipeGroup: true },
        },
      },
    });

    if (!baseOrder) {
      throw new BadRequestException(
        `Production Order ${baseProductionOrderId} not found`
      );
    }

    if (!baseOrder.recipe?.recipeGroup) {
      return [];
    }

    // Find other production orders with same recipe group that aren't scheduled
    const compatibleOrders = await this.prisma.productionOrder.findMany({
      where: {
        id: { not: baseProductionOrderId },
        scheduled: false,
        scheduleOrderId: null,
        recipe: {
          recipeGroupId: baseOrder.recipe.recipeGroupId,
        },
      },
      include: {
        recipe: {
          include: { recipeGroup: true },
        },
        customer: true,
        bom: true,
        item: true,
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return compatibleOrders;
  }

  private async validateMashBillConsistency(
    productionOrders: any[],
    result: GroupingCompatibilityResult
  ): Promise<void> {
    const recipeGroups = new Set<string>();

    for (const po of productionOrders) {
      if (po.recipe?.recipeGroup?.id) {
        recipeGroups.add(po.recipe.recipeGroup.id);
      } else {
        result.isCompatible = false;
        result.incompatibilityReasons.push(
          `Production Order ${po.id} does not have a recipe group (mash bill) assigned`
        );
      }
    }

    if (recipeGroups.size > 1) {
      result.isCompatible = false;
      result.incompatibilityReasons.push(
        "All Production Orders must have the same mash bill (recipe group) for MES Phase 1"
      );
    }
  }

  private async validateNoExistingScheduleOrders(
    productionOrders: any[],
    result: GroupingCompatibilityResult
  ): Promise<void> {
    const scheduledOrders = productionOrders.filter(
      (po) => po.scheduleOrderId || po.scheduled
    );

    if (scheduledOrders.length > 0) {
      result.isCompatible = false;
      result.incompatibilityReasons.push(
        `Production Orders already scheduled: ${scheduledOrders
          .map((po) => po.id)
          .join(", ")}`
      );
    }
  }

  private addCompatibilityWarnings(
    productionOrders: any[],
    result: GroupingCompatibilityResult
  ): void {
    // Check for different container types
    const containerTypes = new Set(
      productionOrders.map((po) => po.containerType)
    );
    if (containerTypes.size > 1) {
      result.warnings.push(
        `Production Orders have different container types: ${Array.from(
          containerTypes
        ).join(", ")}`
      );
    }

    // Check for different final proofs
    const proofs = new Set(
      productionOrders.map((po) => po.finalProof).filter(Boolean)
    );
    if (proofs.size > 1) {
      result.warnings.push(
        `Production Orders have different final proofs: ${Array.from(
          proofs
        ).join(", ")}`
      );
    }

    // Check for different customers
    const customers = new Set(
      productionOrders.map((po) => po.customer?.name).filter(Boolean)
    );
    if (customers.size > 1) {
      result.warnings.push(
        `Production Orders have different customers: ${Array.from(
          customers
        ).join(", ")}`
      );
    }
  }

  private async calculateAggregatedProductionData(
    productionOrders: any[],
    groupingData: ProductionOrderGroupingData
  ): Promise<any> {
    const totalQuantity = productionOrders.reduce(
      (sum, po) => sum + (po.quantity || 0),
      0
    );
    const recipe = productionOrders[0]?.recipe;

    // Determine whiskey type from recipe
    const whiskeyType = recipe?.whiskeyType || "RyeBourbon";

    // Calculate weighted average proof from production orders
    let entryProof = 125;
    if (productionOrders.length > 0) {
      const totalProofBarrels = productionOrders.reduce(
        (sum, po) => sum + (po.quantity || 0) * (po.finalProof || 125),
        0
      );
      entryProof = totalQuantity > 0 ? totalProofBarrels / totalQuantity : 125;
    }

    const containerType = productionOrders[0]?.containerType || "LargeBarrel";

    try {
      // Resolve grainPerCook: explicit grouping data > solver (undefined triggers solver)
      let grainPerCook: number | undefined;
      if (groupingData.totalGrainWeight && groupingData.totalCooks) {
        grainPerCook = groupingData.totalGrainWeight / groupingData.totalCooks;
      }
      // If not set, leave undefined so the solver runs

      const yieldEstimate =
        await this.yieldEstimationService.calculateYieldEstimate({
          whiskeyType,
          totalBarrels: totalQuantity,
          entryProof,
          containerType,
          grainPerCook,
          cooksPerFerm: recipe?.cooksPerFerm || undefined,
        });

      // Allow recipe-level overrides if they exist
      const recipeTotalCooks = recipe?.totalCooks;
      const recipeTotalFermenters = recipe?.totalFermenters;

      // Extract grainPerCook from metricsUsed (set by solver or input passthrough)
      const solvedGrainPerCook = yieldEstimate.metricsUsed.find(
        (m) => m.name === "grainPerCook"
      )?.value;

      return {
        totalCooks: recipeTotalCooks || yieldEstimate.totalCooks,
        totalFermenters: recipeTotalFermenters || yieldEstimate.totalFermenters,
        plannedCooks: recipeTotalCooks || yieldEstimate.plannedCooks,
        plannedFermenters:
          recipeTotalFermenters || yieldEstimate.plannedFermenters,
        estimatedBarrelsPerFermenter:
          yieldEstimate.estimatedBarrelsPerFermenter,
        estimatedPGsPerBbl: yieldEstimate.estimatedPGsPerBbl,
        estimatedPGsPerBushel: yieldEstimate.estimatedPGsPerBushel,
        totalGrainWeight: yieldEstimate.totalGrainWeight,
        totalBarrels: totalQuantity,
        totalProofGallons: yieldEstimate.totalProofGallons,
        grainPerCook: solvedGrainPerCook,
      };
    } catch (error) {
      this.logger.warn(
        `Yield estimation failed, using fallback defaults: ${error}`
      );
      // Fallback to basic calculation if yield service fails
      const estimatedPGsPerBbl = groupingData.estimatedPGsPerBbl || 66.34;
      const estimatedBarrelsPerFermenter =
        groupingData.estimatedBarrelsPerFermenter || 100;
      const calculatedFermenters = Math.ceil(
        totalQuantity / estimatedBarrelsPerFermenter
      );
      const calculatedCooks = calculatedFermenters * 3;

      return {
        totalCooks: calculatedCooks || 3,
        totalFermenters: calculatedFermenters || 1,
        plannedCooks: calculatedCooks || 3,
        plannedFermenters: calculatedFermenters || 1,
        estimatedBarrelsPerFermenter,
        estimatedPGsPerBbl,
        estimatedPGsPerBushel: 5.2,
        totalGrainWeight: calculatedCooks * 23000,
        totalBarrels: totalQuantity,
        totalProofGallons: totalQuantity * estimatedPGsPerBbl,
      };
    }
  }

  private createProductionOrderAllocation(
    productionOrders: any[]
  ): Prisma.InputJsonValue {
    return productionOrders.map((po) => ({
      id: po.id,
      name: po.name,
      customerId: po.customerId,
      customerName: po.customer?.name,
      containerType: po.containerType,
      finalProof: po.finalProof,
      quantity: po.quantity,
    })) as Prisma.InputJsonValue;
  }

  private generateScheduleOrderName(
    recipeName: string,
    customName?: string
  ): string {
    // Use crypto.randomBytes for truly unique suffix (fixes race condition with fast transactions)
    const uniqueSuffix = crypto.randomBytes(3).toString("hex"); // 6 char random hex

    if (customName) {
      // Use custom name but append unique suffix to ensure uniqueness
      return `${customName}-${uniqueSuffix}`;
    }

    // Default format for auto-generated names
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `SchO-${recipeName}-${timestamp}-${uniqueSuffix}`;
  }

  /**
   * Calculates schedule timing estimates based on grouping data and production orders.
   * Uses provided values if available, otherwise falls back to calculated defaults
   * based on totalCooks and start date.
   *
   * Default calculations:
   * - Mashing: 2 hours per cook
   * - Fermentation: 72 hours + mashing duration
   * - Distillation: same as fermentation duration
   */
  private calculateScheduleEstimates(
    groupingData: ProductionOrderGroupingData,
    productionOrders: any[]
  ): ScheduleEstimates {
    const numberOfCooks =
      groupingData.totalCooks || productionOrders.length * 3;
    const startDate = groupingData.estimatedStart;

    // Use provided values or calculate defaults
    const mashingDuration =
      groupingData.estimatedMashingDuration ?? numberOfCooks * 2;
    const fermentationDuration =
      groupingData.estimatedFermentationDuration ?? 72 + mashingDuration;
    const distillationDuration =
      groupingData.estimatedDistillationDuration ?? fermentationDuration;
    const totalDuration = fermentationDuration;

    // Calculate start times based on start date
    let mashingStartTime: Date | undefined;
    let fermentationStartTime: Date | undefined;
    let distillationStartTime: Date | undefined;
    let barrelingStartTime: Date | undefined;

    if (startDate) {
      // Mashing starts at the provided start date
      mashingStartTime = new Date(startDate);

      // Fermentation starts after first mash (2 hours after start)
      fermentationStartTime = new Date(startDate);
      fermentationStartTime.setHours(fermentationStartTime.getHours() + 2);

      // Fermentation ends after fermentation duration
      const fermentationEndTime = new Date(fermentationStartTime);
      fermentationEndTime.setHours(
        fermentationEndTime.getHours() + fermentationDuration
      );

      // Distillation starts after fermentation ends
      distillationStartTime = new Date(fermentationEndTime);

      // Distillation ends after distillation duration
      const distillationEndTime = new Date(distillationStartTime);
      distillationEndTime.setHours(
        distillationEndTime.getHours() + distillationDuration
      );

      // Barreling starts right after distillation
      barrelingStartTime = new Date(distillationEndTime);
    }

    return {
      mashingDuration,
      fermentationDuration,
      distillationDuration,
      totalDuration,
      mashingStartTime,
      fermentationStartTime,
      distillationStartTime,
      barrelingStartTime,
    };
  }
}
