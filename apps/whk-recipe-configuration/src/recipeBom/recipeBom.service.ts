import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomServiceBase } from "./base/recipeBom.service.base";
import { RecipeBom as PrismaRecipeBom, RecipeBomItem } from "@prisma/client";
import { EnzymeDosingService } from "../recipe/enzyme.dosing";
import {
  ValidateRecipeBomDto,
  ValidationResultDto,
} from "./dto/validate-recipe-bom.dto";
import {
  GenerateRecipeBomDto,
  GenerateRecipeBomResultDto,
  BomItemSuggestion,
} from "./dto/generate-recipe-bom.dto";

// Define a more specific Item interface with the properties we need
interface ExtendedItem {
  id: string;
  name?: string | null;
  itemGroup?: string | null;
  // Add other properties as needed
}

interface RecipeBomWithRelations extends PrismaRecipeBom {
  recipe?: {
    mashBill?: string;
  };
  recipeBomITem: (RecipeBomItem & {
    item?: ExtendedItem | null;
    quantity?: number;
    unit?: string;
  })[];
}

@Injectable()
export class RecipeBomService extends RecipeBomServiceBase {
  private readonly logger = new Logger(RecipeBomService.name);

  constructor(
    protected readonly prisma: PrismaService,
    private readonly enzymeDosingService: EnzymeDosingService
  ) {
    super(prisma);
  }

