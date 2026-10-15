import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeServiceBase } from "./base/recipe.service.base";
import { Prisma } from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import {
  CreateMasterRecipeInput,
  UpdateMasterRecipeInput,
  MasterRecipeResponse,
  MashBillComposition,
} from "./dto/master-recipe-input.dto";
import { EnumMashingProtocolStepHoldType } from "../mashingProtocolStep/base/EnumMashingProtocolStepHoldType";
import { EnumMashingProtocolStepStepType } from "../mashingProtocolStep/base/EnumMashingProtocolStepStepType";
import { EnzymeDosingService } from "./enzyme.dosing";
import { MashBillParser } from "./mashbill-parser";
import * as common from "@nestjs/common";

// Regex to match revision suffix: -v or -R followed by digits at end of string
const REVISION_SUFFIX_REGEX = /-[Rv](\d+)$/;

/**
 * Extract base recipe name by removing -v##/-R## suffix
 */
function extractBaseRecipeName(recipeName: string): string {
  return recipeName.replace(REVISION_SUFFIX_REGEX, "");
}

/**
 * Extract revision number from recipe name
 */
function extractRevisionNumber(recipeName: string): number {
  const match = recipeName.match(REVISION_SUFFIX_REGEX);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1; // Default to 1 if no revision suffix found
}

// DTOs for enzyme dosing business logic
export interface NormalizedEnzymeDosingResult {
  recipeId: string;
  recipeName: string;
  enzymeItemId: string;
  enzymeName: string;
  enzymeCategory: string;
  normalizedDoseRatio: number;
  instructions: string;
  mashBill: string;
  calculatedAt: string;
}

export interface RecipeEnzymeDosingResult {
  recipeId: string;
  recipeName: string;
  mashBill: string;
  enzymeResults: NormalizedEnzymeDosingResult[];
  calculatedAt: string;
}

