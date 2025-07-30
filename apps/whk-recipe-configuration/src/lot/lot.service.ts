import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { EnumLotStatus, Lot, Prisma, EnumLotWhiskeyType } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
import { LotUpdateInput } from "./base/LotUpdateInput";
import { EnumRecipeWhiskeyType } from "../recipe/base/EnumRecipeWhiskeyType";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    super(prisma);
  }

  /**
   * Map EnumLotWhiskeyType to EnumRecipeWhiskeyType
   * Based on TTB regulations and existing app logic
   */
  private mapLotWhiskeyTypeToRecipeWhiskeyType(
    lotWhiskeyType?: EnumLotWhiskeyType
  ): EnumRecipeWhiskeyType {
    if (!lotWhiskeyType) {
      return EnumRecipeWhiskeyType.RyeBourbon; // Default
    }

    const mapping: { [key in EnumLotWhiskeyType]: EnumRecipeWhiskeyType } = {
      [EnumLotWhiskeyType.AmericanSingleMalt]: EnumRecipeWhiskeyType.MaltWhiskey,
      [EnumLotWhiskeyType.CornBourbon]: EnumRecipeWhiskeyType.RyeBourbon, // Generic bourbon, defaulting to rye bourbon
      [EnumLotWhiskeyType.CornWhiskey]: EnumRecipeWhiskeyType.RyeBourbon, // Corn whiskey mapped to bourbon for recipe purposes
      [EnumLotWhiskeyType.RyeBourbon]: EnumRecipeWhiskeyType.RyeBourbon,
      [EnumLotWhiskeyType.RyeWhiskey]: EnumRecipeWhiskeyType.RyeWhiskey,
      [EnumLotWhiskeyType.WheatedBourbon]: EnumRecipeWhiskeyType.WheatedBourbon,
      [EnumLotWhiskeyType.WheatWhiskey]: EnumRecipeWhiskeyType.WheatWhiskey,
    };

    return mapping[lotWhiskeyType] || EnumRecipeWhiskeyType.RyeBourbon;
  }

  /**
   * Detect whiskey type from recipe name using similar logic to RecipeGenerator
   * This provides a fallback when lot whiskey type is not available
   */
  private detectWhiskeyTypeFromRecipeName(recipeName: string): EnumRecipeWhiskeyType {
    const upperName = recipeName.toUpperCase();
    
    // Look for key indicators in the recipe name
    if (upperName.includes("MALT") || upperName.includes("SINGLE MALT")) {
      return EnumRecipeWhiskeyType.MaltWhiskey;
    }
    
    if (upperName.includes("WHEAT") && upperName.includes("BOURBON")) {
      return EnumRecipeWhiskeyType.WheatedBourbon;
    }
    
    if (upperName.includes("WHEAT") && upperName.includes("WHISKEY")) {
      return EnumRecipeWhiskeyType.WheatWhiskey;
    }
    
    if (upperName.includes("RYE") && upperName.includes("WHISKEY")) {
      return EnumRecipeWhiskeyType.RyeWhiskey;
    }
    
    if (upperName.includes("FOUR GRAIN") || upperName.includes("4 GRAIN") || upperName.includes("FOUR-GRAIN")) {
      if (upperName.includes("BOURBON")) {
        return EnumRecipeWhiskeyType.FourGrainBourbon;
      } else if (upperName.includes("WHISKEY")) {
        return EnumRecipeWhiskeyType.FourGrainWhiskey;
      }
    }
    
    // Default to RyeBourbon for any bourbon or unknown types
    return EnumRecipeWhiskeyType.RyeBourbon;
  }

  /**
   * Find or create a recipe by name. If recipe doesn't exist, create it with basic defaults.
   */
  private async findOrCreateRecipeByName(
    recipeName: string,
    createdBy: string,
    whiskeyType?: EnumLotWhiskeyType
  ): Promise<string> {
    // First try to find existing recipe by name
    const existingRecipe = await this.prisma.recipe.findFirst({
      where: {
        Recipe: recipeName,
      },
    });

    if (existingRecipe) {
      this.logger.log(`Found existing recipe: ${existingRecipe.id}`);
      return existingRecipe.id;
    }

    // Recipe doesn't exist, create it
    this.logger.log(`Creating new recipe: ${recipeName}`);

    // Get or create a default customer (using first available customer or create a default one)
    let defaultCustomer = await this.prisma.customer.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!defaultCustomer) {
      defaultCustomer = await this.prisma.customer.create({
        data: {
          name: "Default Customer",
          address: "Default Address",
          createdBy: createdBy,
        },
      });
    }

    // Create a basic item for the recipe
    const itemNumber = `${recipeName.replace(/\s+/g, '-').toUpperCase()}-ITEM`;
    let recipeItem = await this.prisma.item.findFirst({
      where: {
        itemNumber: itemNumber,
      },
    });

    if (!recipeItem) {
      recipeItem = await this.prisma.item.create({
        data: {
          itemNumber: itemNumber,
          itemName: recipeName,
          itemDescription: `Item for ${recipeName}`,
          itemType: "FG", // Finished Good
          erpId: itemNumber,
          createdBy: createdBy,
        },
      });
    }

    // Determine whiskey type for the recipe
    let recipeWhiskeyType: EnumRecipeWhiskeyType;
    if (whiskeyType) {
      // Use lot whiskey type if provided
      recipeWhiskeyType = this.mapLotWhiskeyTypeToRecipeWhiskeyType(whiskeyType);
    } else {
      // Fallback to detecting from recipe name
      recipeWhiskeyType = this.detectWhiskeyTypeFromRecipeName(recipeName);
    }

    this.logger.log(`Creating recipe with whiskey type: ${recipeWhiskeyType}`);

    // Create the recipe (whiskeyType can be added when schema is updated)
    const newRecipe = await this.prisma.recipe.create({
      data: {
        Recipe: recipeName,
        createdBy: createdBy,
        customer: { connect: { id: defaultCustomer.id } },
        item: { connect: { id: recipeItem.id } },
        revision: 1,
        // whiskeyType: recipeWhiskeyType, // TODO: Add when schema supports whiskeyType
      },
    });

    this.logger.log(`Created new recipe: ${newRecipe.id} with whiskey type logic: ${recipeWhiskeyType}`);

    this.logger.log(`Created new recipe: ${newRecipe.id}`);
    return newRecipe.id;
  }

  /**
   * Process recipe input - handles both recipe ID and recipe name
   */
  private async processRecipeInput(
    recipeInput: any,
    createdBy: string,
    whiskeyType?: EnumLotWhiskeyType
  ): Promise<string> {
    // If it's a string, treat it as a recipe name
    if (typeof recipeInput === 'string') {
      return this.findOrCreateRecipeByName(recipeInput, createdBy, whiskeyType);
    }

    // If it's an object with connect.id, use the existing ID
    if (recipeInput?.connect?.id) {
      return recipeInput.connect.id;
    }

    // If it's an object with just id, use that
    if (recipeInput?.id) {
      return recipeInput.id;
    }

    throw new Error("Invalid recipe input format");
  }

  private roundLotFloatFields(
    data: Prisma.LotCreateInput | Prisma.LotUpdateInput
  ): void {
    const floatFields = [
      "avgBblFillByPg",
      "avgBblFillByWg",
      "avgPGsFerm",
      "bblEntryProof",
      "finalVolume",
      "finalWeight",
      "grainLbsFerm",
      "grainLbsPg",
      "initialVolume",
      "initialWeight",
      "pgLosses",
      "proofInitial",
      "standardYield",
      "totalFermenters",
      "totalPGs",
      "totalPGsByRecipe",
      "totalVolumeWg",
      "totalWGs",
      "totalWeight",
    ];
    for (const field of floatFields) {
      const value = (data as any)[field];
      if (typeof value === "number") {
        (data as any)[field] = Math.round(value * 100) / 100;
      }
    }
  }

  async calculateLotAnalytics(
    lot:
      | LotCreateInput
      | (LotUpdateInput & { where: Prisma.LotWhereUniqueInput } & {
          data: Prisma.LotUpdateInput;
        }),
    type = "create"
  ): Promise<any> {
    /* CALCULATION DEFINITIONS

    The key inputs to these are...
    1. Weight. Depending on the source vessel for the lot, this will either be direct via start/end weights or via the start/end volumes and the final density
    2. Barrel Entry Proof. This is the proof of the distillate entering the barrel. This 2*100 * the ABV
    3. Distillate final density

    The Metrics to be calculated are...
    1. Density, simple unit conversion
    2. Total WGs (Volume) = Total Weight / Density
    3. Total PGs = Total WGs * EntryProof/100
    4. Average PGs / Bbl = Total PGs / Total Barrels
    5. Average WGs / Bbl = Total WGs / Total Barrels

    */
    let mergedLot: any = {};

    if (type === "create") {
      mergedLot = { ...lot };
    } else if (type === "update" && "where" in lot && "data" in lot) {
      const existingLot = await this.prisma.lot.findUnique({
        where: { id: lot.where.id },
      });

      if (!existingLot) {
        throw new Error("Lot not found");
      }

      mergedLot = {
        ...existingLot,
        ...Object.fromEntries(
          Object.entries(lot.data).filter(([_, value]) => value !== undefined)
        ),
      };
    } else {
      throw new Error("Invalid input for lot calculation");
    }

    const explicitStatus = mergedLot.status as EnumLotStatus | undefined;

    // Perform calculations
    if (mergedLot.densityFinal && mergedLot.densityFinal <= 1) {
      mergedLot.densityFinal *= 8.3454;
    }

    if (mergedLot.totalWeight && mergedLot.densityFinal) {
      mergedLot.totalVolumeWg = mergedLot.totalWeight / mergedLot.densityFinal;
    } else if (
      mergedLot.initialWeight &&
      mergedLot.finalWeight &&
      mergedLot.densityFinal
    ) {
      mergedLot.totalWeight = mergedLot.initialWeight - mergedLot.finalWeight;
      mergedLot.totalVolumeWg = mergedLot.totalWeight / mergedLot.densityFinal;
    } else if (
      mergedLot.initialVolume &&
      mergedLot.finalVolume &&
      mergedLot.densityFinal
    ) {
      mergedLot.initialVolume *= 301.38;
      mergedLot.finalVolume *= 301.38;
      mergedLot.totalWeight =
        (mergedLot.initialVolume - mergedLot.finalVolume) *
        mergedLot.densityFinal;
      mergedLot.totalVolumeWg = mergedLot.initialVolume - mergedLot.finalVolume;
    }

    if (mergedLot.totalVolumeWg) {
      mergedLot.totalPGs =
        (mergedLot.totalVolumeWg * (mergedLot.bblEntryProof || 0)) / 100;
      mergedLot.totalWGs = mergedLot.totalVolumeWg;

      if (mergedLot.totalFermenters) {
        mergedLot.avgPGsFerm = mergedLot.totalPGs / mergedLot.totalFermenters;
      }

      if (mergedLot.bblTotal) {
        mergedLot.avgBblFillByPg = mergedLot.totalPGs / mergedLot.bblTotal;
        mergedLot.avgBblFillByWg = mergedLot.totalWGs / mergedLot.bblTotal;
        if (!explicitStatus) {
          mergedLot.status = EnumLotStatus.PendingValidation;
        }
      } else {
        if (!explicitStatus) {
          mergedLot.status = EnumLotStatus.Started;
        }
      }
    }

    // Return only the calculated fields and essential data
    return {
      totalWeight: mergedLot.totalWeight,
      totalVolumeWg: mergedLot.totalVolumeWg,
      totalPGs: mergedLot.totalPGs,
      totalWGs: mergedLot.totalWGs,
      avgPGsFerm: mergedLot.avgPGsFerm,
      avgBblFillByPg: mergedLot.avgBblFillByPg,
      avgBblFillByWg: mergedLot.avgBblFillByWg,
      status: explicitStatus ?? mergedLot.status,
      densityFinal: mergedLot.densityFinal,
    };
  }

  async createLot<T extends Prisma.LotCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.LotCreateArgs>
  ): Promise<Lot> {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String.fromCharCode(64 + date.getMonth() + 1);
    const day = date.getDate().toString().padStart(2, "0");
    const barrelTypeMapping: { [key: string]: string } = {
      WVG: "01",
      ISC: "10",
      OTHER: "99",
      CUS: "90",
    };
    // Accept case-insensitive values for the OEM
    const bblOem = args.data.bblOem?.toUpperCase();
    if (!bblOem || !barrelTypeMapping[bblOem]) {
      throw new Error(
        "BBL OEM must be provided and must be one of the following: WVG, ISC, Other"
      );
    }
    const bblType = barrelTypeMapping[bblOem];

    // Validate and normalize lotAlphaChar
    if (!args.data.lotAlphaChar || !/^[a-zA-Z]$/.test(args.data.lotAlphaChar)) {
      throw new Error("Lot alpha character must be a single letter");
    }
    const lotAlphaChar = args.data.lotAlphaChar.toUpperCase();

    let lotNumberPrefix = `${year}${month}${day}${lotAlphaChar}.${bblType}`;
    this.logger.log(`lotNumber: ${args.data.lotNumber}`);

    // If createdAt is provided, use that date instead of current date
    if (args.data.lotCreatedAt) {
      const createdDate = new Date(args.data.lotCreatedAt);
      const createdYear = createdDate.getFullYear().toString().slice(-2);
      const createdMonth = String.fromCharCode(64 + createdDate.getMonth() + 1);
      const createdDay = createdDate.getDate().toString().padStart(2, "0");
      lotNumberPrefix = `${createdYear}${createdMonth}${createdDay}${args.data.lotAlphaChar}.${bblType}`;
    }

    const lastLot: Lot[] = await this.lots({
      where: {
        lotNumber: {
          startsWith:
            args.data.lotNumber === "" ? lotNumberPrefix : args.data.lotNumber,
        },
      },
      orderBy: {
        lotNumber: "desc",
      },
      take: 1,
    });
    this.logger.log(`Last lot: ${JSON.stringify(lastLot)}`);
    this.logger.log(`lotNumberPrefix: ${lotNumberPrefix}`);

    let fullLotNumber: string;
    if (args.data.lotNumber == "") {
      if (lastLot.length > 0) {
        throw new Error(
          `Lot with character ${args.data.lotAlphaChar} has already been created today.`
        );
      }
      fullLotNumber = `${lotNumberPrefix}`;
    } else {
      fullLotNumber = args.data.lotNumber;
    }
    this.logger.log(`fullLotNumber: ${fullLotNumber}`);

    // Process recipe input (supports both ID and name)
    let recipeId: string;
    const recipeName = (args.data as any).recipeName;
    
    if (recipeName) {
      // If recipeName is provided, use it
      recipeId = await this.processRecipeInput(
        recipeName,
        args.data.createdBy || "system",
        args.data.whiskeyType || undefined
      );
    } else if (args.data.recipe) {
      // Otherwise use recipe ID
      recipeId = await this.processRecipeInput(
        args.data.recipe,
        args.data.createdBy || "system",
        args.data.whiskeyType || undefined
      );
    } else {
      throw new Error("Either recipe or recipeName is required");
    }

    // Get the recipe and its item
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { item: true },
    });
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    // Update the args.data with the recipe and item
    args.data.recipe = { connect: { id: recipeId } };
    if (!recipe.item) {
      throw new Error("Recipe does not have an associated item");
    }
    args.data.item = { connect: { id: recipe.item.id } };

    // Calculate the lot analytics
    const calculatedData = await this.calculateLotAnalytics(
      args.data as LotCreateInput
    );

    const createData = {
      ...args.data,
      ...calculatedData,
      lotNumber: `${fullLotNumber}`,
    };
    this.roundLotFloatFields(createData);
    const lot = await super.createLot({
      data: createData,
      include: {
        ...args.include,
        productionOrder: true,
        item: true,
        recipe: true,
      },
    });

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Lot,
      {
        event_type: "create",
        data: lot,
        recordName: "Lot",
      }
    );

    this.logger.log(`Created Lot: ${lot.lotNumber} & pushed to topic`);
    return lot;
  }

  async updateLot<T extends Prisma.LotUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.LotUpdateArgs>
  ): Promise<import(".prisma/client").Lot> {
    // Process recipe input if provided (supports both ID and name)
    const recipeName = (args.data as any).recipeName;
    
    if (recipeName) {
      // If recipeName is provided, use it
      const recipeId = await this.processRecipeInput(
        recipeName,
        "system", // For updates, use system as default
        (args.data as any).whiskeyType || undefined
      );
      args.data.recipe = { connect: { id: recipeId } };
    } else if (args.data.recipe) {
      // Otherwise use recipe ID if provided
      const recipeId = await this.processRecipeInput(
        args.data.recipe,
        "system", // For updates, use system as default
        (args.data as any).whiskeyType || undefined
      );
      args.data.recipe = { connect: { id: recipeId } };
    }

    const calculatedData = await this.calculateLotAnalytics(
      {
        where: args.where,
        data: {
          ...args.data,
          filledFrom: args.data.filledFrom
            ? { connect: { id: args.data.filledFrom.connect?.id } }
            : undefined,
        },
      },
      "update"
    );
    args.data = {
      ...args.data,
      ...calculatedData,
    };
    this.roundLotFloatFields(args.data);
    const Lot = await super.updateLot({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        productionOrder: true,
        item: true,
        recipe: true,
      },
      where: args.where,
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Lot,
      {
        event_type: "update",
        data: Lot,
        recordName: "Lot",
      }
    );
    this.logger.log(`Updated Lot: ${Lot.lotNumber} & pushed to topic`);
    return Lot;
  }
}
