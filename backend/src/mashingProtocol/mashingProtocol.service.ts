import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingProtocolServiceBase } from "./base/mashingProtocol.service.base";
import { MashingProtocol as PrismaMashingProtocol } from "@prisma/client";

@Injectable()
export class MashingProtocolService extends MashingProtocolServiceBase {
  private readonly logger = new Logger(MashingProtocolService.name);

  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  // Add method to find only templates
  async findTemplates(): Promise<PrismaMashingProtocol[]> {
    return this.prisma.mashingProtocol.findMany({
      where: {
        isTemplate: true,
      },
      include: {
        steps: {
          include: {
            recipeBomItem: true,
          },
          orderBy: {
            index: "asc",
          },
        },
      },
    });
  }

  // Add method to clone a template
  async cloneTemplate(
    templateId: string,
    newName: string,
    createdBy: string
  ): Promise<PrismaMashingProtocol> {
    // First check if template exists
    const template = await this.prisma.mashingProtocol.findUnique({
      where: { id: templateId },
      include: {
        steps: {
          include: {
            recipeBomItem: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID ${templateId} not found`);
    }

    // Create new protocol with the same properties but a different name
    const newProtocol = await this.prisma.mashingProtocol.create({
      data: {
        name: newName,
        createdBy: createdBy,
        isTemplate: false, // This is not a template but a real protocol
        master: true, // Set as a master protocol
        updatedBy: createdBy,
        templateCategory: template.templateCategory,
        // Don't copy template-specific fields
      },
    });

    // Clone each step
    for (const step of template.steps) {
      await this.prisma.mashingProtocolStep.create({
        data: {
          mashingProtocol: { connect: { id: newProtocol.id } },
          index: step.index,
          stepType: step.stepType,
          holdType: step.holdType,
          stepTime: step.stepTime,
          temperatureSetpoint: step.temperatureSetpoint,
          heatEnabled: step.heatEnabled,
          coolEnabled: step.coolEnabled,
          agitatorEnabled: step.agitatorEnabled,
          agitatorSpdSp: step.agitatorSpdSp,
          promptMessage: step.promptMessage,
          createdBy: createdBy,
          updatedBy: createdBy,
          // Connect recipe BOM items - this is a bit complex
          recipeBomItem: step.recipeBomItem
            ? {
                connect: step.recipeBomItem.map((item) => ({ id: item.id })),
              }
            : undefined,
        },
      });
    }

    // Return the new protocol with all its steps
    const result = await this.prisma.mashingProtocol.findUnique({
      where: { id: newProtocol.id },
      include: {
        steps: {
          include: {
            recipeBomItem: true,
          },
        },
      },
    });

    if (!result) {
      throw new NotFoundException(
        `Created protocol with ID ${newProtocol.id} not found`
      );
    }

    return result;
  }

  /**
   * Override the delete method to properly handle cascading operations
   * When a mashing protocol is deleted, we need to:
   * 1. Disconnect all recipe BOM items from each step
   * 2. Then delete the steps
   * 3. Then delete the protocol itself
   */
  async deleteMashingProtocol(args: any): Promise<PrismaMashingProtocol> {
    this.logger.log(`Deleting mashing protocol with ID: ${args.where.id}`);

    // First, get the protocol with all its steps and their BOM items
    const protocol = await this.prisma.mashingProtocol.findUnique({
      where: { id: args.where.id },
      include: {
        steps: {
          include: {
            recipeBomItem: true,
          },
        },
      },
    });

    if (!protocol) {
      this.logger.warn(`MashingProtocol with ID ${args.where.id} not found`);
      return super.deleteMashingProtocol(args);
    }

    // If there are steps, handle them before deletion
    if (protocol.steps && protocol.steps.length > 0) {
      this.logger.log(
        `Found ${protocol.steps.length} steps in this protocol, handling their relationships before deletion`
      );

      // Use a transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // For each step, first disconnect all BOM items
        for (const step of protocol.steps) {
          if (step.recipeBomItem && step.recipeBomItem.length > 0) {
            this.logger.log(
              `Disconnecting ${step.recipeBomItem.length} BOM items from step ${step.id}`
            );

            await tx.mashingProtocolStep.update({
              where: { id: step.id },
              data: {
                recipeBomItem: {
                  set: [], // Remove all connections
                },
              },
            });
          }
        }

        // Then delete all steps
        this.logger.log(`Deleting all steps for protocol ${args.where.id}`);
        await tx.mashingProtocolStep.deleteMany({
          where: { mashingProtocolId: args.where.id },
        });

        // Finally, delete the protocol
        return tx.mashingProtocol.delete(args);
      });
    }

    // If no steps, proceed with the normal deletion
    return super.deleteMashingProtocol(args);
  }

  /**
   * Override the update method to handle changes to protocol steps relationships
   */
  async updateMashingProtocol(args: any): Promise<PrismaMashingProtocol> {
    this.logger.log(`Updating mashing protocol with ID: ${args.where.id}`);

    // Check if update involves disconnecting from recipes
    const disconnectingFromRecipes =
      args.data && args.data.recipes && args.data.recipes.disconnect;

    if (disconnectingFromRecipes) {
      this.logger.log(
        `Protocol is being disconnected from recipes, verifying BOM item relationships`
      );

      return await this.prisma.$transaction(async (tx) => {
        // Get the protocol with all its steps and their BOM items
        const protocol = await tx.mashingProtocol.findUnique({
          where: { id: args.where.id },
          include: {
            steps: {
              include: {
                recipeBomItem: true,
              },
            },
          },
        });

        if (protocol && protocol.steps) {
          // For each step with BOM items, check if those items are still valid
          // We'll leave the BOM items connected unless they no longer belong to any recipe
          // attached to this protocol after the update

          // First, determine which recipes will remain connected after the update
          let remainingRecipeIds: string[] = [];

          if (Array.isArray(disconnectingFromRecipes)) {
            // Get all current recipe IDs
            const currentRecipes = await tx.mashingProtocol
              .findUnique({
                where: { id: args.where.id },
                include: { recipes: true },
              })
              .then((protocol) => protocol?.recipes.map((r) => r.id) || []);

            // Filter out the ones being disconnected
            const disconnectingIds = disconnectingFromRecipes.map(
              (r: any) => r.id
            );
            remainingRecipeIds = currentRecipes.filter(
              (id) => !disconnectingIds.includes(id)
            );
          }

          // If no recipes will remain, clear all BOM item connections
          if (remainingRecipeIds.length === 0) {
            for (const step of protocol.steps) {
              if (step.recipeBomItem && step.recipeBomItem.length > 0) {
                this.logger.log(
                  `No recipes remain connected to protocol, disconnecting all BOM items from step ${step.id}`
                );

                await tx.mashingProtocolStep.update({
                  where: { id: step.id },
                  data: {
                    recipeBomItem: {
                      set: [], // Remove all connections
                    },
                  },
                });
              }
            }
          }
        }

        // Then proceed with the update
        return tx.mashingProtocol.update(args);
      });
    }

    // For other updates, proceed normally
    return super.updateMashingProtocol(args);
  }
}