@Injectable()
export class RecipeService extends RecipeServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    private rabbitProducer: RabbitMQProducerService,
    private readonly enzymeDosingService: EnzymeDosingService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  async createRecipe<T extends Prisma.RecipeCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.RecipeCreateArgs>
  ): Promise<import(".prisma/client").Recipe> {
    const recipe = await super.createRecipe({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        customer: true,
        recipeGroup: true,
        recipeBoms: true,
        unitProcedures: true,
        productionOrders: true,
      },
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "create",
        data: recipe,
      }
    );
    this.logger.log(`Created Recipe: ${recipe.id} & pushed to topic`);
    return recipe;
  }

  async updateRecipe<T extends Prisma.RecipeUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.RecipeUpdateArgs>
  ): Promise<import(".prisma/client").Recipe> {
    const recipe = await super.updateRecipe({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        customer: true,
        recipeGroup: true,
        recipeBoms: true,
        unitProcedures: true,
        productionOrders: true,
      },
      where: args.where,
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "update",
        data: recipe,
      }
    );
    this.logger.log(`Updated Recipe: ${recipe.id} & pushed to topic`);
    return recipe;
  }

  /**
   * Retrieves active recipes from the database.
   *
   * This method fetches recipes that are associated with active production orders.
   * It joins the Recipe table with ProductionOrder, ScheduleOrder, and ScheduleOrderQueue tables
   * to get the relevant information.
   *
   * @author: Patrick Mannion
   * @date: 2024-10-07
   * @returns {Promise<any[]>} A promise that resolves to an array of active recipe objects.
   * Each object contains recipe details along with the creation date from ScheduleOrderQueue.
   *
   * @throws {Error} If there's an issue with the database query or connection.
   */
  async getActiveRecipes() {
    const query = `
      SELECT
          soq."createdAt" as ScheduledAt,
          pro.name as ProductionOrderNumber,
          pro.id as ProductionOrderId,
          r. *,
          i."itemNumber"
      FROM "Recipe" r
      JOIN public."ProductionOrder" PO on r.id = PO."recipeId"
      JOIN public."ScheduleOrder" SO on PO."scheduleOrderId" = SO.id
      JOIN public."ScheduleOrderQueue" SOQ on SO."scheduleOrderQueueId" = SOQ.id
      JOIN public."ProductionOrder" pro on pro."scheduleOrderId" = so.id
      JOIN public."Item" i on pro."fgItemId" = i.id
      WHERE SoQ."queueIndex" <= 0
      ORDER BY SoQ."createdAt"`;
    const recipes = await this.prisma.$queryRaw<any>(Prisma.sql([query]));
    return recipes;
  }

  /**
   * Generates a recipe BOM with specified enzymes and yeast
   *
   * This method creates a recipe BOM with grain percentages from the mash bill,
   * enzymes (saccharification, liquifaction, viscosity), and yeast specifications.
   *
   * @param recipeString Recipe string in the format "CUS-70-20-00-10-v01"
   * @param saccharificationEnzymeId Selected saccharification enzyme item ID
   * @param liquifactionEnzymeId Selected liquifaction enzyme item ID
   * @param viscosityEnzymeId Selected viscosity enzyme item ID
   * @param yeastItemId Item ID of the selected yeast
   * @param yeastPoundsPerFermenter Pounds of yeast per fermenter
   * @param username Creator username
   * @param totalGrainWeight Optional total grain weight for enzyme calculations
   * @returns The created recipe BOM with items
   */
  async generateRecipeBom(
    recipeString: string,
    saccharificationEnzymeId: string,
    liquifactionEnzymeId: string,
    viscosityEnzymeId: string,
    yeastItemId: string,
    yeastPoundsPerFermenter: number,
    username: string,
    totalGrainWeight?: number
  ): Promise<any> {
    // Default total grain weight if not provided (for enzyme ratio calculations)
    const defaultGrainWeight = totalGrainWeight || 10000; // 10,000 lbs as default

    // Parse recipe string format CUS-70-20-00-10-v01
    // Extract the mash bill part (70-20-00-10)
    const parts = recipeString.split("-");

    if (parts.length < 5) {
      throw new Error(
        "Invalid recipe string format. Expected format: CUS-70-20-00-10-v01"
      );
    }

    // The mash bill is the middle four numbers
    const mashBill = `${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}`;

    // Parse mash bill
    const [corn, rye, wheat, malt] = mashBill
      .split("-")
      .map((part) => parseInt(part, 10) / 100);

    // Generate a unique revision ID for the BOM
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const bomRevision = `BOM-${parts[0]}-${mashBill}-${timestamp}`;

    // Validate item IDs exist and fetch their units
    const saccharificationEnzymeItem = await this.prisma.item.findUnique({
      where: { id: saccharificationEnzymeId },
      include: { units: true },
    });

    if (!saccharificationEnzymeItem) {
      throw new Error(
        `Saccharification enzyme with ID ${saccharificationEnzymeId} not found`
      );
    }

    const liquifactionEnzymeItem = await this.prisma.item.findUnique({
      where: { id: liquifactionEnzymeId },
      include: { units: true },
    });

    if (!liquifactionEnzymeItem) {
      throw new Error(
        `Liquifaction enzyme with ID ${liquifactionEnzymeId} not found`
      );
    }

    const viscosityEnzymeItem = await this.prisma.item.findUnique({
      where: { id: viscosityEnzymeId },
      include: { units: true },
    });

    if (!viscosityEnzymeItem) {
      throw new Error(
        `Viscosity enzyme with ID ${viscosityEnzymeId} not found`
      );
    }

    const yeastItem = await this.prisma.item.findUnique({
      where: { id: yeastItemId },
      include: { units: true },
    });

    if (!yeastItem) {
      throw new Error(`Yeast item with ID ${yeastItemId} not found`);
    }

    // Find grain items with their units
    const cornItem = await this.prisma.item.findFirst({
      where: { itemNumber: { contains: "corn", mode: "insensitive" } },
      include: { units: true },
    });

    const ryeItem = await this.prisma.item.findFirst({
      where: { itemNumber: { contains: "rye", mode: "insensitive" } },
      include: { units: true },
    });

    const wheatItem = await this.prisma.item.findFirst({
      where: { itemNumber: { contains: "wheat", mode: "insensitive" } },
      include: { units: true },
    });

    const maltItem = await this.prisma.item.findFirst({
      where: { itemNumber: { contains: "malt", mode: "insensitive" } },
      include: { units: true },
    });

    // Find default units if needed
    const percentUnit = await this.findOrCreatePercentUnit(username);
    const lbsUnit = await this.findOrCreatePoundUnit(username);

    // Create the recipe BOM
    const recipeBom = await this.prisma.recipeBom.create({
      data: {
        revision: bomRevision,
        master: true,
        running: true,
      },
    });

    // Array to hold BOM item creation promises
    const bomItemCreationPromises = [];

    // Add grain BOM items
    if (corn > 0 && cornItem) {
      bomItemCreationPromises.push(
        this.prisma.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: cornItem.id } },
            quantity: corn, // Use the percentage directly
            createdBy: username,
            isClassDefinition: true,
            operation: "Mashing01",
            displayUnits: {
              connect: { id: cornItem.units?.id || percentUnit.id },
            }, // Link to display units (percent)
          },
        })
      );
    }

    if (rye > 0 && ryeItem) {
      bomItemCreationPromises.push(
        this.prisma.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: ryeItem.id } },
            quantity: rye, // Use the percentage directly
            createdBy: username,
            isClassDefinition: true,
            operation: "Mashing01",
            displayUnits: {
              connect: { id: ryeItem.units?.id || percentUnit.id },
            }, // Link to display units (percent)
          },
        })
      );
    }

    if (wheat > 0 && wheatItem) {
      bomItemCreationPromises.push(
        this.prisma.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: wheatItem.id } },
            quantity: wheat, // Use the percentage directly
            createdBy: username,
            isClassDefinition: true,
            operation: "Mashing01",
            displayUnits: {
              connect: { id: wheatItem.units?.id || percentUnit.id },
            }, // Link to display units (percent)
          },
        })
      );
    }

    if (malt > 0 && maltItem) {
      bomItemCreationPromises.push(
        this.prisma.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: maltItem.id } },
            quantity: malt, // Use the percentage directly
            createdBy: username,
            isClassDefinition: true,
            operation: "Mashing01",
            displayUnits: {
              connect: { id: maltItem.units?.id || percentUnit.id },
            }, // Link to display units (percent)
          },
        })
      );
    }

    // Add enzyme BOM items with calculated dosages
    const saccharificationEnzymeDosage = this.calculateEnzymeDosage(
      saccharificationEnzymeItem.itemName ||
        saccharificationEnzymeItem.itemNumber,
      defaultGrainWeight,
      mashBill
    );

    bomItemCreationPromises.push(
      this.prisma.recipeBomItem.create({
        data: {
          recipeBoms: { connect: { id: recipeBom.id } },
          item: { connect: { id: saccharificationEnzymeId } },
          quantity: saccharificationEnzymeDosage, // Use the calculated dosage ratio
          createdBy: username,
          isClassDefinition: true,
          operation: "Mashing01",
          displayUnits: {
            connect: { id: saccharificationEnzymeItem.units?.id || lbsUnit.id },
          }, // Link to display units (lbs/lb grain)
        },
      })
    );

    const liquifactionEnzymeDosage = this.calculateEnzymeDosage(
      liquifactionEnzymeItem.itemName || liquifactionEnzymeItem.itemNumber,
      defaultGrainWeight,
      mashBill
    );

    bomItemCreationPromises.push(
      this.prisma.recipeBomItem.create({
        data: {
          recipeBoms: { connect: { id: recipeBom.id } },
          item: { connect: { id: liquifactionEnzymeId } },
          quantity: liquifactionEnzymeDosage, // Use the calculated dosage ratio
          createdBy: username,
          isClassDefinition: true,
          operation: "Mashing01",
          displayUnits: {
            connect: { id: liquifactionEnzymeItem.units?.id || lbsUnit.id },
          }, // Link to display units (lbs/lb grain)
        },
      })
    );

    const viscosityEnzymeDosage = this.calculateEnzymeDosage(
      viscosityEnzymeItem.itemName || viscosityEnzymeItem.itemNumber,
      defaultGrainWeight,
      mashBill
    );

    bomItemCreationPromises.push(
      this.prisma.recipeBomItem.create({
        data: {
          recipeBoms: { connect: { id: recipeBom.id } },
          item: { connect: { id: viscosityEnzymeId } },
          quantity: viscosityEnzymeDosage, // Use the calculated dosage ratio
          createdBy: username,
          isClassDefinition: true,
          operation: "Mashing01",
          displayUnits: {
            connect: { id: viscosityEnzymeItem.units?.id || lbsUnit.id },
          }, // Link to display units (lbs/lb grain)
        },
      })
    );

    // Add yeast BOM item
    bomItemCreationPromises.push(
      this.prisma.recipeBomItem.create({
        data: {
          recipeBoms: { connect: { id: recipeBom.id } },
          item: { connect: { id: yeastItemId } },
          quantity: yeastPoundsPerFermenter,
          createdBy: username,
          isClassDefinition: true,
          operation: "Fermentation01", // Note different operation for yeast
          displayUnits: { connect: { id: yeastItem.units?.id || lbsUnit.id } }, // Link to display units (lbs)
        },
      })
    );

    // Create all BOM items in parallel
    await Promise.all(bomItemCreationPromises);

    // Fetch the complete BOM with all items
    const completeBom = await this.prisma.recipeBom.findUnique({
      where: { id: recipeBom.id },
      include: {
        recipeBomITem: {
          include: {
            item: true,
            displayUnits: true, // Include the display units in response
          },
        },
      },
    });

    return completeBom;
  }

  /**
   * Calculate enzyme dosage ratio based on total grain weight and mash bill composition
   *
   * @param enzymeName Name of the enzyme
   * @param totalGrainWeightLbs Total grain weight in pounds
   * @param mashBill Mash bill string in format "70-20-00-10" (corn-rye-wheat-malt)
   * @returns Enzyme dosage ratio (lbs enzyme / lbs grain)
   */
  private calculateEnzymeDosage(
    enzymeName: string,
    totalGrainWeightLbs: number,
    mashBill: string
  ): number {
    // Parse mash bill percentages
    const [cornPct, ryePct, wheatPct, maltPct] = mashBill
      .split("-")
      .map((part) => parseInt(part, 10));

    // Base dosages per lb of grain
    const baseDosages: { [key: string]: number } = {
      Termamyl: 0.00006, // 0.13 lbs per metric ton
      Liquozyme: 0.00008, // 0.185 lbs per metric ton
      Amylex: 0.00011, // 0.25 lbs per metric ton
      Alphalase: 0.00045, // 1.0 lbs per metric ton
      Saczyme: 0.00027, // 0.6 lbs per metric ton
      Diazyme: 0.00036, // 0.8 lbs per metric ton (using Diazyme SSF2)
      Viscoferm: 0.00005, // 0.1 lbs per metric ton
      Laminex: 0.00005, // 0.1 lbs per metric ton
    };

    // Normalize the enzyme name to find in our map
    const normalizedName = this.getNormalizedEnzymeName(enzymeName);
    const baseDosage = baseDosages[normalizedName] || 0.0001;

    // Different grain types require different enzyme adjustments
    // These multipliers adjust dosage based on grain composition
    let dosageMultiplier = 1.0;

    // Apply grain-specific adjustments

    // Saccharification enzymes (e.g., Diazyme, Saczyme)
    if (normalizedName === "diazyme" || normalizedName === "saczyme") {
      // Higher malt percentage means less enzyme needed (malt has natural enzymes)
      if (maltPct > 15) {
        dosageMultiplier *= 0.85; // Reduce by 15% for high malt content
      }

      // Higher corn means more saccharification enzyme
      if (cornPct > 70) {
        dosageMultiplier *= 1.2; // Increase by 20% for high corn content
      }
    }

    // Liquefaction enzymes (e.g., Liquozyme, Termamyl)
    else if (normalizedName === "liquozyme" || normalizedName === "termamyl") {
      // Higher rye percentages require more liquefaction enzyme
      if (ryePct > 25) {
        dosageMultiplier *= 1.25; // Increase by 25% for high rye content
      }

      // Wheat also impacts liquefaction requirements
      if (wheatPct > 20) {
        dosageMultiplier *= 1.15; // Increase by 15% for significant wheat content
      }
    }

    // Viscosity-reducing enzymes (e.g., Viscoferm, Laminex)
    else if (normalizedName === "viscoferm" || normalizedName === "laminex") {
      // High rye or wheat content significantly impacts viscosity
      if (ryePct + wheatPct > 30) {
        dosageMultiplier *= 1.5; // Increase by 50% for high rye+wheat content
      } else if (ryePct > 20) {
        dosageMultiplier *= 1.3; // Increase by 30% for moderately high rye
      }
    }

    // Calculate final dosage per pound
    return baseDosage * dosageMultiplier;
  }

  /**
   * Gets the normalized name for an enzyme to use in database queries and calculations
   */
  private getNormalizedEnzymeName(enzymeName: string): string {
    // Extract just the name part from item numbers or descriptions
    const name = enzymeName.toLowerCase().split(/[\s-]+/)[0];

    const nameMap: { [key: string]: string } = {
      termamyl: "termamyl",
      liquozyme: "liquozyme",
      amylex: "amylex",
      alphalase: "alphalase",
      saczyme: "saczyme",
      diazyme: "diazyme",
      viscoferm: "viscoferm",
      laminex: "laminex",
    };

    return nameMap[name] || name;
  }

  /**
   * Find or create a percent unit for display
   */
  private async findOrCreatePercentUnit(username: string) {
    // First try to find an existing percent unit
    let percentUnit = await this.prisma.units.findFirst({
      where: {
        OR: [
          { name: { equals: "Percent", mode: "insensitive" } },
          { abbreviation: { equals: "%", mode: "insensitive" } },
        ],
      },
    });

    // If not found, create it
    if (!percentUnit) {
      percentUnit = await this.prisma.units.create({
        data: {
          name: "Percent",
          abbreviation: "%",
          createdBy: username,
          archived: false, // Using archived instead of archive
        },
      });

      this.logger.log(`Created percent unit: ${percentUnit.id}`);
    }

    return percentUnit;
  }

  /**
   * Find or create a pound unit for display
   */
  private async findOrCreatePoundUnit(username: string) {
    // First try to find an existing pound unit
    let poundUnit = await this.prisma.units.findFirst({
      where: {
        OR: [
          { name: { equals: "Pound", mode: "insensitive" } },
          { abbreviation: { equals: "lb", mode: "insensitive" } },
        ],
      },
    });

    // If not found, create it
    if (!poundUnit) {
      poundUnit = await this.prisma.units.create({
        data: {
          name: "Pound",
          abbreviation: "lb",
          createdBy: username,
          archived: false, // Using archived instead of archive
        },
      });

      this.logger.log(`Created pound unit: ${poundUnit.id}`);
    }

    return poundUnit;
  }

  /**
   * Create a new master recipe from frontend wizard data
   * This method handles the complete recipe creation including BOM, parameters, and mashing protocol
   */
  async createMasterRecipe(
    input: CreateMasterRecipeInput
  ): Promise<MasterRecipeResponse> {
    try {
      // Start a transaction to ensure data consistency
      return await this.prisma.$transaction(async (prisma) => {
        // 1. Find or create customer
        let customer = await prisma.customer.findFirst({
          where: { customerCode: input.customerCode },
        });

        if (!customer) {
          // Create customer if not exists
          customer = await prisma.customer.create({
            data: {
              customerCode: input.customerCode,
              name: input.customerCode, // Use code as name for now
              address: "", // Required field - empty for now
              createdBy: input.createdBy,
            },
          });
        }

        // 2. Extract mash bill from recipe name and find or create recipe group
        const mashBill = this.extractMashBillFromRecipeName(input.Recipe);
        let recipeGroup: any = null;

        if (mashBill) {
          // Try to find existing recipe group for this mash bill
          recipeGroup = await prisma.recipeGroup.findFirst({
            where: { recipe: mashBill },
          });

          if (!recipeGroup) {
            // Create new recipe group for this mash bill
            recipeGroup = await prisma.recipeGroup.create({
              data: {
                recipe: mashBill, // Store mash bill as the recipe group identifier
                revision: 1,
                createdBy: input.createdBy,
              },
            });
            this.logger.log(
              `Created new recipe group for mash bill: ${mashBill}`
            );
          } else {
            this.logger.log(
              `Found existing recipe group for mash bill: ${mashBill}`
            );
          }
        } else {
          this.logger.warn(
            `Could not extract mash bill from recipe name: ${input.Recipe}`
          );
        }

        // 3. Create the main recipe with baseRecipeName for revision tracking
        const baseRecipeName = extractBaseRecipeName(input.Recipe);
        const parsedRevision = extractRevisionNumber(input.Recipe);

        const recipe = await prisma.recipe.create({
          data: {
            Recipe: input.Recipe,
            baseRecipeName: baseRecipeName,
            active: input.active ?? true,
            whiskeyType: input.whiskeyType as any, // Cast to enum
            revision: parsedRevision,
            customerCode: input.customerCode,
            cooksPerFerm: input.cooksPerFerm,
            createdBy: input.createdBy,
            customer: {
              connect: { id: customer.id },
            },
            // Link to recipe group if we found/created one
            ...(recipeGroup && {
              recipeGroup: {
                connect: { id: recipeGroup.id },
              },
            }),
            // Note: Mash bill data will be stored in recipe name format or as separate records
            // The Recipe model doesn't have individual corn/rye/wheat/maltedBarley fields
          },
        });

        // Log the recipe group association
        if (recipeGroup) {
          this.logger.log(
            `Linked recipe ${recipe.Recipe} to recipe group ${recipeGroup.id} for mash bill ${mashBill}`
          );
        }

        // 4. Create recipe parameters
        for (const param of input.parameters) {
          await prisma.recipeParameter.create({
            data: {
              recipeParamName: param.name,
              recipeParamDescription: param.description || param.name,
              recipeNumericalSetpoint:
                typeof param.value === "number" ? param.value : null,
              recipeSetpointBooleanValue:
                typeof param.value === "boolean" ? param.value : null,
              recipeSetpointType:
                typeof param.value === "number"
                  ? "Numeric"
                  : typeof param.value === "boolean"
                  ? "Boolean"
                  : "Text",
              className: "MasterRecipe",
              active: true,
              recipe: {
                connect: { id: recipe.id },
              },
              createdBy: input.createdBy,
            },
          });
        }

        // 5. Create mashing protocol and steps
        const mashingProtocol = await prisma.mashingProtocol.create({
          data: {
            name: `${input.Recipe} Mashing Protocol Rev${input.revision || 1}`,
            createdBy: input.createdBy,
            recipes: {
              connect: { id: recipe.id },
            },
          },
        });

        // Create mashing protocol steps
        for (const step of input.mashingSteps) {
          await prisma.mashingProtocolStep.create({
            data: {
              index: step.index,
              stepType: this.mapStepTypeToEnum(step.stepType),
              holdType: this.mapHoldTypeToEnum(step.holdType),
              heatTempSp: step.heatTempSp,
              coolTempSp: step.coolTempSp,
              stepTime: step.timeDuration,
              promptMessage: step.notes,
              mashingProtocol: {
                connect: { id: mashingProtocol.id },
              },
              createdBy: input.createdBy,
            },
          });
        }

        // 6. Create recipe BOM
        const recipeBom = await prisma.recipeBom.create({
          data: {
            revision: input.revision,
            recipe: {
              connect: { id: recipe.id },
            },
          },
        });

        // Create BOM items
        for (const ingredient of input.ingredients) {
          // Find the item by itemCode
          const item = await prisma.item.findFirst({
            where: { itemNumber: ingredient.itemCode },
          });

          if (item) {
            // Find or create a default unit for the ingredient
            let displayUnit = await prisma.units.findFirst({
              where: { abbreviation: ingredient.unit },
            });

            if (!displayUnit) {
              // Create a basic unit if it doesn't exist
              displayUnit = await prisma.units.create({
                data: {
                  name: ingredient.unit,
                  abbreviation: ingredient.unit,
                  createdBy: input.createdBy,
                },
              });
            }

            await prisma.recipeBomItem.create({
              data: {
                quantity: ingredient.quantity,
                operation: this.mapCategoryToOperation(ingredient.category),
                displayUnits: {
                  connect: { id: displayUnit.id },
                },
                recipeBoms: {
                  connect: { id: recipeBom.id },
                },
                item: {
                  connect: { id: item.id },
                },
                createdBy: input.createdBy,
              },
            });
          }
        }

        // Return the created recipe with basic info
        return {
          id: recipe.id,
          Recipe: recipe.Recipe,
          revision: recipe.revision ?? 0,
          active: recipe.active ?? true,
          whiskeyType: recipe.whiskeyType?.toString() || input.whiskeyType,
          createdAt: recipe.createdAt.toISOString(),
          createdBy: recipe.createdBy,
        };
      });
    } catch (error) {
      console.error("Error creating master recipe:", error);
      throw new Error(
        `Failed to create master recipe: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Update an existing master recipe with revision increment
   * This creates a new revision of the recipe with updated data
   */
  async updateMasterRecipe(
    id: string,
    input: UpdateMasterRecipeInput
  ): Promise<MasterRecipeResponse> {
    try {
      // Increased timeout to 30s to accommodate audit logging for multiple entities
      return await this.prisma.$transaction(
        async (prisma) => {
          // 1. Get the existing recipe with all related data
          const existingRecipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
              customer: true,
              recipeBoms: {
                include: {
                  recipeBomITem: {
                    include: {
                      item: true,
                      mashingProtocolSteps: true, // Include linked mashing steps for revision copy
                    },
                  },
                },
              },
              parameters: true,
              mashingProtocol: {
                include: {
                  steps: true,
                },
              },
            },
          });

          if (!existingRecipe) {
            throw new Error("Recipe not found");
          }

          // 1.5. Validate that recipe identity fields (customer code, mash bill) haven't changed
          // Changing these fields requires creating a new recipe family, not a revision
          this.validateRecipeIdentityUnchanged(existingRecipe, input);

          // 2. Calculate new revision
          const currentRevision = existingRecipe.revision ?? 0;
          const newRevision = currentRevision + 1;

          // 3. Generate new recipe name with incremented revision
          const currentName = existingRecipe.Recipe;
          const newRecipeName = this.incrementRecipeRevision(
            currentName,
            newRevision
          );

          // 4. Extract mash bill from new recipe name and find or create recipe group
          const mashBill = this.extractMashBillFromRecipeName(newRecipeName);
          let recipeGroup: any = null;

          if (mashBill) {
            // Try to find existing recipe group for this mash bill
            recipeGroup = await prisma.recipeGroup.findFirst({
              where: { recipe: mashBill },
            });

            if (!recipeGroup) {
              // Create new recipe group for this mash bill
              recipeGroup = await prisma.recipeGroup.create({
                data: {
                  recipe: mashBill, // Store mash bill as the recipe group identifier
                  revision: 1,
                  createdBy: input.updatedBy,
                },
              });
              this.logger.log(
                `Created new recipe group for mash bill: ${mashBill} during recipe update`
              );
            } else {
              this.logger.log(
                `Found existing recipe group for mash bill: ${mashBill} during recipe update`
              );
            }
          } else {
            this.logger.warn(
              `Could not extract mash bill from updated recipe name: ${newRecipeName}`
            );
          }

          // 5. Create new recipe with updated data, linking to parent for revision chain
          const baseRecipeName = extractBaseRecipeName(newRecipeName);

          const newRecipe = await prisma.recipe.create({
            data: {
              Recipe: newRecipeName,
              baseRecipeName: baseRecipeName,
              parentRecipe: {
                connect: { id: existingRecipe.id }, // Link to parent for revision chain
              },
              active: input.active ?? existingRecipe.active ?? true,
              whiskeyType:
                (input.whiskeyType as any) || existingRecipe.whiskeyType,
              revision: newRevision,
              customerCode: input.customerCode || existingRecipe.customerCode,
              cooksPerFerm: input.cooksPerFerm ?? existingRecipe.cooksPerFerm,
              createdBy: existingRecipe.createdBy,
              updatedBy: input.updatedBy,
              customer: {
                connect: { id: existingRecipe.customerId },
              },
              // Link to recipe group if we found/created one
              ...(recipeGroup && {
                recipeGroup: {
                  connect: { id: recipeGroup.id },
                },
              }),
            },
          });

          // Log the recipe group association
          if (recipeGroup) {
            this.logger.log(
              `Linked updated recipe ${newRecipe.Recipe} to recipe group ${recipeGroup.id} for mash bill ${mashBill}`
            );
          }

          // 6. Handle recipe parameters - run in parallel for performance
          if (input.parameters && input.parameters.length > 0) {
            // Create new parameters in parallel
            await Promise.all(
              input.parameters.map((param) =>
                prisma.recipeParameter.create({
                  data: {
                    recipeParamName: param.name,
                    recipeParamDescription: param.description || param.name,
                    recipeNumericalSetpoint:
                      typeof param.value === "number" ? param.value : null,
                    recipeSetpointBooleanValue:
                      typeof param.value === "boolean" ? param.value : null,
                    recipeSetpointType:
                      typeof param.value === "number"
                        ? "Numeric"
                        : typeof param.value === "boolean"
                        ? "Boolean"
                        : "Text",
                    className: "MasterRecipe",
                    active: true,
                    recipe: {
                      connect: { id: newRecipe.id },
                    },
                    createdBy: input.updatedBy,
                  },
                })
              )
            );
          } else if (existingRecipe.parameters.length > 0) {
            // Copy existing parameters in parallel
            await Promise.all(
              existingRecipe.parameters.map((param) =>
                prisma.recipeParameter.create({
                  data: {
                    recipeParamName: param.recipeParamName,
                    recipeParamDescription: param.recipeParamDescription,
                    recipeNumericalSetpoint: param.recipeNumericalSetpoint,
                    recipeSetpointBooleanValue:
                      param.recipeSetpointBooleanValue,
                    recipeSetpointType: param.recipeSetpointType,
                    className: param.className,
                    active: param.active,
                    recipe: {
                      connect: { id: newRecipe.id },
                    },
                    createdBy: input.updatedBy,
                  },
                })
              )
            );
          }

          // 7. Handle mashing protocol
          // Track mapping of old step IDs to new step IDs for preserving BOM linkages
          let stepIdMapping: Map<string, string> | null = null;

          if (input.mashingSteps) {
            // Create new mashing protocol with unique name including revision
            const mashingProtocolName = `${newRecipe.Recipe} Mashing Protocol Rev${newRevision}`;
            const newMashingProtocol = await prisma.mashingProtocol.create({
              data: {
                name: mashingProtocolName,
                createdBy: input.updatedBy,
                recipes: {
                  connect: { id: newRecipe.id },
                },
              },
            });

            // Create mashing protocol steps individually to track old→new ID mapping for BOM linkages
            // This allows preserving the many-to-many relationship between RecipeBomItem and MashingProtocolStep
            if (input.mashingSteps.length > 0) {
              stepIdMapping = new Map<string, string>();
              for (const step of input.mashingSteps) {
                const newStep = await prisma.mashingProtocolStep.create({
                  data: {
                    index: step.index,
                    stepType: this.mapStepTypeToEnum(step.stepType),
                    holdType: this.mapHoldTypeToEnum(step.holdType),
                    heatTempSp: step.heatTempSp,
                    coolTempSp: step.coolTempSp,
                    stepTime: step.timeDuration,
                    promptMessage: step.notes,
                    mashingProtocolId: newMashingProtocol.id,
                    createdBy: input.updatedBy,
                  },
                });
                // Map old step ID (from input) to new step ID for BOM linkage preservation
                if (step.id) {
                  stepIdMapping.set(step.id, newStep.id);
                }
              }
            }
          } else if (existingRecipe.mashingProtocol) {
            // Copy existing mashing protocol with unique name including revision
            const existingProtocol = existingRecipe.mashingProtocol;
            const mashingProtocolName = `${newRecipe.Recipe} Mashing Protocol Rev${newRevision}`;
            const newMashingProtocol = await prisma.mashingProtocol.create({
              data: {
                name: mashingProtocolName,
                createdBy: existingProtocol.createdBy,
                recipes: {
                  connect: { id: newRecipe.id },
                },
              },
            });

            // Copy existing steps individually to track old→new ID mapping for BOM linkage
            // Using individual creates instead of createMany to get new IDs
            stepIdMapping = new Map<string, string>();
            for (const step of existingProtocol.steps) {
              const newStep = await prisma.mashingProtocolStep.create({
                data: {
                  index: step.index,
                  stepType: step.stepType,
                  holdType: step.holdType,
                  heatTempSp: step.heatTempSp,
                  coolTempSp: step.coolTempSp,
                  stepTime: step.stepTime,
                  promptMessage: step.promptMessage,
                  mashingProtocolId: newMashingProtocol.id,
                  createdBy: input.updatedBy,
                },
              });
              stepIdMapping.set(step.id, newStep.id);
            }
          }

          // 8. Handle recipe BOM
          const newRecipeBom = await prisma.recipeBom.create({
            data: {
              revision: newRevision.toString(),
              recipe: {
                connect: { id: newRecipe.id },
              },
            },
          });

          if (input.ingredients) {
            // Create new BOM items
            for (const ingredient of input.ingredients) {
              const item = await prisma.item.findFirst({
                where: { itemNumber: ingredient.itemCode },
              });

              if (item) {
                // Find or create a default unit for the ingredient
                let displayUnit = await prisma.units.findFirst({
                  where: { abbreviation: ingredient.unit },
                });

                if (!displayUnit) {
                  // Create a basic unit if it doesn't exist
                  displayUnit = await prisma.units.create({
                    data: {
                      name: ingredient.unit,
                      abbreviation: ingredient.unit,
                      createdBy: input.updatedBy,
                    },
                  });
                }

                // Build create data with formula configuration fields
                const createData: any = {
                  quantity: ingredient.quantity,
                  operation:
                    ingredient.operation ||
                    this.mapCategoryToOperation(ingredient.category),
                  displayUnits: {
                    connect: { id: displayUnit.id },
                  },
                  recipeBoms: {
                    connect: { id: newRecipeBom.id },
                  },
                  item: {
                    connect: { id: item.id },
                  },
                  createdBy: input.updatedBy,
                };

                // Add formula configuration fields (only if set)
                if (ingredient.calculationMode)
                  createData.calculationMode = ingredient.calculationMode;
                if (ingredient.formulaType)
                  createData.formulaType = ingredient.formulaType;
                if (ingredient.formulaMultiplier != null)
                  createData.formulaMultiplier = ingredient.formulaMultiplier;
                if (ingredient.customExpression)
                  createData.customExpression = ingredient.customExpression;
                if (ingredient.formulaLibraryId)
                  createData.formulaLibraryId = ingredient.formulaLibraryId;
                if (ingredient.expressionVariables)
                  createData.expressionVariables =
                    ingredient.expressionVariables;
                if (ingredient.expressionValidated != null)
                  createData.expressionValidated =
                    ingredient.expressionValidated;

                await prisma.recipeBomItem.create({ data: createData });
              }
            }
          } else {
            // Copy existing BOM items (including formula configuration and mashing step linkages)
            const existingBom = existingRecipe.recipeBoms[0];
            if (existingBom) {
              for (const bomItem of existingBom.recipeBomITem) {
                // Build the create data object, handling optional fields
                const createData: any = {
                  quantity: bomItem.quantity,
                  operation: bomItem.operation,
                  recipeBoms: { connect: { id: newRecipeBom.id } },
                  createdBy: input.updatedBy,
                };
                // Connect related entities if they exist
                if (bomItem.displayUnitsId) {
                  createData.displayUnits = {
                    connect: { id: bomItem.displayUnitsId },
                  };
                }
                if (bomItem.itemId) {
                  createData.item = { connect: { id: bomItem.itemId } };
                }
                // Copy formula configuration fields (only if set)
                if (bomItem.calculationMode)
                  createData.calculationMode = bomItem.calculationMode;
                if (bomItem.formulaType)
                  createData.formulaType = bomItem.formulaType;
                if (bomItem.formulaMultiplier != null)
                  createData.formulaMultiplier = bomItem.formulaMultiplier;
                if (bomItem.customExpression)
                  createData.customExpression = bomItem.customExpression;
                if (bomItem.formulaLibraryId)
                  createData.formulaLibraryId = bomItem.formulaLibraryId;
                if (bomItem.expressionVariables)
                  createData.expressionVariables = bomItem.expressionVariables;
                if (bomItem.expressionValidated != null)
                  createData.expressionValidated = bomItem.expressionValidated;

                // Preserve mashing protocol step linkages using the ID mapping
                if (
                  stepIdMapping &&
                  bomItem.mashingProtocolSteps &&
                  bomItem.mashingProtocolSteps.length > 0
                ) {
                  const newStepIds = bomItem.mashingProtocolSteps
                    .map((step: any) => stepIdMapping.get(step.id))
                    .filter(
                      (id: string | undefined): id is string => id !== undefined
                    );

                  if (newStepIds.length > 0) {
                    createData.mashingProtocolSteps = {
                      connect: newStepIds.map((id: string) => ({ id })),
                    };
                  }
                }

                await prisma.recipeBomItem.create({ data: createData });
              }
            }
          }

          // 9. Deactivate the old recipe
          await prisma.recipe.update({
            where: { id: existingRecipe.id },
            data: { active: false },
          });

          // Return the new recipe
          return {
            id: newRecipe.id,
            Recipe: newRecipe.Recipe,
            revision: newRecipe.revision ?? 0,
            active: newRecipe.active ?? true,
            whiskeyType: newRecipe.whiskeyType?.toString() || "",
            createdAt: newRecipe.createdAt.toISOString(),
            createdBy: newRecipe.createdBy,
            updatedAt: newRecipe.updatedAt?.toISOString(),
            updatedBy: newRecipe.updatedBy || undefined,
          };
        },
        {
          timeout: 60000, // 60 seconds for complex recipe updates with remote DB
        }
      );
    } catch (error) {
      console.error("Error updating master recipe:", error);
      throw new Error(
        `Failed to update master recipe: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Helper method to map ingredient category to BOM operation
   */
  private mapCategoryToOperation(category: string): any {
    switch (category.toLowerCase()) {
      case "grains":
      case "corn":
      case "rye":
      case "wheat":
      case "malt":
        return "Mashing01";
      case "yeast":
        return "Fermentation01";
      case "additives":
      case "enzymes":
        return "Mashing01";
      default:
        return "Mashing01";
    }
  }

  /**
   * Helper method to increment recipe revision in the name
   * Converts "CUST001-75-21-00-04-v01" to "CUST001-75-21-00-04-v02"
   */
  private incrementRecipeRevision(
    recipeName: string,
    newRevision: number
  ): string {
    // Extract the base name without revision (matches both v## and legacy R##)
    const revisionPattern = /-[Rv](\d+)$/;
    const match = recipeName.match(revisionPattern);

    if (match) {
      // Replace the existing revision with the new one
      const baseName = recipeName.replace(revisionPattern, "");
      return `${baseName}-v${newRevision.toString().padStart(2, "0")}`;
    } else {
      // If no revision pattern found, append new revision
      return `${recipeName}-v${newRevision.toString().padStart(2, "0")}`;
    }
  }

  /**
   * Helper method to map holdType values to valid enum values
   */
  private mapHoldTypeToEnum(
    holdType: string | undefined | null
  ): EnumMashingProtocolStepHoldType | null {
    if (!holdType) return null;

    switch (holdType.toLowerCase()) {
      case "heat":
        return EnumMashingProtocolStepHoldType.Heat;
      case "cool":
        return EnumMashingProtocolStepHoldType.Cool;
      case "hold":
        return EnumMashingProtocolStepHoldType.Hold;
      case "none":
      case "":
        return null; // Set to null for "None" or empty values
      default:
        console.warn(`Unknown holdType: ${holdType}, defaulting to null`);
        return null;
    }
  }

  /**
   * Helper method to map stepType values to valid enum values
   */
  private mapStepTypeToEnum(
    stepType: string | undefined | null
  ): EnumMashingProtocolStepStepType | null {
    if (!stepType) return null;

    switch (stepType) {
      case "Hold":
        return EnumMashingProtocolStepStepType.Hold;
      case "LiquidAdd":
        return EnumMashingProtocolStepStepType.LiquidAdd;
      case "Corn":
        return EnumMashingProtocolStepStepType.Corn;
      case "Wheat":
        return EnumMashingProtocolStepStepType.Wheat;
      case "Rye":
        return EnumMashingProtocolStepStepType.Rye;
      case "PreMalt":
        return EnumMashingProtocolStepStepType.PreMalt;
      case "Malt":
        return EnumMashingProtocolStepStepType.Malt;
      case "Prompt":
        return EnumMashingProtocolStepStepType.Prompt;
      case "AdditiveAdd":
        return EnumMashingProtocolStepStepType.AdditiveAdd;
      default:
        console.warn(`Unknown stepType: ${stepType}, defaulting to Hold`);
        return EnumMashingProtocolStepStepType.Hold;
    }
  }

  /**
   * Extract mash bill from recipe name using MashBillParser
   * Supports both old format (75-21-00-04) and new format (68.5C-10.5R-21M)
   */
  private extractMashBillFromRecipeName(recipeName: string): string | null {
    try {
      return MashBillParser.extractMashBillString(recipeName);
    } catch {
      return null;
    }
  }

  /**
   * Validate that recipe identity fields (customer code and mash bill) have not changed.
   * Changing these fields would require creating a new recipe family, not a revision.
   *
   * @param existingRecipe - The current recipe being updated
   * @param input - The update input with potentially changed values
   * @throws BadRequestException if identity fields have changed
   */
  private validateRecipeIdentityUnchanged(
    existingRecipe: { Recipe: string; customerCode: string | null },
    input: UpdateMasterRecipeInput
  ): void {
    // Check if customer code changed
    if (
      input.customerCode &&
      input.customerCode !== existingRecipe.customerCode
    ) {
      throw new common.BadRequestException(
        `Cannot change customer code from "${existingRecipe.customerCode}" to "${input.customerCode}" in a recipe update. ` +
          `Changing the customer code requires creating a new recipe family. Use the create recipe endpoint instead.`
      );
    }

    // Check if mash bill changed
    if (input.mashBill) {
      // Parse the existing recipe name to get its mash bill components
      try {
        const parsedExisting = MashBillParser.parse(existingRecipe.Recipe);

        // Convert existing components to MashBillComposition for comparison
        const existingMashBill: MashBillComposition = {
          corn: 0,
          rye: 0,
          wheat: 0,
          maltedBarley: 0,
        };

        for (const component of parsedExisting.components) {
          switch (component.char) {
            case "C":
              existingMashBill.corn = component.percentage;
              break;
            case "R":
              existingMashBill.rye = component.percentage;
              break;
            case "W":
              existingMashBill.wheat = component.percentage;
              break;
            case "M":
              existingMashBill.maltedBarley = component.percentage;
              break;
          }
        }

        // Compare mash bill compositions (allowing for small floating point differences)
        const tolerance = 0.01;
        const cornChanged =
          Math.abs(input.mashBill.corn - existingMashBill.corn) > tolerance;
        const ryeChanged =
          Math.abs(input.mashBill.rye - existingMashBill.rye) > tolerance;
        const wheatChanged =
          Math.abs(input.mashBill.wheat - existingMashBill.wheat) > tolerance;
        const maltChanged =
          Math.abs(
            input.mashBill.maltedBarley - existingMashBill.maltedBarley
          ) > tolerance;

        if (cornChanged || ryeChanged || wheatChanged || maltChanged) {
          const changes: string[] = [];
          if (cornChanged)
            changes.push(
              `Corn: ${existingMashBill.corn}% → ${input.mashBill.corn}%`
            );
          if (ryeChanged)
            changes.push(
              `Rye: ${existingMashBill.rye}% → ${input.mashBill.rye}%`
            );
          if (wheatChanged)
            changes.push(
              `Wheat: ${existingMashBill.wheat}% → ${input.mashBill.wheat}%`
            );
          if (maltChanged)
            changes.push(
              `Malt: ${existingMashBill.maltedBarley}% → ${input.mashBill.maltedBarley}%`
            );

          throw new common.BadRequestException(
            `Cannot change mash bill composition in a recipe update. ` +
              `Changes detected: ${changes.join(", ")}. ` +
              `Changing the mash bill requires creating a new recipe family. Use the create recipe endpoint instead.`
          );
        }
      } catch (error) {
        // If we can't parse the existing recipe, log a warning but allow the update
        // This handles legacy format recipes that might not parse correctly
        if (error instanceof common.BadRequestException) {
          throw error;
        }
        this.logger.warn(
          `Could not parse existing recipe name "${existingRecipe.Recipe}" for mash bill validation: ${error}`
        );
      }
    }
  }

  /**
   * Get all revisions of a recipe by its base name
   * Returns revisions ordered from oldest to newest
   */
  async getRecipeRevisionHistory(recipeId: string): Promise<any[]> {
    // First get the recipe to find its baseRecipeName
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { baseRecipeName: true },
    });

    if (!recipe?.baseRecipeName) {
      // If no baseRecipeName, return just this recipe
      const singleRecipe = await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
          customer: true,
          parentRecipe: {
            select: { id: true, Recipe: true, revision: true },
          },
          childRevisions: {
            select: { id: true, Recipe: true, revision: true },
          },
        },
      });
      return singleRecipe ? [singleRecipe] : [];
    }

    // Get all recipes with the same baseRecipeName, ordered by revision
    const revisions = await this.prisma.recipe.findMany({
      where: { baseRecipeName: recipe.baseRecipeName },
      include: {
        customer: true,
        parentRecipe: {
          select: { id: true, Recipe: true, revision: true },
        },
        childRevisions: {
          select: { id: true, Recipe: true, revision: true },
        },
      },
      orderBy: { revision: "asc" },
    });

    return revisions;
  }

  /**
   * Get the latest revision of a recipe family by baseRecipeName
   */
  async getLatestRecipeRevision(baseRecipeName: string): Promise<any> {
    const latestRevision = await this.prisma.recipe.findFirst({
      where: {
        baseRecipeName,
        active: true,
      },
      orderBy: { revision: "desc" },
      include: {
        customer: true,
        recipeBoms: true,
        parameters: true,
        mashingProtocol: {
          include: { steps: true },
        },
      },
    });

    return latestRevision;
  }

  /**
   * Calculate mash bill from recipe BOM items
   */
  private calculateMashBillFromBOM(recipeBom: any): string | null {
    try {
      const grainItems =
        recipeBom.recipeBomITem?.filter(
          (bomItem: any) =>
            bomItem.item?.itemType === "GRAIN" ||
            bomItem.item?.itemGroup === "GRAIN" ||
            bomItem.item?.itemName?.toLowerCase().includes("corn") ||
            bomItem.item?.itemName?.toLowerCase().includes("rye") ||
            bomItem.item?.itemName?.toLowerCase().includes("wheat") ||
            bomItem.item?.itemName?.toLowerCase().includes("malt")
        ) || [];

      if (grainItems.length === 0) {
        return null;
      }

      // Calculate total grain weight
      const totalGrainWeight = grainItems.reduce(
        (sum: number, item: any) => sum + (item.quantity || 0),
        0
      );

      if (totalGrainWeight === 0) {
        return null;
      }

      // Initialize percentages
      let cornPct = 0,
        ryePct = 0,
        wheatPct = 0,
        maltPct = 0;

      // Categorize grains and calculate percentages
      grainItems.forEach((item: any) => {
        const itemName = item.item?.itemName?.toLowerCase() || "";
        const percentage = Math.round((item.quantity / totalGrainWeight) * 100);

        if (itemName.includes("corn")) {
          cornPct += percentage;
        } else if (itemName.includes("rye")) {
          ryePct += percentage;
        } else if (itemName.includes("wheat")) {
          wheatPct += percentage;
        } else if (itemName.includes("malt") || itemName.includes("barley")) {
          maltPct += percentage;
        }
      });

      // Format as XX-XX-XX-XX
      return `${cornPct.toString().padStart(2, "0")}-${ryePct
        .toString()
        .padStart(2, "0")}-${wheatPct.toString().padStart(2, "0")}-${maltPct
        .toString()
        .padStart(2, "0")}`;
    } catch (error) {
      this.logger.warn("Error calculating mash bill from BOM:", error);
      return null;
    }
  }

  /**
   * Find or create a recipe group based on mash bill
   * @param mashBill The mash bill string (e.g., "70-21-00-09")
   * @param createdBy Username of the creator
   * @param prisma Prisma transaction client
   * @returns The recipe group or null if mash bill is invalid
   */
  private async findOrCreateRecipeGroup(
    mashBill: string | null,
    createdBy: string,
    prisma: any
  ): Promise<any> {
    if (!mashBill) {
      return null;
    }

    // Try to find existing recipe group for this mash bill
    let recipeGroup = await prisma.recipeGroup.findFirst({
      where: { recipe: mashBill },
    });

    if (!recipeGroup) {
      // Create new recipe group for this mash bill
      recipeGroup = await prisma.recipeGroup.create({
        data: {
          recipe: mashBill, // Store mash bill as the recipe group identifier
          revision: 1,
          createdBy: createdBy,
        },
      });
      this.logger.log(`Created new recipe group for mash bill: ${mashBill}`);
    } else {
      this.logger.log(`Found existing recipe group for mash bill: ${mashBill}`);
    }

    return recipeGroup;
  }

  /**
   * Calculates normalized enzyme dosing for a single enzyme.
   * Either recipeId OR mashBill must be provided.
   *
   * @param recipeId Optional recipe ID to get mash bill from
   * @param mashBill Optional mash bill string (e.g., "70-21-00-09")
   * @param enzymeItemId Item ID of the enzyme
   * @returns Normalized enzyme dosing result
   */
  public async calculateNormalizedEnzymeDosing(
    recipeId?: string,
    mashBill?: string,
    enzymeItemId?: string
  ): Promise<{
    recipeId?: string;
    recipeName?: string;
    enzymeItemId: string;
    enzymeName: string;
    enzymeCategory: string;
    normalizedDoseRatio: number;
    instructions: string;
    mashBill: string;
    calculatedAt: string;
  }> {
    // Validate inputs
    if (!recipeId && !mashBill) {
      throw new common.BadRequestException(
        "Either recipeId or mashBill must be provided"
      );
    }
    if (!enzymeItemId) {
      throw new common.BadRequestException("enzymeItemId is required");
    }

    let recipe: any = null;
    let finalMashBill: string;

    if (recipeId) {
      // Get mash bill from recipe
      recipe = await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
          recipeBoms: {
            where: { master: true },
            include: {
              recipeBomITem: {
                include: {
                  item: true,
                },
              },
            },
            orderBy: { revision: "desc" },
            take: 1,
          },
        },
      });

      if (!recipe) {
        throw new common.NotFoundException(
          `Recipe with ID ${recipeId} not found`
        );
      }

      // Try to extract mash bill from recipe name first
      const extractedMashBill = this.extractMashBillFromRecipeName(
        recipe.Recipe
      );

      // If not found in name, calculate from BOM
      if (
        !extractedMashBill &&
        recipe.recipeBoms.length > 0 &&
        recipe.recipeBoms[0].recipeBomITem
      ) {
        const calculatedMashBill = this.calculateMashBillFromBOM(
          recipe.recipeBoms[0].recipeBomITem
        );
        finalMashBill = calculatedMashBill || "";
      } else {
        finalMashBill = extractedMashBill || "";
      }

      if (!finalMashBill) {
        throw new common.BadRequestException(
          `Could not determine mash bill for recipe ${recipe.Recipe}`
        );
      }
    } else {
      // Use provided mash bill
      finalMashBill = mashBill!;

      // Validate mash bill format
      if (!/^\d{2,3}-\d{2,3}-\d{2,3}-\d{2,3}$/.test(finalMashBill)) {
        throw new common.BadRequestException(
          `Invalid mash bill format. Expected format: XX-XX-XX-XX (e.g., "70-21-00-09") or XXX-XX-XX-XX for 100% components`
        );
      }

      // Additional validation: ensure components sum to 100
      const parts = finalMashBill.split("-").map((part) => parseInt(part, 10));
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new common.BadRequestException(
          `Invalid mash bill format. Expected format: XX-XX-XX-XX (e.g., "70-21-00-09") or XXX-XX-XX-XX for 100% components`
        );
      }

      const total = parts.reduce((sum, part) => sum + part, 0);
      if (total !== 100) {
        throw new common.BadRequestException(
          `Mash bill components must sum to 100%, but sum to ${total}%`
        );
      }
    }

    // Calculate enzyme dosing
    const result =
      await this.enzymeDosingService.calculateNormalizedEnzymeDosingByItemId(
        finalMashBill,
        enzymeItemId
      );

    if (!result) {
      throw new common.BadRequestException(
        `Could not calculate enzyme dosing for ${enzymeItemId}`
      );
    }

    return {
      recipeId: recipe?.id,
      recipeName: recipe?.Recipe,
      enzymeItemId,
      enzymeName: result.enzymeName,
      enzymeCategory: result.category,
      normalizedDoseRatio: result.ratio,
      instructions: result.instructions,
      mashBill: finalMashBill,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculates normalized enzyme dosing for multiple enzymes.
   * Either recipeId OR mashBill must be provided.
   *
   * @param recipeId Optional recipe ID to get mash bill from
   * @param mashBill Optional mash bill string (e.g., "70-21-00-09")
   * @param enzymeItemIds Array of enzyme item IDs
   * @returns Recipe enzyme dosing results
   */
  public async calculateRecipeEnzymeDosing(
    recipeId?: string,
    mashBill?: string,
    enzymeItemIds?: string[]
  ): Promise<{
    recipeId?: string;
    recipeName?: string;
    mashBill: string;
    enzymeResults: Array<{
      enzymeItemId: string;
      enzymeName: string;
      enzymeCategory: string;
      normalizedDoseRatio: number;
      instructions: string;
    }>;
    calculatedAt: string;
  }> {
    // Validate inputs
    if (!recipeId && !mashBill) {
      throw new common.BadRequestException(
        "Either recipeId or mashBill must be provided"
      );
    }
    if (!enzymeItemIds || enzymeItemIds.length === 0) {
      throw new common.BadRequestException(
        "enzymeItemIds array is required and cannot be empty"
      );
    }

    let recipe: any = null;
    let finalMashBill: string;

    if (recipeId) {
      // Get mash bill from recipe
      recipe = await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
          recipeBoms: {
            where: { master: true },
            include: {
              recipeBomITem: {
                include: {
                  item: true,
                },
              },
            },
            orderBy: { revision: "desc" },
            take: 1,
          },
        },
      });

      if (!recipe) {
        throw new common.NotFoundException(
          `Recipe with ID ${recipeId} not found`
        );
      }

      // Try to extract mash bill from recipe name first
      const extractedMashBill = this.extractMashBillFromRecipeName(
        recipe.Recipe
      );

      // If not found in name, calculate from BOM
      if (
        !extractedMashBill &&
        recipe.recipeBoms.length > 0 &&
        recipe.recipeBoms[0].recipeBomITem
      ) {
        const calculatedMashBill = this.calculateMashBillFromBOM(
          recipe.recipeBoms[0].recipeBomITem
        );
        finalMashBill = calculatedMashBill || "";
      } else {
        finalMashBill = extractedMashBill || "";
      }

      if (!finalMashBill) {
        throw new common.BadRequestException(
          `Could not determine mash bill for recipe ${recipe.Recipe}`
        );
      }
    } else {
      // Use provided mash bill
      finalMashBill = mashBill!;

      // Validate mash bill format
      if (!/^\d{2,3}-\d{2,3}-\d{2,3}-\d{2,3}$/.test(finalMashBill)) {
        throw new common.BadRequestException(
          `Invalid mash bill format. Expected format: XX-XX-XX-XX (e.g., "70-21-00-09") or XXX-XX-XX-XX for 100% components`
        );
      }

      // Additional validation: ensure components sum to 100
      const parts = finalMashBill.split("-").map((part) => parseInt(part, 10));
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new common.BadRequestException(
          `Invalid mash bill format. Expected format: XX-XX-XX-XX (e.g., "70-21-00-09") or XXX-XX-XX-XX for 100% components`
        );
      }

      const total = parts.reduce((sum, part) => sum + part, 0);
      if (total !== 100) {
        throw new common.BadRequestException(
          `Mash bill components must sum to 100%, but sum to ${total}%`
        );
      }
    }

    // Calculate enzyme dosing for each enzyme
    const enzymeResults = [];

    for (const enzymeItemId of enzymeItemIds) {
      const result =
        await this.enzymeDosingService.calculateNormalizedEnzymeDosingByItemId(
          finalMashBill,
          enzymeItemId
        );

      if (result) {
        enzymeResults.push({
          enzymeItemId,
          enzymeName: result.enzymeName,
          enzymeCategory: result.category,
          normalizedDoseRatio: result.ratio,
          instructions: result.instructions,
        });
      }
    }

    return {
      recipeId: recipe?.id,
      recipeName: recipe?.Recipe,
      mashBill: finalMashBill,
      enzymeResults,
      calculatedAt: new Date().toISOString(),
    };
  }
}
