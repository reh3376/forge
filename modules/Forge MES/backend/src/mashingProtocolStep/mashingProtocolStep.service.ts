import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingProtocolStepServiceBase } from "./base/mashingProtocolStep.service.base";
import { MashingProtocolStep as PrismaMashingProtocolStep } from "@prisma/client";

@Injectable()
export class MashingProtocolStepService extends MashingProtocolStepServiceBase {
  private readonly logger = new Logger(MashingProtocolStepService.name);

  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Override the delete method to handle the relationship with RecipeBomItem
   * When a mashing protocol step is deleted, we need to clear its reference in any linked RecipeBomItems
   */
  async deleteMashingProtocolStep(
    args: any
  ): Promise<PrismaMashingProtocolStep> {
    this.logger.log(`Deleting mashing protocol step with ID: ${args.where.id}`);

    // First, get all RecipeBomItems linked to this step
    const step = await this.prisma.mashingProtocolStep.findUnique({
      where: { id: args.where.id },
      include: { recipeBomItem: true },
    });

    if (!step) {
      this.logger.warn(
        `MashingProtocolStep with ID ${args.where.id} not found`
      );
      return super.deleteMashingProtocolStep(args);
    }

    // If there are linked RecipeBomItems, update them to remove the relationship
    if (step.recipeBomItem && step.recipeBomItem.length > 0) {
      this.logger.log(
        `Found ${step.recipeBomItem.length} RecipeBomItems linked to this step, unlinking...`
      );

      // Use a transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // First, disconnect all RecipeBomItems from this step
        await tx.mashingProtocolStep.update({
          where: { id: args.where.id },
          data: {
            recipeBomItem: {
              set: [], // Remove all connections
            },
          },
        });

        // Then proceed with the deletion
        return tx.mashingProtocolStep.delete(args);
      });
    }

    // If no related RecipeBomItems, proceed with the normal deletion
    return super.deleteMashingProtocolStep(args);
  }

  /**
   * Override the update method to handle changes in the relationship with RecipeBomItem
   */
  async updateMashingProtocolStep(
    args: any
  ): Promise<PrismaMashingProtocolStep> {
    this.logger.log(`Updating mashing protocol step with ID: ${args.where.id}`);

    // Check if update involves removing connection to MashingProtocol
    if (
      args.data &&
      args.data.mashingProtocol &&
      args.data.mashingProtocol.disconnect
    ) {
      this.logger.log(
        `Step is being disconnected from mashing protocol, handling RecipeBomItem relationships`
      );

      // Use transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // First disconnect all RecipeBomItems
        await tx.mashingProtocolStep.update({
          where: { id: args.where.id },
          data: {
            recipeBomItem: {
              set: [], // Remove all connections
            },
          },
        });

        // Then proceed with the update
        return tx.mashingProtocolStep.update(args);
      });
    }

    // For other updates, proceed normally
    return super.updateMashingProtocolStep(args);
  }
}
