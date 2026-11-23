import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BomServiceBase } from "./base/bom.service.base";
import {
  CalculateBomDto,
  CalculatedBomDto,
  CalculatedBomItemDto,
} from "./dto/calculate-bom.dto";

@Injectable()
export class BomService extends BomServiceBase {
  private readonly logger = new Logger(BomService.name);

  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Calculate the actual BOM quantities based on production parameters
   * @param calculateBomDto DTO containing calculation parameters
   * @returns Calculated BOM with actual quantities
   */
  async calculateBom(
    calculateBomDto: CalculateBomDto
  ): Promise<CalculatedBomDto> {
    const {
      recipeId,
      recipeBomId,
      orderQuantity,
      totalGrainWeight,
      totalCooks,
      totalFermenters,
    } = calculateBomDto;

    // Find the recipe
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID ${recipeId} not found`);
    }

    // Find the recipe BOM (either specified or highest revision)
    let recipeBom;
    if (recipeBomId) {
      recipeBom = await this.prisma.recipeBom.findUnique({
        where: { id: recipeBomId },
        include: {
          recipeBomITem: {
            include: {
              item: true,
              displayUnits: true,
            },
          },
        },
      });

      if (!recipeBom) {
        throw new NotFoundException(
          `Recipe BOM with ID ${recipeBomId} not found`
        );
      }
    } else {
      // Find the highest revision recipe BOM associated with the recipe
      const recipeWithBoms = await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
          recipeBoms: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              recipeBomITem: {
                include: {
                  item: true,
                  displayUnits: true,
                },
              },
            },
          },
        },
      });

      if (
        !recipeWithBoms?.recipeBoms ||
        recipeWithBoms.recipeBoms.length === 0
      ) {
        throw new NotFoundException(
          `No recipe BOMs found for recipe with ID ${recipeId}`
        );
      }

      recipeBom = recipeWithBoms.recipeBoms[0];
    }

    // Calculate BOM item quantities
    const calculatedItems: CalculatedBomItemDto[] = [];

    // Use the correct field name as per the Prisma schema
    const bomItems = recipeBom.recipeBomITem || [];

    for (const bomItem of bomItems) {
      // Default values
      let calculatedQuantity = bomItem.quantity || 0;
      let itemType = "Other";

      // Get unit information for calculation dispatch
      const unit = bomItem.displayUnits;
      const itemNumber = bomItem.item?.itemNumber?.toLowerCase() || "";

      // Unit-based calculation dispatch
      if (unit?.name === "Percent") {
        itemType = "Grain";
        // Grain calculation: (percentage / 100) × totalGrainWeight × totalCooks / orderQuantity
        calculatedQuantity =
          (((bomItem.quantity || 0) / 100) * totalGrainWeight * totalCooks) /
          orderQuantity;
      } else if (unit?.perOperation === "PerFermenter") {
        itemType = "Yeast";
        // Yeast calculation: qty × fermenter_count / finished_good
        calculatedQuantity =
          ((bomItem.quantity || 0) * totalFermenters) / orderQuantity;
      } else if (unit?.perOperation === "PerCook") {
        itemType = "Additive";
        // Enzyme/Additive calculation: qty × cook_count / finished_good
        calculatedQuantity =
          ((bomItem.quantity || 0) * totalCooks) / orderQuantity;
      } else if (
        itemNumber.includes("water") ||
        itemNumber.includes("backset")
      ) {
        itemType = "Liquid";
        // For water/backset: qty × cook_count (absolute quantity per cook)
        calculatedQuantity = (bomItem.quantity || 0) * totalCooks;
      } else {
        // Fallback: absolute quantity (no normalization)
        if (!unit) {
          this.logger.warn(
            `BOM item ${
              bomItem.item?.itemNumber || bomItem.itemId
            } has no displayUnits - using absolute quantity`
          );
        }
        calculatedQuantity = bomItem.quantity || 0;
      }

      // Round to 6 decimal places for precision (supports very small enzyme quantities)
      calculatedQuantity = Math.round(calculatedQuantity * 1000000) / 1000000;

      calculatedItems.push(
        new CalculatedBomItemDto({
          itemId: bomItem.itemId || "",
          itemNumber: bomItem.item?.itemNumber || "",
          itemName: bomItem.item?.itemName || "",
          itemType,
          originalQuantity: bomItem.quantity || 0,
          calculatedQuantity,
          units: bomItem.operation || "ea", // Default units to operation type if available
        })
      );
    }

    this.logger.log(
      `Calculated BOM for recipe ${recipeId} with ${calculatedItems.length} items`
    );

    return new CalculatedBomDto({
      recipeId,
      recipeBomId: recipeBom.id,
      items: calculatedItems,
    });
  }
}
