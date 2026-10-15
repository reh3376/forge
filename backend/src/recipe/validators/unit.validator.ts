import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RecipeBomItem } from "@prisma/client";

@Injectable()
export class UnitValidator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate that grain percentages sum to 100%
   */
  async validateGrainPercentages(bomItems: RecipeBomItem[]): Promise<void> {
    const grainItems = await this.filterByUnit(bomItems, "Percent");

    if (grainItems.length === 0) return;

    const total = grainItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );
    const tolerance = 0.01;

    if (Math.abs(total - 100) > tolerance) {
      throw new BadRequestException(
        `Grain percentages must sum to 100% (current: ${total.toFixed(2)}%)`
      );
    }
  }

  /**
   * Validate unit appropriateness for item category
   */
  async validateUnitForItem(itemId: string, unitId: string): Promise<void> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    const unit = await this.prisma.units.findUnique({
      where: { id: unitId },
    });

    if (!item || !unit) return;

    // Validation rules
    const itemGroup = item.itemGroup?.toLowerCase() || "";

    if (itemGroup.includes("grain") && unit.name !== "Percent") {
      throw new BadRequestException(`Grain items should use Percent (%) units`);
    }

    if (itemGroup.includes("yeast") && unit.perOperation !== "PerFermenter") {
      throw new BadRequestException(
        `Yeast items should use Kg/Fermenter units`
      );
    }

    if (itemGroup.includes("enzyme") && unit.perOperation !== "PerCook") {
      throw new BadRequestException(`Enzyme items should use Lbs/Cook units`);
    }
  }

  /**
   * Validate quantity ranges for derived units
   */
  validateQuantityRange(quantity: number, unitName: string): void {
    if (unitName === "Percent") {
      if (quantity < 0 || quantity > 100) {
        throw new BadRequestException(
          `Percentage must be between 0 and 100 (got ${quantity})`
        );
      }
    }

    if (quantity < 0) {
      throw new BadRequestException(
        `Quantity cannot be negative (got ${quantity})`
      );
    }
  }

  // Helper methods
  private async filterByUnit(
    bomItems: RecipeBomItem[],
    unitName: string
  ): Promise<RecipeBomItem[]> {
    const itemsWithUnits = await this.prisma.recipeBomItem.findMany({
      where: { id: { in: bomItems.map((i) => i.id) } },
      include: { displayUnits: true },
    });

    return itemsWithUnits.filter(
      (item) => item.displayUnits?.name === unitName
    );
  }
}