  /**
   * Generate recipe BOM item suggestions based on recipe name with mash bill
   * @param data Object containing recipe name
   * @returns Suggested BOM items for grains, water, and backset
   */
  async generateRecipeBomSuggestions(
    data: GenerateRecipeBomDto
  ): Promise<GenerateRecipeBomResultDto> {
    this.logger.log(
      `Generating recipe BOM suggestions for recipe: ${data.recipeName}`
    );

    const result: GenerateRecipeBomResultDto = {
      mashBill: "",
      cornPct: 0,
      ryePct: 0,
      wheatPct: 0,
      maltPct: 0,
      suggestedItems: [],
      success: false,
    };

    // Parse mash bill from recipe name
    // Format is typically "Recipe Name 70-21-00-09"
    const mashBillRegex = /(\d{2})-(\d{2})-(\d{2})-(\d{2})/;
    const match = data.recipeName.match(mashBillRegex);

    if (!match) {
      result.error =
        "Could not parse mash bill from recipe name. Expected format: 'Recipe Name XX-XX-XX-XX'";
      return result;
    }

    result.mashBill = match[0]; // e.g., "70-21-00-09"
    result.cornPct = parseInt(match[1], 10);
    result.ryePct = parseInt(match[2], 10);
    result.wheatPct = parseInt(match[3], 10);
    result.maltPct = parseInt(match[4], 10);
    result.success = true;

    // Generate grain suggestions
    if (result.cornPct > 0) {
      result.suggestedItems.push({
        name: "Corn",
        itemGroup: "RM-GRN",
        quantity: 1000 * (result.cornPct / 100), // Example quantity based on 1000 lbs total grains
        unit: "LBS",
        type: "grain",
        percentage: result.cornPct,
      });
    }

    if (result.ryePct > 0) {
      result.suggestedItems.push({
        name: "Rye",
        itemGroup: "RM-GRN",
        quantity: 1000 * (result.ryePct / 100),
        unit: "LBS",
        type: "grain",
        percentage: result.ryePct,
      });
    }

    if (result.wheatPct > 0) {
      result.suggestedItems.push({
        name: "Wheat",
        itemGroup: "RM-GRN",
        quantity: 1000 * (result.wheatPct / 100),
        unit: "LBS",
        type: "grain",
        percentage: result.wheatPct,
      });
    }

    if (result.maltPct > 0) {
      result.suggestedItems.push({
        name: "Malted Barley",
        itemGroup: "RM-GRN",
        quantity: 1000 * (result.maltPct / 100),
        unit: "LBS",
        type: "grain",
        percentage: result.maltPct,
      });
    }

    // Add water - typically 4-5 gallons per bushel of grain
    // 1 bushel ≈ 56 lbs, so water needed ≈ totalGrainLbs / 56 * 4.5 gallons
    const totalGrainLbs = 1000; // Example total grain weight
    const waterGallons = Math.round((totalGrainLbs / 56) * 4.5);

    result.suggestedItems.push({
      name: "Water",
      itemGroup: "RM-WAT",
      quantity: waterGallons,
      unit: "GAL",
      type: "water",
    });

    // Add backset - typically 25-30% of total mash volume
    // If water is 4.5 gal/bushel, then backset ≈ totalGrainLbs / 56 * 4.5 * 0.25 gallons
    const backsetGallons = Math.round((totalGrainLbs / 56) * 4.5 * 0.25);

    result.suggestedItems.push({
      name: "Backset",
      itemGroup: "RM-BST",
      quantity: backsetGallons,
      unit: "GAL",
      type: "backset",
    });

    // Try to find actual grain items from the database to suggest more accurate names
    try {
      const grainItems = await this.prisma.item.findMany({
        where: {
          OR: [
            { itemDescription: { contains: "Corn", mode: "insensitive" } },
            { itemDescription: { contains: "Rye", mode: "insensitive" } },
            { itemDescription: { contains: "Wheat", mode: "insensitive" } },
            { itemDescription: { contains: "Malt", mode: "insensitive" } },
          ],
          active: true,
        },
        take: 20,
        select: {
          id: true,
          itemDescription: true,
          itemGroup: true,
        },
      });

      // Replace generic grain suggestions with actual items from database
      if (grainItems.length > 0) {
        // Process each grain type
        for (let i = 0; i < result.suggestedItems.length; i++) {
          const item = result.suggestedItems[i];
          if (item.type === "grain") {
            // Find matching grain in database
            const grainType = item.name.toLowerCase();
            const matchingGrain = grainItems.find(
              (g) =>
                g.itemDescription &&
                typeof g.itemDescription === "string" &&
                g.itemDescription.toLowerCase().includes(grainType)
            );

            if (matchingGrain) {
              // Update with actual item details
              result.suggestedItems[i] = {
                ...item,
                name: (matchingGrain.itemDescription as string) || item.name,
                itemGroup:
                  (matchingGrain.itemGroup as string) || item.itemGroup,
              };
            }
          }
        }
      }

      // Find water and backset items
      const waterAndBackset = await this.prisma.item.findMany({
        where: {
          OR: [
            { itemDescription: { contains: "Water", mode: "insensitive" } },
            { itemDescription: { contains: "Backset", mode: "insensitive" } },
          ],
          active: true,
        },
        take: 5,
        select: {
          id: true,
          itemDescription: true,
          itemGroup: true,
        },
      });

      // Replace generic water and backset with actual items
      if (waterAndBackset.length > 0) {
        for (let i = 0; i < result.suggestedItems.length; i++) {
          const item = result.suggestedItems[i];
          if (item.type === "water" || item.type === "backset") {
            const itemType = item.type;
            const matchingItem = waterAndBackset.find(
              (w) =>
                w.itemDescription &&
                typeof w.itemDescription === "string" &&
                w.itemDescription.toLowerCase().includes(itemType)
            );

            if (matchingItem) {
              result.suggestedItems[i] = {
                ...item,
                name: (matchingItem.itemDescription as string) || item.name,
                itemGroup: (matchingItem.itemGroup as string) || item.itemGroup,
              };
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error finding actual items from database: ${error}`);
      // Continue with generic suggestions if database lookup fails
    }

    return result;
  }

  /**
   * Validates a Recipe BOM for completeness and correctness
   * Checks for:
   * - Correct enzymes (one of each type)
   * - Grain matching mash bill
   * - Water/backset presence
   * - Yeast presence
   */
  async validateRecipeBom(
    data: ValidateRecipeBomDto
  ): Promise<ValidationResultDto> {
    this.logger.log(`Validating recipe BOM for recipe: ${data.recipeName}`);

    const result: ValidationResultDto = {
      isValid: true,
      issues: [],
    };

    // Parse mash bill from recipe name
    // Format is typically "Recipe Name 70-21-00-09"
    const mashBillRegex = /(\d{2})-(\d{2})-(\d{2})-(\d{2})/;
    const match = data.recipeName.match(mashBillRegex);

    if (!match) {
      result.isValid = false;
      result.issues.push(
        "Could not parse mash bill from recipe name. Expected format: 'Recipe Name XX-XX-XX-XX'"
      );
      return result;
    }

    const mashBill = match[0]; // e.g., "70-21-00-09"
    result.mashBill = mashBill;

    const cornPct = parseInt(match[1], 10);
    const ryePct = parseInt(match[2], 10);
    const wheatPct = parseInt(match[3], 10);
    const maltPct = parseInt(match[4], 10);

    // Check if percentages sum to approximately 100
    const totalPct = cornPct + ryePct + wheatPct + maltPct;
    if (totalPct < 98 || totalPct > 102) {
      result.isValid = false;
      result.issues.push(
        `Mash bill percentages (${cornPct}% corn, ${ryePct}% rye, ${wheatPct}% wheat, ${maltPct}% malt) should sum to approximately 100% but sum to ${totalPct}%`
      );
    }

    // Validate required enzymes
    const enzymeSaccharification = data.recipeBomItems.find(
      (item) =>
        item.itemGroup === "RM-ENZ-SAC" ||
        (item.name &&
          item.name.toLowerCase().includes("enzyme") &&
          item.name.toLowerCase().includes("sacch"))
    );

    const enzymeViscosity = data.recipeBomItems.find(
      (item) =>
        item.itemGroup === "RM-ENZ-VIS" ||
        (item.name &&
          item.name.toLowerCase().includes("enzyme") &&
          item.name.toLowerCase().includes("visc"))
    );

    const enzymeLiquefaction = data.recipeBomItems.find(
      (item) =>
        item.itemGroup === "RM-ENZ-LQF" ||
        (item.name &&
          item.name.toLowerCase().includes("enzyme") &&
          item.name.toLowerCase().includes("lique"))
    );

    if (!enzymeSaccharification) {
      result.isValid = false;
      result.issues.push("Missing saccharification enzyme (RM-ENZ-SAC)");
    }

    if (!enzymeViscosity) {
      result.isValid = false;
      result.issues.push("Missing viscosity enzyme (RM-ENZ-VIS)");
    }

    if (!enzymeLiquefaction) {
      result.isValid = false;
      result.issues.push("Missing liquefaction enzyme (RM-ENZ-LQF)");
    }

    // Validate grains match mash bill
    const cornItems = data.recipeBomItems.filter(
      (item) =>
        item.name &&
        item.name.toLowerCase().includes("corn") &&
        !item.name.toLowerCase().includes("enzyme")
    );

    const ryeItems = data.recipeBomItems.filter(
      (item) =>
        item.name &&
        item.name.toLowerCase().includes("rye") &&
        !item.name.toLowerCase().includes("enzyme")
    );

    const wheatItems = data.recipeBomItems.filter(
      (item) =>
        item.name &&
        item.name.toLowerCase().includes("wheat") &&
        !item.name.toLowerCase().includes("enzyme")
    );

    const maltItems = data.recipeBomItems.filter(
      (item) =>
        item.name &&
        item.name.toLowerCase().includes("malt") &&
        !item.name.toLowerCase().includes("enzyme")
    );

    // Check corn
    if (cornPct > 0 && cornItems.length === 0) {
      result.isValid = false;
      result.issues.push(
        `Mash bill requires ${cornPct}% corn but no corn items found`
      );
    }

    // Check rye
    if (ryePct > 0 && ryeItems.length === 0) {
      result.isValid = false;
      result.issues.push(
        `Mash bill requires ${ryePct}% rye but no rye items found`
      );
    }

    // Check wheat
    if (wheatPct > 0 && wheatItems.length === 0) {
      result.isValid = false;
      result.issues.push(
        `Mash bill requires ${wheatPct}% wheat but no wheat items found`
      );
    }

    // Check malt
    if (maltPct > 0 && maltItems.length === 0) {
      result.isValid = false;
      result.issues.push(
        `Mash bill requires ${maltPct}% malt but no malt items found`
      );
    }

    // Check for water or backset
    const waterOrBackset = data.recipeBomItems.find(
      (item) =>
        item.name &&
        (item.name.toLowerCase().includes("water") ||
          item.name.toLowerCase().includes("backset"))
    );

    if (!waterOrBackset) {
      result.isValid = false;
      result.issues.push("Missing water or backset");
    }

    // Check for yeast
    const yeast = data.recipeBomItems.find(
      (item) =>
        item.itemGroup === "RM-YEA" ||
        (item.name && item.name.toLowerCase().includes("yeast"))
    );

    if (!yeast) {
      result.isValid = false;
      result.issues.push("Missing yeast (RM-YEA)");
    }

    return result;
  }

  /**
   * Calculate enzyme dosing amounts for a recipe BOM based on mash bill percentages
   * @param id The ID of the recipe BOM to calculate enzyme dosing for
   * @param totalGrainLbs The total grain weight in pounds
   * @returns Object containing enzyme calculations
   */
  async calculateEnzymeDosing(id: string, totalGrainLbs: number) {
    this.logger.log(
      `Calculating enzyme dosing for recipe BOM ${id} with total grain ${totalGrainLbs} lbs`
    );

    // Get the recipe BOM with its items
    const recipeBom = (await this.prisma.recipeBom.findUnique({
      where: { id },
      include: {
        recipe: true,
        recipeBomITem: {
          include: {
            item: true,
          },
        },
      },
    })) as RecipeBomWithRelations | null;

    if (!recipeBom) {
      throw new Error(`Recipe BOM with ID ${id} not found`);
    }

    // Get the mash bill from the recipe or from the BOM items
    const mashBill = this.extractMashBillFromRecipeBom(recipeBom);
    if (!mashBill) {
      throw new Error("Could not determine mash bill percentages");
    }

    // Identify enzyme items in the BOM
    const enzymeItems = recipeBom.recipeBomITem.filter(
      (item) =>
        item.item &&
        ((item.item.itemGroup &&
          typeof item.item.itemGroup === "string" &&
          item.item.itemGroup.toLowerCase().includes("enzyme")) ||
          (item.item.name &&
            typeof item.item.name === "string" &&
            item.item.name.toLowerCase().includes("enzyme")))
    );

    if (enzymeItems.length === 0) {
      this.logger.warn(`No enzyme items found in recipe BOM ${id}`);
      return { enzymeCalculations: [], mashBill };
    }

    // Calculate dosing for each enzyme
    const enzymeCalculations = [];
    for (const enzymeItem of enzymeItems) {
      try {
        if (!enzymeItem.item || !enzymeItem.item.name) {
          continue;
        }

        const enzymeName = String(enzymeItem.item.name);

        // Check if the existing quantity seems to be a valid unitless ratio
        // Enzyme ratios are typically very small numbers (< 0.01)
        const existingQuantity = enzymeItem.quantity || 0;
        const isExistingQuantityValidRatio =
          existingQuantity > 0 && existingQuantity < 0.01;

        if (isExistingQuantityValidRatio) {
          // Use the existing quantity as the ratio
          this.logger.log(
            `Using existing ratio ${existingQuantity} for enzyme ${enzymeName}`
          );

          enzymeCalculations.push({
            itemId: enzymeItem.item.id,
            name: enzymeName,
            doseLbs: existingQuantity * totalGrainLbs,
            doseRatio: existingQuantity,
            instructions: "Based on stored ratio",
            originalQuantity: existingQuantity,
            originalUnit: enzymeItem.unit || "LBS",
          });
          continue;
        }

        // Use normalized calculation that returns a unitless ratio
        // This ratio can be multiplied by the total grain weight to get the actual amount
        const normDosing =
          await this.enzymeDosingService.calculateNormalizedEnzymeDosing(
            mashBill,
            enzymeName
          );

        if (normDosing) {
          // Calculate actual dose in pounds by multiplying the ratio by total grain weight
          const doseLbs = normDosing.ratio * totalGrainLbs;

          enzymeCalculations.push({
            itemId: enzymeItem.item.id,
            name: enzymeName,
            doseLbs: doseLbs,
            doseRatio: normDosing.ratio, // Include the ratio for reference
            instructions: normDosing.instructions,
            originalQuantity: enzymeItem.quantity || 0,
            originalUnit: enzymeItem.unit || "LBS",
          });
        }
      } catch (error: any) {
        const itemName = enzymeItem.item?.name
          ? String(enzymeItem.item.name)
          : "unknown";
        this.logger.error(
          `Error calculating dosing for enzyme ${itemName}: ${error.message}`
        );
      }
    }

    return {
      recipeBomId: id,
      totalGrainLbs,
      mashBill,
      enzymeCalculations,
    };
  }

  /**
   * Extract mash bill percentages from a recipe BOM
   * Returns mash bill in format "70-21-00-09" (corn-rye-wheat-malt)
   */
  private extractMashBillFromRecipeBom(
    recipeBom: RecipeBomWithRelations
  ): string | null {
    // Check if recipe has mash bill directly
    if (recipeBom.recipe?.mashBill) {
      return recipeBom.recipe.mashBill;
    }

    // Otherwise try to calculate from BOM items
    const cornItem = recipeBom.recipeBomITem.find(
      (item) =>
        item.item?.name &&
        typeof item.item.name === "string" &&
        item.item.name.toLowerCase().includes("corn")
    );
    const ryeItem = recipeBom.recipeBomITem.find(
      (item) =>
        item.item?.name &&
        typeof item.item.name === "string" &&
        item.item.name.toLowerCase().includes("rye")
    );
    const wheatItem = recipeBom.recipeBomITem.find(
      (item) =>
        item.item?.name &&
        typeof item.item.name === "string" &&
        item.item.name.toLowerCase().includes("wheat")
    );
    const maltItem = recipeBom.recipeBomITem.find(
      (item) =>
        item.item?.name &&
        typeof item.item.name === "string" &&
        item.item.name.toLowerCase().includes("malt")
    );

    if (!cornItem && !ryeItem && !wheatItem && !maltItem) {
      return null;
    }

    // Calculate total grain weight for percentage calculation
    const totalWeight = recipeBom.recipeBomITem
      .filter(
        (item) =>
          item.item &&
          ["corn", "rye", "wheat", "malt"].some(
            (grain) =>
              item.item?.name &&
              typeof item.item.name === "string" &&
              item.item.name.toLowerCase().includes(grain)
          )
      )
      .reduce((sum, item) => sum + (item.quantity || 0), 0);

    if (totalWeight === 0) {
      return null;
    }

    // Calculate percentages
    const cornPct =
      cornItem && cornItem.quantity
        ? Math.round((cornItem.quantity / totalWeight) * 100)
        : 0;
    const ryePct =
      ryeItem && ryeItem.quantity
        ? Math.round((ryeItem.quantity / totalWeight) * 100)
        : 0;
    const wheatPct =
      wheatItem && wheatItem.quantity
        ? Math.round((wheatItem.quantity / totalWeight) * 100)
        : 0;
    const maltPct =
      maltItem && maltItem.quantity
        ? Math.round((maltItem.quantity / totalWeight) * 100)
        : 0;

    // Format as "70-21-00-09"
    return `${cornPct.toString().padStart(2, "0")}-${ryePct
      .toString()
      .padStart(2, "0")}-${wheatPct.toString().padStart(2, "0")}-${maltPct
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Override the delete method to handle cascading operations and maintain relationships
   * When a recipe BOM is deleted, we need to:
   * 1. Find all BOM items and handle their relationships with mashing protocol steps
   * 2. Then delete the BOM items
   * 3. Then delete the BOM itself
   */
  async deleteRecipeBom(args: any): Promise<PrismaRecipeBom> {
    this.logger.log(`Deleting recipe BOM with ID: ${args.where.id}`);

    // First, get the BOM with all its items and their connected mashing protocol steps
    const recipeBom = await this.prisma.recipeBom.findUnique({
      where: { id: args.where.id },
      include: {
        recipeBomITem: {
          include: {
            mashingProtocolSteps: true,
          },
        },
      },
    });

    if (!recipeBom) {
      this.logger.warn(`RecipeBom with ID ${args.where.id} not found`);
      return super.deleteRecipeBom(args);
    }

    // If there are BOM items, handle them before deletion
    if (recipeBom.recipeBomITem && recipeBom.recipeBomITem.length > 0) {
      this.logger.log(
        `Found ${recipeBom.recipeBomITem.length} BOM items in this recipe BOM, handling their relationships before deletion`
      );

      // Use a transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // For each BOM item, disconnect from all mashing protocol steps
        for (const bomItem of recipeBom.recipeBomITem) {
          if (
            bomItem.mashingProtocolSteps &&
            bomItem.mashingProtocolSteps.length > 0
          ) {
            this.logger.log(
              `Disconnecting BOM item ${bomItem.id} from ${bomItem.mashingProtocolSteps.length} mashing protocol steps`
            );

            // For each step, disconnect this BOM item
            for (const step of bomItem.mashingProtocolSteps) {
              await tx.mashingProtocolStep.update({
                where: { id: step.id },
                data: {
                  recipeBomItem: {
                    disconnect: { id: bomItem.id },
                  },
                },
              });
            }
          }
        }

        // Then delete all BOM items
        this.logger.log(
          `Deleting all BOM items for recipe BOM ${args.where.id}`
        );
        await tx.recipeBomItem.deleteMany({
          where: { recipeBomsId: args.where.id },
        });

        // Finally, delete the recipe BOM
        return tx.recipeBom.delete(args);
      });
    }

    // If no BOM items, proceed with the normal deletion
    return super.deleteRecipeBom(args);
  }

  /**
   * Override the update method to handle changes in relationships with recipes
   */
  async updateRecipeBom(args: any): Promise<PrismaRecipeBom> {
    this.logger.log(`Updating recipe BOM with ID: ${args.where.id}`);

    // Check if update involves disconnecting from recipes
    const disconnectingFromRecipe =
      args.data && args.data.recipe && args.data.recipe.disconnect;

    if (disconnectingFromRecipe) {
      this.logger.log(
        `Recipe BOM is being disconnected from recipe, checking for mashing protocol step relationships`
      );

      return await this.prisma.$transaction(async (tx) => {
        // Get the BOM with all its items and their connected mashing protocol steps
        const recipeBom = await tx.recipeBom.findUnique({
          where: { id: args.where.id },
          include: {
            recipeBomITem: {
              include: {
                mashingProtocolSteps: {
                  include: {
                    mashingProtocol: {
                      include: {
                        recipes: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (recipeBom && recipeBom.recipeBomITem) {
          // For each BOM item with mashing protocol steps
          for (const bomItem of recipeBom.recipeBomITem) {
            if (
              bomItem.mashingProtocolSteps &&
              bomItem.mashingProtocolSteps.length > 0
            ) {
              // Determine which recipe IDs are being disconnected
              let disconnectingRecipeIds: string[] = [];

              if (Array.isArray(disconnectingFromRecipe)) {
                disconnectingRecipeIds = disconnectingFromRecipe.map(
                  (r: any) => r.id
                );
              } else if (
                typeof disconnectingFromRecipe === "object" &&
                disconnectingFromRecipe.id
              ) {
                disconnectingRecipeIds = [disconnectingFromRecipe.id];
              }

              // For each step, check if its protocol is connected to a recipe that's being disconnected
              for (const step of bomItem.mashingProtocolSteps) {
                const protocol = step.mashingProtocol;

                if (protocol && protocol.recipes) {
                  // If the protocol is only connected to recipes that are being disconnected from this BOM,
                  // then disconnect the BOM item from the step
                  const shouldDisconnect = protocol.recipes.every((recipe) =>
                    disconnectingRecipeIds.includes(recipe.id)
                  );

                  if (shouldDisconnect) {
                    this.logger.log(
                      `Disconnecting BOM item ${bomItem.id} from mashing protocol step ${step.id}`
                    );

                    await tx.mashingProtocolStep.update({
                      where: { id: step.id },
                      data: {
                        recipeBomItem: {
                          disconnect: { id: bomItem.id },
                        },
                      },
                    });
                  }
                }
              }
            }
          }
        }

        // Then proceed with the update
        return tx.recipeBom.update(args);
      });
    }

    // For other updates, proceed normally
    return super.updateRecipeBom(args);
  }
}
