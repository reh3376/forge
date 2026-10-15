import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomItemServiceBase } from "./base/recipeBomItem.service.base";
import {
  RecipeBomItem as PrismaRecipeBomItem,
  Units as PrismaUnits,
} from "@prisma/client";

@Injectable()
export class RecipeBomItemService extends RecipeBomItemServiceBase {
  private readonly logger = new Logger(RecipeBomItemService.name);

  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Override getDisplayUnits to add debugging
   */
  async getDisplayUnits(parentId: string): Promise<PrismaUnits | null> {
    this.logger.log(
      `🔧 Service: getDisplayUnits called for RecipeBomItem: ${parentId}`
    );

    // First, check if the RecipeBomItem exists and has a displayUnitsId
    const bomItem = await this.prisma.recipeBomItem.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        displayUnitsId: true,
      },
    });

    this.logger.log(
      `🔧 Service: RecipeBomItem ${parentId} has displayUnitsId: ${
        bomItem?.displayUnitsId || "NULL"
      }`
    );

    if (!bomItem) {
      this.logger.warn(`⚠️  Service: RecipeBomItem ${parentId} not found`);
      return null;
    }

    if (!bomItem.displayUnitsId) {
      this.logger.warn(
        `⚠️  Service: RecipeBomItem ${parentId} has NULL displayUnitsId`
      );
      return null;
    }

    // Now fetch the Units using the base class method
    const result = await super.getDisplayUnits(parentId);

    this.logger.log(
      `🔧 Service: Units result for ${parentId}: ${
        result
          ? `${result.id} (${result.name}, ${result.abbreviation})`
          : "NULL"
      }`
    );

    return result;
  }

  /**
   * Override the delete method to handle the relationship with MashingProtocolStep
   * When a recipe BOM item is deleted, we need to clear its reference in any linked MashingProtocolSteps
   */
  async deleteRecipeBomItem(args: any): Promise<PrismaRecipeBomItem> {
    this.logger.log(`Deleting recipe BOM item with ID: ${args.where.id}`);

    // First, get all MashingProtocolSteps linked to this BOM item
    const recipeBomItem = await this.prisma.recipeBomItem.findUnique({
      where: { id: args.where.id },
      include: { mashingProtocolSteps: true },
    });

    if (!recipeBomItem) {
      this.logger.warn(`RecipeBomItem with ID ${args.where.id} not found`);
      return super.deleteRecipeBomItem(args);
    }

    // If there are linked MashingProtocolSteps, update them to remove the relationship
    if (
      recipeBomItem.mashingProtocolSteps &&
      recipeBomItem.mashingProtocolSteps.length > 0
    ) {
      this.logger.log(
        `Found ${recipeBomItem.mashingProtocolSteps.length} MashingProtocolSteps linked to this BOM item, unlinking...`
      );

      // Use a transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // For each linked MashingProtocolStep, remove this RecipeBomItem from its list
        for (const step of recipeBomItem.mashingProtocolSteps) {
          await tx.mashingProtocolStep.update({
            where: { id: step.id },
            data: {
              recipeBomItem: {
                disconnect: { id: args.where.id },
              },
            },
          });
        }

        // Then proceed with the deletion
        return tx.recipeBomItem.delete(args);
      });
    }

    // If no related MashingProtocolSteps, proceed with the normal deletion
    return super.deleteRecipeBomItem(args);
  }

  /**
   * Override the update method to handle changes in the item's properties
   * When certain properties of a RecipeBomItem change, it may affect its relationship with MashingProtocolSteps
   */
  async updateRecipeBomItem(args: any): Promise<PrismaRecipeBomItem> {
    this.logger.log(`Updating recipe BOM item with ID: ${args.where.id}`);

    // Check if update involves changing the item's properties that may affect MashingProtocolSteps
    const significantChanges =
      args.data &&
      (args.data.item ||
        args.data.quantity !== undefined ||
        args.data.operation !== undefined);

    // If there are no significant changes, proceed normally
    if (!significantChanges) {
      return super.updateRecipeBomItem(args);
    }

    // Check if RecipeBomItem is being disconnected from RecipeBom
    const removingFromRecipeBom =
      args.data && args.data.recipeBoms && args.data.recipeBoms.disconnect;

    if (removingFromRecipeBom) {
      this.logger.log(
        `BOM item is being disconnected from recipe BOM, handling MashingProtocolStep relationships`
      );

      // Use transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // Get the BOM item with its relationships
        const recipeBomItem = await tx.recipeBomItem.findUnique({
          where: { id: args.where.id },
          include: { mashingProtocolSteps: true },
        });

        if (recipeBomItem && recipeBomItem.mashingProtocolSteps.length > 0) {
          // For each linked MashingProtocolStep, disconnect this RecipeBomItem
          for (const step of recipeBomItem.mashingProtocolSteps) {
            await tx.mashingProtocolStep.update({
              where: { id: step.id },
              data: {
                recipeBomItem: {
                  disconnect: { id: args.where.id },
                },
              },
            });
          }
        }

        // Then proceed with the update
        return tx.recipeBomItem.update(args);
      });
    }

    // For other updates, proceed normally
    return super.updateRecipeBomItem(args);
  }
}
