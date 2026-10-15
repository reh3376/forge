import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  EnumProductionOrderContainerType,
  ProductionOrder,
  ScheduleOrder,
  Item,
} from "@prisma/client";
import { ValidationRuleEngine } from "./validation-rules";
import { ContainerItemService } from "../productionOrder/container-item.service";

export interface ProductionOrderValidationData {
  customer: { id: string };
  bom: { id: string };
  item: { id: string };
  containerType: EnumProductionOrderContainerType;
  finalProof: number;
  containerItem?: Item[];
  recipe?: { id: string; recipeGroupId?: string };
  scheduleOrder?: { id: string; recipeGroup?: { id: string } };
}

export interface ScheduleOrderValidationData {
  recipeGroup: { id: string };
  scheduleOrderRecipe?: { id: string };
  productionOrders?: ProductionOrder[];
}

@Injectable()
export class OrderValidationService {
  private readonly logger = new Logger(OrderValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly containerItemService: ContainerItemService
  ) {}

  /**
   * Validates Production Order for MES Phase 1 requirements:
   * - One customer, one mash bill, one container type, one proof, one BOM
   * - Container item validation for barrel types
   */
  async validateProductionOrder(
    data: ProductionOrderValidationData
  ): Promise<void> {
    const errors: string[] = [];

    // Validate single-entity constraints
    await this.validateSingleEntityConstraints(data, errors);

    // Only proceed with container validation if basic constraints are met
    if (errors.length === 0) {
      // Validate container type and item matching
      await this.validateContainerItems(data, errors);

      // Validate mash bill consistency
      await this.validateMashBillConsistency(data, errors);

      // Validate BOM is production BOM (not Recipe BOM)
      await this.validateProductionBOM(data, errors);
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Production Order validation failed",
        errors: errors,
      });
    }
  }

  /**
   * Validates Schedule Order for MES Phase 1 requirements:
   * - Recipe BOM completeness including mashing additives and yeast
   * - Mash bill consistency across production orders
   */
  async validateScheduleOrder(
    data: ScheduleOrderValidationData
  ): Promise<void> {
    const errors: string[] = [];

    // Validate Recipe BOM completeness
    await this.validateRecipeBOMCompleteness(data, errors);

    // Validate production order grouping consistency
    await this.validateProductionOrderGrouping(data, errors);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Schedule Order validation failed",
        errors: errors,
      });
    }
  }

  /**
   * Validates cross-order relationships and consistency
   */
  async validateCrossOrderConsistency(
    scheduleOrderId: string,
    productionOrderIds: string[]
  ): Promise<void> {
    const errors: string[] = [];

    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        recipeGroup: true,
        scheduleOrderRecipe: {
          include: {
            recipeBoms: {
              include: {
                recipeBomITem: {
                  include: { item: true },
                },
              },
            },
          },
        },
      },
    });

    if (!scheduleOrder) {
      errors.push(`Schedule Order ${scheduleOrderId} not found`);
      throw new BadRequestException({ message: "Validation failed", errors });
    }

    // Validate all production orders share the same mash bill
    for (const productionOrderId of productionOrderIds) {
      const productionOrder = await this.prisma.productionOrder.findUnique({
        where: { id: productionOrderId },
        include: {
          recipe: true,
        },
      });

      if (!productionOrder) {
        errors.push(`Production Order ${productionOrderId} not found`);
        continue;
      }

      if (
        productionOrder.recipe?.recipeGroupId !== scheduleOrder.recipeGroup?.id
      ) {
        errors.push(
          `Production Order ${productionOrderId} mash bill does not match Schedule Order mash bill`
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Cross-order validation failed",
        errors: errors,
      });
    }
  }

  private async validateSingleEntityConstraints(
    data: ProductionOrderValidationData,
    errors: string[]
  ): Promise<void> {
    // Validate required fields
    if (!data.customer?.id) {
      errors.push("Customer is required");
    }

    if (!data.bom?.id) {
      errors.push("BOM is required");
    }

    if (!data.item?.id) {
      errors.push("Item (FG code) is required");
    }

    if (!data.containerType) {
      errors.push("Container type is required");
    }

    if (!data.finalProof || data.finalProof <= 0) {
      errors.push("Final proof is required and must be greater than 0");
    }
  }

  private async validateContainerItems(
    data: ProductionOrderValidationData,
    errors: string[]
  ): Promise<void> {
    // Check if this container type requires item selection using ValidationRuleEngine
    if (
      !ValidationRuleEngine.requiresContainerItemSelection(data.containerType)
    ) {
      // For non-barrel types, containerItem should not be selected
      if (data.containerItem && data.containerItem.length > 0) {
        errors.push(
          `Container items cannot be selected for container type ${data.containerType}`
        );
      }
      return;
    }

    // For container types that require item selection (barrels)
    if (!data.containerItem || data.containerItem.length === 0) {
      errors.push(
        `Container item must be selected for container type ${data.containerType}`
      );
      return;
    }

    // Only one container item should be selected per Production Order
    if (data.containerItem.length > 1) {
      errors.push(
        "Only one container item can be selected per Production Order"
      );
      return;
    }

    // Validate the selected item is compatible with the container type
    const containerItem = data.containerItem[0];
    const compatibilityResult =
      await this.containerItemService.validateContainerItemCompatibility(
        containerItem.id,
        data.containerType
      );

    if (!compatibilityResult.isValid) {
      errors.push(
        compatibilityResult.message ||
          "Container item is not compatible with selected container type"
      );
    }
  }

  private async validateMashBillConsistency(
    data: ProductionOrderValidationData,
    errors: string[]
  ): Promise<void> {
    // If both recipe and schedule order are provided, validate mash bill consistency
    if (data.recipe?.recipeGroupId && data.scheduleOrder?.recipeGroup?.id) {
      if (data.recipe.recipeGroupId !== data.scheduleOrder.recipeGroup.id) {
        errors.push(
          "Production Order recipe mash bill must match Schedule Order mash bill"
        );
      }
    }
  }

  private async validateProductionBOM(
    data: ProductionOrderValidationData,
    errors: string[]
  ): Promise<void> {
    if (!data.bom?.id) return;

    const bom = await this.prisma.bom.findUnique({
      where: { id: data.bom.id },
    });

    if (!bom) {
      errors.push("BOM not found");
      return;
    }

    // Validate this is a production BOM, not a recipe BOM
    if (bom.bomType === "RecipeBom") {
      errors.push(
        "Production Orders must use Production BOMs, not Recipe BOMs"
      );
    }
  }

  private async validateRecipeBOMCompleteness(
    data: ScheduleOrderValidationData,
    errors: string[]
  ): Promise<void> {
    if (!data.scheduleOrderRecipe?.id) {
      errors.push("Schedule Order must have an associated Recipe BOM");
      return;
    }

    const recipe = await this.prisma.recipe.findUnique({
      where: { id: data.scheduleOrderRecipe.id },
      include: {
        recipeBoms: {
          include: {
            recipeBomITem: {
              include: { item: true },
            },
          },
        },
      },
    });

    if (!recipe) {
      errors.push("Recipe BOM not found");
      return;
    }

    // Validate Recipe BOM includes required components
    const bomItems =
      recipe.recipeBoms?.flatMap((bom) => bom.recipeBomITem) || [];
    const itemCategories = bomItems
      .map((item: any) => item.item?.category)
      .filter(Boolean);

    // Check for mashing additives
    const hasMashingAdditives = itemCategories.some(
      (category: any) =>
        category?.includes("ADDITIVE") || category?.includes("ENZYME")
    );

    if (!hasMashingAdditives) {
      errors.push("Recipe BOM must include mashing additives");
    }

    // Check for yeast
    const hasYeast = itemCategories.some(
      (category: any) =>
        category?.includes("YEAST") || category?.includes("MICROORGANISM")
    );

    if (!hasYeast) {
      errors.push("Recipe BOM must include yeast specifications");
    }

    // Check for grain
    const hasGrain = itemCategories.some(
      (category: any) =>
        category?.includes("GRAIN") ||
        category?.includes("CORN") ||
        category?.includes("WHEAT")
    );

    if (!hasGrain) {
      errors.push("Recipe BOM must include grain components");
    }
  }

  private async validateProductionOrderGrouping(
    data: ScheduleOrderValidationData,
    errors: string[]
  ): Promise<void> {
    if (!data.productionOrders || data.productionOrders.length === 0) {
      return; // No production orders to validate
    }

    const scheduleOrderMashBill = data.recipeGroup?.id;

    for (const productionOrder of data.productionOrders) {
      const fullProductionOrder = await this.prisma.productionOrder.findUnique({
        where: { id: productionOrder.id },
        include: {
          recipe: true,
        },
      });

      if (!fullProductionOrder) continue;

      const productionOrderMashBill = fullProductionOrder.recipe?.recipeGroupId;

      if (productionOrderMashBill !== scheduleOrderMashBill) {
        errors.push(
          `Production Order ${productionOrder.id} mash bill does not match Schedule Order mash bill`
        );
      }
    }
  }

  /**
   * Utility method to fetch available container items by type
   * Delegates to ContainerItemService for consistency
   */
  async getAvailableContainerItems(
    containerType: EnumProductionOrderContainerType
  ): Promise<Item[]> {
    return this.containerItemService.getContainerItemsByType(containerType);
  }
}
