import {
  EnumRecipeParameterRecipeSetpointType,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
  Item,
  Recipe,
  RecipeGroup,
  RecipeParameter,
  EnumRecipeWhiskeyType,
  EnumMashingProtocolStepStepType,
  Customer,
  ProductionOrder,
  ScheduleOrder,
} from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EnzymeDosingService } from "./enzyme.dosing";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { EnumRecipeBomItemOperation } from "../recipeBomItem/base/EnumRecipeBomItemOperation";
import { PrismaService } from "../prisma/prisma.service";
import { MashBillParser, GRAIN_ABBREVIATIONS } from "./mashbill-parser";

// Define the BinAssignments interface to allow string or string[] values
interface BinAssignments {
  [bin: string]: string | string[];
}

interface RecipeCreationResult {
  recipe: Recipe;
  recipeBom: any;
  productionOrder?: ProductionOrder;
  scheduleOrder?: ScheduleOrder;
}

@Injectable()
export class RecipeGenerator {
  private RECIPE = "";
  private ITEM_NUMBER = "";
  private BOM_REVISION = "";
  private CUSTOMER_CODE = "";
  private MASH_BILL = "";
  private FINAL_PROOF = 0;
  private BARREL_INFO = "";
  private CUSTOMER_NAME = "";
  private ORDER_QTY = 0;
  private TOTAL_GRAIN_WEIGHT = 0;
  private BBLS_PER_FERM = 0;
  private USER = "";
  private WATER_QTY = 0;
  private BACKSET_QTY = 0;
  private BBL_ITEM_NUMBERS: string[] = [];
  private YEAST_ITEM_NUMBERS_QTYS: { [key: string]: number } = {};
  private MASHING_PROTOCOL: any[] = [];
  private RECIPE_PARAMETERS: any[] = [];
  private SPECIALTY_ITEM_ID: string | undefined;

  private readonly MAX_QUANTITIES: { [key: string]: number } = {
    bin1: 6500,
    bin2: 18100,
    bin3: 1700,
    // bin4: 2000, // Add more bins if necessary
  };

  constructor(
    private readonly rabbitMQProducer: RabbitMQProducerService,
    private readonly enzymeDosingService: EnzymeDosingService,
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    this.RECIPE = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-v01`;
    if (this.BARREL_INFO !== "") {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.BARREL_INFO}-${this.FINAL_PROOF}-v01`;
    } else {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.FINAL_PROOF}-v01`;
    }
    this.BOM_REVISION = `BOM-${this.CUSTOMER_CODE}-${this.MASH_BILL}-v01`;
  }

  private normalizeRecipeParamName(name: string): string {
    const original = (name ?? "").toString().trim();
    const normalized = original.toLowerCase().replace(/[\s_-]+/g, "");

    // Handle explicit Temperature -> Temp variants we support
    if (normalized === "controltemperature") {
      return "ControlTemp";
    }
    if (
      normalized === "settemperature" ||
      normalized === "fermsettemperature"
    ) {
      return "SetTemp";
    }
    if (normalized === "lowtemperatureinfusion") {
      return "LowTempInfusion";
    }

    // Default: return as provided
    return original;
  }

  private parseMashBillComponent(segment: string): number {
    if (!segment) {
      return NaN;
    }
    const s = String(segment).trim();
    if (!s) return NaN;
    // Preserve leading negative sign if present; extract first signed decimal number
    const match = s.match(/(-?\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : NaN;
  }

  private getNormalizedMashBillValues(mashBill: string): number[] {
    // Handle cases where the mash bill starts with a negative number
    // by replacing the first "-" with a placeholder if it's at the start
    let processedMashBill = mashBill;
    if (mashBill.startsWith("-")) {
      processedMashBill = "NEG" + mashBill.substring(1);
    }

    const segments = processedMashBill
      .split("-")
      .slice(0, 5)
      .map((segment) => {
        // Restore the negative sign if we used the placeholder
        if (segment.startsWith("NEG")) {
          return "-" + segment.substring(3);
        }
        return segment;
      });

    return segments
      .map((segment) => {
        const value = this.parseMashBillComponent(segment);
        return Number.isFinite(value) ? value : 0;
      })
      .concat(Array(Math.max(0, 5)).fill(0))
      .slice(0, 5);
  }

  // Function to calculate grain quantities based on mash bill
  // Supports both legacy format (75-21-00-04) and new format (68.5C-10.5R-21M)
  private calculateGrainQuantities(mashBill: string, totalGrainWeight: number) {
    // Try to parse using new format first
    const format = MashBillParser.detectFormat(`TEMP-${mashBill}-v01`);

    if (format === "new" || mashBill.match(/\d+(?:\.\d+)?[A-Z]/)) {
      // New format with grain abbreviations
      const parsed = MashBillParser.parse(`TEMP-${mashBill}-v01`);
      const quantities: { [key: string]: number } = {};

      for (const component of parsed.components) {
        const grainName =
          component.grainName ||
          GRAIN_ABBREVIATIONS[
            component.char as keyof typeof GRAIN_ABBREVIATIONS
          ] ||
          component.char;
        // Convert percentage to decimal (e.g., 68.5 -> 0.685)
        quantities[grainName] = component.percentage / 100;
      }

      return quantities;
    }

    // Legacy format: corn-rye-wheat-malt[-specialty]
    const parts = mashBill
      .split("-")
      .map((percent) => parseFloat(percent) / 100);
    const [
      cornPercent = 0,
      ryePercent = 0,
      wheatPercent = 0,
      maltPercent = 0,
      specialtyPercent = 0,
    ] = parts;

    // Return percentages directly instead of absolute quantities
    return {
      Corn: cornPercent,
      Rye: ryePercent,
      Wheat: wheatPercent,
      Malt: maltPercent,
      Specialty: specialtyPercent,
    };
  }

  /**
   * Preserve the splitting logic for use during order instantiation when total grain load is known
   */
  private splitGrainAdditionsForProduction(
    grainType: string,
    qtyInLbs: number,
    binAssignments: BinAssignments
  ): any[] {
    this.logger.log(
      `Splitting grain additions for ${grainType} with quantity ${qtyInLbs} lbs`
    );

    const SPLITS_RATIO = 0.6;
    const splits: any[] = [];
    let remainingQty = qtyInLbs;

    // Handle PreMalt separately
    if (grainType === "PreMalt") {
      // PreMalt is typically 10% of malt quantity
      splits.push({
        action: "Add Grain",
        grainType: "Malt", // PreMalt is handled as Malt
        qty: qtyInLbs,
      });
      return splits;
    }

    // Get assigned bin for this grain type
    let assignedBin = null;
    for (const [bin, grains] of Object.entries(binAssignments)) {
      if (
        (typeof grains === "string" && grains === grainType) ||
        (Array.isArray(grains) && grains.includes(grainType))
      ) {
        assignedBin = bin;
        break;
      }
    }

    if (!assignedBin) {
      throw new Error(`No bin assigned for grain type ${grainType}`);
    }

    const maxBinQty = this.MAX_QUANTITIES[assignedBin];

    // Always split if quantity is greater than bin capacity
    if (qtyInLbs > maxBinQty) {
      // Calculate first split quantity
      const firstSplitQty = Math.min(
        maxBinQty,
        Math.floor(qtyInLbs * SPLITS_RATIO)
      );

      // Add first grain addition
      splits.push({
        action: "Add Grain",
        grainType: grainType,
        qty: firstSplitQty,
      });

      // Add hold after first addition
      splits.push({
        action: "Hold",
        holdType: "Hold",
        time: 2,
      });

      remainingQty -= firstSplitQty;

      // Add remaining quantity as second addition
      if (remainingQty > 0) {
        splits.push({
          action: "Add Grain",
          grainType: grainType,
          qty: remainingQty,
        });
      }
    } else {
      // Single addition for quantities within bin capacity
      splits.push({
        action: "Add Grain",
        grainType: grainType,
        qty: qtyInLbs,
      });
    }

    return splits;
  }

  /**
   * This method is preserved for recipe instance creation but not used during initial recipe creation
   * It will be used when total grain load is known during order instantiation
   */
  private createGrainAdditionsWithSplits(
    grainQuantities: { [key: string]: number },
    totalGrainWeight: number,
    binAssignments: BinAssignments,
    hasPreMalt = false
  ): any[] {
    const mashingProtocolWithSplits: any[] = [];

    // First add water and other initial steps if needed

    // For each grain type, calculate the absolute weight and add to protocol with splits if needed
    for (const [grainType, percentage] of Object.entries(grainQuantities)) {
      if (percentage <= 0) continue;

      // Calculate absolute weight in pounds
      const qtyInLbs = totalGrainWeight * percentage;

      // Get the splits for this grain type
      const splitSteps = this.splitGrainAdditionsForProduction(
        grainType,
        qtyInLbs,
        binAssignments
      );

      // Add the steps to the protocol
      mashingProtocolWithSplits.push(...splitSteps);
    }

    // Handle PreMalt separately if needed
    if (hasPreMalt && grainQuantities["Malt"] > 0) {
      const preMaltQtyLbs = totalGrainWeight * grainQuantities["Malt"] * 0.1; // 10% of malt
      const preMaltSteps = this.splitGrainAdditionsForProduction(
        "PreMalt",
        preMaltQtyLbs,
        binAssignments
      );

      // Add PreMalt steps at the appropriate position (typically before other additions)
      mashingProtocolWithSplits.unshift(...preMaltSteps);
    }

    return mashingProtocolWithSplits;
  }

  /**
   * During recipe creation, we use a simplified version without splitting
   * since we don't know the total grain weight at this point
   */
  private splitGrainAdditions(
    grainType: string,
    qty: number,
    binAssignments: BinAssignments,
    grainQuantities: { [key: string]: number },
    hasPreMalt = false
  ): any[] {
    this.logger.log(
      `Creating grain addition for ${grainType} with percentage ${qty}`
    );

    // Ensure qty has a value and is not zero
    if (!qty && qty !== 0) {
      qty = grainQuantities[grainType] || 0;
      this.logger.log(
        `No quantity provided for ${grainType}, using calculated quantity: ${qty}`
      );
    }

    const splits: any[] = [];

    // Handle PreMalt separately
    if (grainType === "PreMalt") {
      const preMaltQty = grainQuantities["Malt"]
        ? grainQuantities["Malt"] * 0.1
        : 0; // 10% of malt percentage
      splits.push({
        action: "Add Grain",
        grainType: "Malt", // PreMalt is handled as Malt
        qty: preMaltQty,
      });
      return splits;
    }

    // For initial recipe creation, we don't split - just add a single step
    splits.push({
      action: "Add Grain",
      grainType: grainType,
      qty: qty,
    });

    return splits;
  }

  private async getEnzymeDosing(
    enzymeName: string,
    totalGrainLoadLbs: number,
    mashBill: string
  ) {
    // Use the normalized enzyme dosing calculation
    const normalizedDosing =
      await this.enzymeDosingService.calculateNormalizedEnzymeDosing(
        mashBill,
        enzymeName
      );

    if (normalizedDosing) {
      // Convert back to original interface format for backward compatibility
      return {
        dose: normalizedDosing.ratio, // Already a unitless ratio
        instructions: normalizedDosing.instructions,
      };
    }

    return null;
  }

  private async setEnzymeDosing(mashingProtocol: any[]) {
    this.logger.log(`Mashing protocol: ${JSON.stringify(mashingProtocol)}`);

    // Create new protocol array to store modified steps
    const newProtocol = [...mashingProtocol];

    // Find indices of Add Additive steps
    const additiveIndices = newProtocol
      .map((step, index) => (step?.action === "Add Additive" ? index : -1))
      .filter((index) => index !== -1);

    // Replace each Add Additive step with updated dosing
    for (const index of additiveIndices) {
      const step = newProtocol[index];
      const enzymeName = step.additiveType;
      const dosing = await this.getEnzymeDosing(
        enzymeName,
        this.TOTAL_GRAIN_WEIGHT,
        this.MASH_BILL
      );

      newProtocol[index] = {
        action: "Add Additive",
        additiveType: enzymeName,
        qty: dosing?.dose || 0,
      };
    }

    return newProtocol;
  }

  private detectWhiskeyType(mashBill: string): EnumRecipeWhiskeyType {
    // Use the new parser to handle both formats
    const grainQuantities = this.calculateGrainQuantities(mashBill, 1);

    // Get percentages (multiply by 100 since quantities are decimals)
    const cornPercent = (grainQuantities["Corn"] || 0) * 100;
    const ryePercent = (grainQuantities["Rye"] || 0) * 100;
    const wheatPercent = (grainQuantities["Wheat"] || 0) * 100;
    const maltPercent = (grainQuantities["Malt"] || 0) * 100;
    const maltedRyePercent = (grainQuantities["Malted Rye"] || 0) * 100;

    // Combined rye percentage (regular rye + malted rye)
    const totalRyePercent = ryePercent + maltedRyePercent;

    // Check for primary grain types first (>51%)
    if (totalRyePercent >= 51) {
      return EnumRecipeWhiskeyType.RyeWhiskey;
    }
    if (wheatPercent >= 51) {
      return EnumRecipeWhiskeyType.WheatWhiskey;
    }
    if (maltPercent >= 51) {
      return EnumRecipeWhiskeyType.MaltWhiskey;
    }

    // Check for bourbon variations (corn > 51%)
    if (cornPercent >= 51) {
      // For Wheated Bourbon, wheat must be present and rye must be 0
      if (wheatPercent > 0 && totalRyePercent === 0) {
        return EnumRecipeWhiskeyType.WheatedBourbon;
      }
      // For Rye Bourbon, rye must be present and wheat must be 0
      if (totalRyePercent > 0 && wheatPercent === 0) {
        return EnumRecipeWhiskeyType.RyeBourbon;
      }
      // For Four Grain Bourbon, both rye and wheat must be present
      if (totalRyePercent > 0 && wheatPercent > 0) {
        return EnumRecipeWhiskeyType.FourGrainBourbon;
      }
    }

    // Check for four grain whiskey (all grains present)
    const grainCount = Object.values(grainQuantities).filter(
      (v) => v > 0
    ).length;
    if (grainCount >= 4) {
      return EnumRecipeWhiskeyType.FourGrainWhiskey;
    }

    // Default case
    return EnumRecipeWhiskeyType.RyeBourbon;
  }

  private calculateGrainPercentage(
    grainType: string,
    mashBill: string
  ): number {
    const components = mashBill.split("-");
    const normalizedValues = this.getNormalizedMashBillValues(mashBill);
    const totalPercentage = normalizedValues.reduce(
      (sum, value) => sum + value,
      0
    );
    const targetGrain = grainType.toUpperCase();
    const orderedGrains = ["CORN", "RYE", "WHEAT", "MALT", "SPECIALTY"]; // Default sequence when segments are numeric-only

    let grainPercentage = 0;

    components.forEach((component, index) => {
      const numericValue = normalizedValues[index] ?? 0;
      const componentGrain = component.replace(/[^A-Z]/gi, "").toUpperCase();
      const matchesByName =
        componentGrain.length > 0 && componentGrain.includes(targetGrain);
      const matchesByOrder =
        componentGrain.length === 0 && orderedGrains[index] === targetGrain;

      if (matchesByName || matchesByOrder) {
        grainPercentage += numericValue;
      }
    });

    return totalPercentage > 0 ? (grainPercentage / totalPercentage) * 100 : 0;
  }

  private validateMashingProtocolAgainstMashBill(
    mashingProtocol: any[],
    mashBill: string
  ): boolean {
    this.logger.log("Validating mashing protocol against mash bill...");

    // Use the new parser to extract grains from mash bill
    const grainQuantities = this.calculateGrainQuantities(mashBill, 1);
    const mashBillGrains = new Set<string>();

    // Only add grains that have non-zero percentages
    for (const [grainName, quantity] of Object.entries(grainQuantities)) {
      if (quantity > 0) {
        mashBillGrains.add(grainName);
      }
    }

    // Collect all grains from mashing protocol
    const protocolGrains = new Set<string>();
    let foundPreMalt = false;

    for (const step of mashingProtocol) {
      if (step.action === "Add Grain") {
        if (step.grainType === "PreMalt") {
          foundPreMalt = true;
          protocolGrains.add("Malt"); // PreMalt counts as Malt
        } else {
          protocolGrains.add(step.grainType);
        }
      }
    }

    // If we found PreMalt, ensure there's also a regular Malt addition
    if (foundPreMalt && mashBillGrains.has("Malt")) {
      let foundRegularMalt = false;
      for (const step of mashingProtocol) {
        if (step.action === "Add Grain" && step.grainType === "Malt") {
          foundRegularMalt = true;
          break;
        }
      }
      if (!foundRegularMalt) {
        this.logger.error(
          "PreMalt is present but missing regular Malt addition"
        );
        return false;
      }
    }

    // Check if all mash bill grains are in the protocol
    for (const grain of mashBillGrains) {
      if (!protocolGrains.has(grain)) {
        this.logger.error(
          `Grain ${grain} from mash bill is not present in mashing protocol`
        );
        return false;
      }
    }

    // Check if there are any extra grains in protocol that aren't in the mash bill
    for (const grain of protocolGrains) {
      if (!mashBillGrains.has(grain)) {
        this.logger.error(
          `Grain ${grain} is in mashing protocol but not present in mash bill`
        );
        return false;
      }
    }

    // Validate the sequence of steps
    let foundWater = false;
    let foundGrain = false;
    let foundAdditive = false;

    for (const step of mashingProtocol) {
      switch (step.action) {
        case "Add Liquid":
          if (foundGrain) {
            this.logger.error(
              "Invalid sequence: Water addition after grain addition"
            );
            return false;
          }
          foundWater = true;
          break;
        case "Add Grain":
          if (!foundWater) {
            this.logger.error(
              "Invalid sequence: Grain addition before water addition"
            );
            return false;
          }
          foundGrain = true;
          break;
        case "Add Additive":
          foundAdditive = true;
          break;
        case "Hold":
          // Holds are allowed anywhere
          break;
        default:
          this.logger.error(
            `Invalid action type in mashing protocol: ${step.action}`
          );
          return false;
      }
    }

    // Ensure we have the minimum required steps
    if (!foundWater) {
      this.logger.error("Missing water addition in mashing protocol");
      return false;
    }
    if (!foundGrain) {
      this.logger.error("Missing grain addition in mashing protocol");
      return false;
    }
    if (!foundAdditive) {
      this.logger.error("Missing additive addition in mashing protocol");
      return false;
    }

    this.logger.log(
      "Mashing protocol matches mash bill components and has valid sequence"
    );
    return true;
  }

  private async getItemByItemNumber(client: PrismaService, itemNumber: string) {
    try {
      const item = await client.item.findFirst({
        where: {
          itemNumber: {
            equals: itemNumber,
            mode: "insensitive",
          },
        },
      });

      if (!item) {
        this.logger.log(`Item with item number ${itemNumber} not found`);
        return null;
      }

      return item;
    } catch (error) {
      this.logger.error(`Error finding item: ${error}`);
      throw error;
    }
  }

  async createRecipeData(
    customerCode: string,
    mashBill: string,
    finalProof: number,
    barrelInfo: string,
    customerName: string,
    orderQty: number,
    totalGrainWeight: number,
    bblsPerFerm: number,
    username: string,
    waterQty: number,
    backsetQty: number,
    bblItemNumbers: string[],
    yeastItemNumbersQtys: { [key: string]: number },
    mashingProtocol: any[],
    recipeParameters: any[],
    binAssignments: BinAssignments,
    specialtyItemNumber?: string,
    createOrders: boolean = false
  ): Promise<RecipeCreationResult> {
    // Set the attributes
    this.CUSTOMER_CODE = customerCode.replace(/\n|\r/g, "");
    this.MASH_BILL = mashBill.replace(/\n|\r/g, "");
    this.FINAL_PROOF = finalProof;
    this.BARREL_INFO = barrelInfo.replace(/\n|\r/g, "");
    this.CUSTOMER_NAME = customerName;
    this.ORDER_QTY = orderQty;
    this.TOTAL_GRAIN_WEIGHT = totalGrainWeight;
    this.BBLS_PER_FERM = bblsPerFerm;
    this.USER = username;
    this.WATER_QTY = waterQty;
    this.BACKSET_QTY = backsetQty;
    this.BBL_ITEM_NUMBERS = bblItemNumbers;
    this.YEAST_ITEM_NUMBERS_QTYS = yeastItemNumbersQtys;
    this.MASHING_PROTOCOL = mashingProtocol;
    this.RECIPE_PARAMETERS = (recipeParameters || []).map((p: any) => ({
      ...p,
      name: this.normalizeRecipeParamName(p?.name),
    }));
    this.RECIPE = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-v01`;
    if (this.BARREL_INFO !== "") {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.BARREL_INFO}-${this.FINAL_PROOF}-v01`;
    } else {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.FINAL_PROOF}-v01`;
    }
    this.BOM_REVISION = `BOM-${this.CUSTOMER_CODE}-${this.MASH_BILL}-v01`;

    console.info("Seeding database with custom seed for Mashing Recipe...");

    // Add validation for mashing protocol
    if (
      !this.validateMashingProtocolAgainstMashBill(mashingProtocol, mashBill)
    ) {
      throw new Error("Invalid mashing protocol for given mash bill");
    }

    // Validate specialty item requirement before proceeding
    const [, , , , specialtyPercentRaw = 0] = this.getNormalizedMashBillValues(
      this.MASH_BILL
    );
    const normalizedSpecialtyItemNumber = specialtyItemNumber?.trim() || "";

    if (specialtyPercentRaw > 0 && !normalizedSpecialtyItemNumber) {
      throw new Error(
        `Specialty item with item number ${
          specialtyItemNumber || "(not provided)"
        } not found`
      );
    }

    // Validate bin assignments
    if (!this.validateBinAssignments(binAssignments)) {
      throw new Error("Invalid bin assignments");
    }

    // Process the mashing protocol to get the quantities of each grain type
    // But don't split the additions since we're using percentages
    const grainQuantities: any = this.calculateGrainQuantities(
      this.MASH_BILL,
      this.TOTAL_GRAIN_WEIGHT
    );

    const hasPreMalt = this.MASHING_PROTOCOL.some(
      (step) => step.action === "Add Grain" && step.grainType === "PreMalt"
    );

    this.logger.log(
      `Grain quantities (percentages): ${JSON.stringify(grainQuantities)}`
    );
    const grainAdditions = mashingProtocol.filter(
      (param) => param.action === "Add Grain"
    );
    this.logger.log(`Grain additions: ${JSON.stringify(grainAdditions)}`);

    // For initial recipe creation, we use quantities directly from the mashing protocol
    // No splitting needed since we're using percentages
    // Keep the original mashing protocol without modifications
    const finalizedMashingProtocol: any[] = await this.setEnzymeDosing(
      mashingProtocol
    );
    this.logger.log(
      `Finalized mashing protocol: ${JSON.stringify(finalizedMashingProtocol)}`
    );

    const client = this.prismaService;

    // Look up specialty item ID if specialty item number is provided
    if (normalizedSpecialtyItemNumber) {
      this.logger.log(
        `Looking up specialty item with itemNumber: "${specialtyItemNumber}" (normalized: "${normalizedSpecialtyItemNumber}")`
      );

      let specialtyItem = await client.item.findFirst({
        where: {
          itemNumber: {
            equals: normalizedSpecialtyItemNumber,
            mode: "insensitive",
          },
        },
      });

      if (
        !specialtyItem &&
        specialtyItemNumber !== normalizedSpecialtyItemNumber
      ) {
        specialtyItem = await client.item.findFirst({
          where: {
            itemNumber: {
              equals: specialtyItemNumber,
              mode: "insensitive",
            },
          },
        });
      }

      if (!specialtyItem) {
        const allItems = await client.item.findMany({
          where: {
            itemNumber: {
              contains: normalizedSpecialtyItemNumber,
              mode: "insensitive",
            },
          },
          take: 10,
        });
        if (allItems.length > 0) {
          specialtyItem = allItems[0];
        }
      }

      if (!specialtyItem) {
        throw new Error(
          `Specialty item with item number ${specialtyItemNumber} not found`
        );
      }

      this.SPECIALTY_ITEM_ID = specialtyItem.id;
      this.logger.log(
        `Found specialty item: ${specialtyItem.id}, ${specialtyItem.itemNumber}`
      );
    }
    console.log("Creating recipe...");
    console.log("itemNumber:", this.ITEM_NUMBER);

    const item = await this.getItemByItemNumber(client, this.ITEM_NUMBER);
    if (!item) {
      throw new Error(`Item ${this.ITEM_NUMBER} not found`);
    }
    console.log(`Found item: ${item.id}, ${item.itemNumber}`);

    const customer = await client.customer.findFirst({
      where: {
        name: this.CUSTOMER_NAME,
      },
    });

    if (!customer) {
      throw new Error(`Customer '${this.CUSTOMER_NAME}' not found`);
    }
    console.log(`Found customer: ${customer.id}, ${customer.name}`);

    // Create the initial recipe that will be used throughout the process
    const existingRecipe = await client.recipe.findFirst({
      where: {
        Recipe: this.RECIPE,
      },
    });

    let recipe: Recipe;
    if (existingRecipe) {
      console.log("Recipe already exists, using existing recipe...");
      recipe = existingRecipe;
    } else {
      console.log("Creating new recipe...");
      recipe = await client.recipe.create({
        data: {
          Recipe: this.RECIPE,
          revision: 1,
          createdBy: this.USER,
          whiskeyType:
            EnumRecipeWhiskeyType[this.detectWhiskeyType(this.MASH_BILL)],
          customer: {
            connect: { id: customer.id },
          },
          customerCode: this.CUSTOMER_CODE,
        },
      });
    }

    // find the appropriate BOM / BOM Version
    const bom = await client.bom.findFirst({
      where: {
        bomRevision: this.BOM_REVISION,
      },
    });

    if (!bom) {
      throw new Error(`BOM with revision ${this.BOM_REVISION} not found`);
    }

    // Get the mashing unit procedure
    const mashingUnitProcedure = await client.unitProcedure.findFirst({
      where: {
        name: EnumUnitProcedureName.Mashing01,
      },
    });

    if (!mashingUnitProcedure) {
      throw new Error("Mashing unit procedure not found");
    }

    // First create the recipe BOM and items if needed
    let recipeBom;
    // Check if a recipe BOM already exists for this recipe
    recipeBom = await client.recipeBom.findFirst({
      where: {
        recipe: {
          some: {
            id: recipe.id,
          },
        },
        revision: this.BOM_REVISION,
      },
    });

    if (!recipeBom) {
      console.log("Creating recipe BOM and items...");

      // Calculate grain quantities directly from mash bill to ensure we have them
      const grainQuantitiesFromMashBill = this.calculateGrainQuantities(
        this.MASH_BILL,
        this.TOTAL_GRAIN_WEIGHT
      );

      console.log(
        `Grain quantities from mash bill: ${JSON.stringify(
          grainQuantitiesFromMashBill
        )}`
      );

      // Store the finalized protocol for use in createRecipeBomAndItems
      this.MASHING_PROTOCOL = finalizedMashingProtocol;

      // Pass grain quantities to createRecipeBomAndItems
      recipeBom = await this.createRecipeBomAndItems(
        client,
        recipe.id,
        grainQuantitiesFromMashBill
      );
    } else {
      console.log(
        `Recipe BOM already exists for recipe ID: ${recipe.id}. Using existing recipe BOM.`
      );
    }

    // Now that we have ensured BOM items exist, get them with item details
    const recipeBomItems = await client.recipeBomItem.findMany({
      where: {
        recipeBomsId: recipeBom.id,
      },
      include: {
        item: true, // Include full item details for better matching
      },
    });

    console.log(`Found ${recipeBomItems.length} RecipeBomItems for linking`);

    // Create the mashing protocol and link steps to the BOM items
    await this.createMashingProtocolAndSteps(
      client,
      recipe.id,
      finalizedMashingProtocol,
      recipeBomItems
    );

    // Check for existing BOM with the same revision
    const existingBom = await client.bom.findFirst({
      where: {
        bomRevision: this.BOM_REVISION,
      },
    });

    // We've already established recipeBom exists, but now we need to create normalized BOM items if they don't exist
    if (!existingBom) {
      console.log("Creating normalized BOM items...");

      // Get all recipe BOM items to convert to normalized BOM items
      const allRecipeBomItems = await client.recipeBomItem.findMany({
        where: {
          recipeBomsId: recipeBom.id,
        },
        select: {
          itemId: true,
          quantity: true,
          // units: true,
        },
      });

      // Filter out any null values and ensure required fields are present
      const validRecipeBomItems = allRecipeBomItems
        .filter((item) => item.itemId !== null && item.quantity !== null)
        .map((item) => ({
          itemId: item.itemId as string,
          quantity: item.quantity as number,
          // units: item.units || "NA",
        }));

      // Create the normalized BOM
      const normalizedBom = await this.createNormalizedBom(
        client,
        recipe.id,
        validRecipeBomItems,
        1 // Using 1 as the final good quantity since we're normalizing to 1 unit
      );
      console.log(`Created normalized BOM: ${normalizedBom.id}`);
    } else {
      console.log(
        `BOM with revision ${this.BOM_REVISION} already exists. Skipping normalized BOM creation.`
      );
    }

    let mashBillType = "Invalid"; // Default to "Invalid"
    enum Bool {
      False = 0,
      True = 1,
    }

    const determineMashBill = (parameter: string): string => {
      const parts = this.getNormalizedMashBillValues(parameter);

      let validCount = 0;
      let hasNegative = false;

      for (const value of parts) {
        if (value < 0) {
          hasNegative = true;
          break;
        }
        if (value > 0) {
          validCount++;
        }
      }

      if (hasNegative) {
        return "Invalid";
      }

      switch (validCount) {
        case 1:
          return "1-grain";
        case 2:
          return "2-grain";
        case 3:
          return "3-grain";
        case 4:
          return "4-grain";
        default:
          return "Invalid";
      }
    };

    mashBillType = determineMashBill(mashBill);
    console.log(`Grain type: ${mashBillType}`);

    const isFourGrainMashBill = (parameter: string): boolean => {
      return determineMashBill(parameter) === "4-grain";
    };

    const isFourGrain = isFourGrainMashBill(mashBill);
    console.log(`Grain type: ${determineMashBill(mashBill)}`);

    // Create or update the Recipe record and link it to the Mashing Unit Procedure
    const newParams: RecipeParameter[] = [];
    for (const param of this.RECIPE_PARAMETERS) {
      const classParam = await client.recipeParameter.findFirst({
        where: {
          recipeParamName: param.name,
          isClassDefinition: true,
        },
      });
      if (classParam) {
        console.log(`Updating existing recipe parameter: ${param.name}`);
        newParams.push(
          await client.recipeParameter.create({
            data: {
              className: classParam.className,
              recipeParamName: param.name,
              recipeNumericalSetpoint: param.setpointValue,
              recipeSetpointBooleanValue: false,
              description: classParam.description,
              isClassDefinition: false,
              recipeSetpointType: classParam.recipeSetpointType,
              createdBy: this.USER,
            },
          })
        );
      } else {
        console.log(`Phase parameter ${param.name} already exists, skipping.`);
      }
    }

    newParams.push(
      await client.recipeParameter.create({
        data: {
          className: "Mashing/Parameter",
          recipeParamName: "IsFourGrain",
          recipeNumericalSetpoint: isFourGrain ? 1 : 0,
          isClassDefinition: false,
          recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Boolean,
          recipeSetpointBooleanValue: isFourGrain,
          createdBy: this.USER,
        },
      })
    );

    // Update the recipe with additional data
    recipe = await client.recipe.update({
      where: { id: recipe.id },
      data: {
        unitProcedures: {
          connect: { id: mashingUnitProcedure.id },
        },
        parameters: {
          connect: newParams.map((param) => ({ id: param.id })),
        },
      },
      include: {
        customer: true,
        recipeGroup: true,
        recipeBoms: true,
        unitProcedures: true,
        productionOrders: true,
      },
    });
    console.log("Recipe updated successfully:", recipe.id);

    // Publish recipe to RabbitMQ
    console.log("Publishing Recipe to RabbitMQ...");
    await this.rabbitMQProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "create",
        data: recipe,
      }
    );
    console.log("Recipe published successfully");

    // Create a recipe group and add the recipe to it
    console.log("Creating recipe group and adding recipe...");
    let recipeGroup: RecipeGroup;
    const recipeGroupName = this.MASH_BILL.replace(/\n|\r/g, "");
    console.log(`Extracted recipe group name: ${recipeGroupName}`);
    const existingRecipeGroup = await client.recipeGroup.findFirst({
      where: {
        recipe: { equals: recipeGroupName },
      },
    });

    if (existingRecipeGroup) {
      console.log("Recipe group 'Mashing Recipes' already exists, updating...");
      recipeGroup = await client.recipeGroup.update({
        where: { id: existingRecipeGroup.id },
        data: {
          recipes: {
            connect: { id: recipe.id },
          },
        },
      });
      console.log("Recipe added to existing group successfully");
    } else {
      console.log("Creating new recipe group 'Mashing Recipes'...");
      recipeGroup = await client.recipeGroup.create({
        data: {
          recipe: recipeGroupName,
          createdBy: this.USER,
          recipes: {
            connect: { id: recipe.id },
          },
        },
      });
      console.log(
        "New recipe group created and recipe added successfully:",
        recipeGroup.id
      );
    }

    // Initialize result object with recipe and recipeBom
    const result: RecipeCreationResult = {
      recipe,
      recipeBom,
    };

    // Only create orders if createOrders flag is true
    if (createOrders) {
      console.log("createOrders flag is true, creating orders...");

      // Create a sample sales order
      console.log("Creating sample sales order...");

      // Get the current date and time
      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ""); // Remove "20" from year
      const timeStr = now.toTimeString().slice(0, 6).replace(/:/g, "");
      const timestamp = `${dateStr}${timeStr}`;

      const newSalesOrder = await client.salesOrder.create({
        data: {
          item: {
            connect: { id: (item as Item).id },
          },
          customer: {
            connect: { id: customer?.id },
          },
          createdBy: this.USER,
          quantity: this.ORDER_QTY,
          name: `SO${timestamp}`,
        },
      });

      console.log("Sample sales order created successfully:", newSalesOrder.id);

      // Create a sample schedule order first
      console.log("Creating sample schedule order...");
      const newScheduleOrder = await this.createScheduleOrder(
        client,
        recipe.id,
        recipeGroup.id,
        this.ORDER_QTY,
        this.USER
      );

      console.log(
        "Sample schedule order created successfully:",
        newScheduleOrder.id
      );

      // Create a sample schedule order queue record
      console.log("Creating sample schedule order queue record...");

      const newScheduleOrderQueue = await this.createScheduleOrderQueue(
        client,
        newScheduleOrder.id,
        mashingUnitProcedure.id,
        this.USER
      );

      console.log(
        "Sample schedule order queue record created successfully:",
        newScheduleOrderQueue.id
      );

      // Now create the production order and link it to the schedule order
      console.log("Creating sample production order...");

      const newProductionOrder = await this.createProductionOrder(
        client,
        recipe.id,
        (item as Item).id,
        bom.id,
        customer.id,
        this.CUSTOMER_CODE,
        this.ORDER_QTY,
        this.BBLS_PER_FERM,
        this.USER,
        newScheduleOrder.id // Link to the schedule order
      );

      // Update the schedule order to link to the production order
      await client.scheduleOrder.update({
        where: { id: newScheduleOrder.id },
        data: {
          productionOrders: {
            connect: { id: newProductionOrder.id },
          },
        },
      });

      // Push production order to RabbitMQ for processing
      console.log("Publishing production order to RabbitMQ...");
      await this.rabbitMQProducer.emitMessage(
        WhMessageBrokerTopics.WhWhk01Distillery01Productionorder,
        {
          recordName: "ProductionOrder",
          event_type: "create",
          data: newProductionOrder,
        }
      );
      console.log("Production order published successfully");

      console.log(
        "Sample production order created successfully:",
        newProductionOrder.id
      );

      // Add orders to result
      result.productionOrder = newProductionOrder;
      result.scheduleOrder = newScheduleOrder;
    } else {
      console.log("createOrders flag is false, skipping order creation...");
    }

    // Close the Prisma client connection
    await client.$disconnect();

    return result;
  }

  private validateGrainAssignmentsAgainstMashBill(
    binAssignments: BinAssignments,
    mashBill: string
  ): boolean {
    this.logger.log("Validating grain assignments against mash bill...");

    // Extract grains from mash bill
    const [corn = 0, rye = 0, wheat = 0, malt = 0, specialty = 0] =
      this.getNormalizedMashBillValues(mashBill);
    const mashBillGrains = new Set<string>();

    // Only add grains that have non-zero percentages
    if (corn > 0) mashBillGrains.add("Corn");
    if (rye > 0) mashBillGrains.add("Rye");
    if (wheat > 0) mashBillGrains.add("Wheat");
    if (malt > 0) mashBillGrains.add("Malt");
    if (specialty > 0) mashBillGrains.add("Specialty");

    // Collect all grains from bin assignments
    const assignedGrains = new Set<string>();
    for (const [bin, grains] of Object.entries(binAssignments)) {
      if (typeof grains === "string") {
        assignedGrains.add(grains);
      } else if (Array.isArray(grains)) {
        grains.forEach((grain) => assignedGrains.add(grain));
      }
    }

    // Check if all mash bill grains are assigned to bins
    for (const grain of mashBillGrains) {
      if (!assignedGrains.has(grain)) {
        this.logger.error(
          `Grain ${grain} from mash bill is not assigned to any bin`
        );
        return false;
      }
    }

    // Check if there are any extra grains assigned that aren't in the mash bill
    for (const grain of assignedGrains) {
      if (!mashBillGrains.has(grain)) {
        this.logger.error(
          `Grain ${grain} is assigned to a bin but not present in mash bill`
        );
        return false;
      }
    }

    this.logger.log("Grain assignments match mash bill components");
    return true;
  }

  private validateBinAssignments(binAssignments: BinAssignments): boolean {
    const validGrains = [
      "Corn",
      "Rye",
      "Wheat",
      "Malt",
      "PreMalt",
      "Specialty",
    ];

    for (const [bin, grains] of Object.entries(binAssignments)) {
      if (Array.isArray(grains)) {
        for (const grain of grains) {
          if (!validGrains.includes(grain)) {
            this.logger.error(`Invalid grain: ${grain} in ${bin}`);
            return false;
          }
        }
      } else {
        if (!validGrains.includes(grains)) {
          this.logger.error(`Invalid grain type in ${bin}`);
          return false;
        }
      }
    }

    // Get all assigned grains
    const assignedGrains = new Set<string>();
    for (const grains of Object.values(binAssignments)) {
      if (typeof grains === "string") {
        assignedGrains.add(grains);
      } else if (Array.isArray(grains)) {
        grains.forEach((grain) => assignedGrains.add(grain));
      }
    }

    // Check if all required grains from mash bill are assigned
    const [corn, rye, wheat, malt, specialty] =
      this.getNormalizedMashBillValues(this.MASH_BILL);
    const requiredGrains = new Set<string>();
    if (corn > 0) requiredGrains.add("Corn");
    if (rye > 0) requiredGrains.add("Rye");
    if (wheat > 0) requiredGrains.add("Wheat");
    if (malt > 0) {
      requiredGrains.add("Malt");
      if (assignedGrains.has("PreMalt")) {
        requiredGrains.add("PreMalt");
      }
    }
    if (specialty > 0) requiredGrains.add("Specialty");

    for (const grain of requiredGrains) {
      if (!assignedGrains.has(grain)) {
        this.logger.error(`Required grain ${grain} is not assigned to any bin`);
        return false;
      }
    }

    return true;
  }

  private isValidGrain(grain: string): boolean {
    const validGrains = ["Rye", "Corn", "Malt", "Wheat", "Specialty"];
    return validGrains.includes(grain);
  }

  private mapGrainTypeToStepType(
    grainType: string
  ): EnumMashingProtocolStepStepType {
    const mapping: { [key: string]: EnumMashingProtocolStepStepType } = {
      Corn: EnumMashingProtocolStepStepType.Corn,
      Rye: EnumMashingProtocolStepStepType.Rye,
      Wheat: EnumMashingProtocolStepStepType.Wheat,
      Malt: EnumMashingProtocolStepStepType.Malt,
      PreMalt: EnumMashingProtocolStepStepType.PreMalt,
    };
    return mapping[grainType] || EnumMashingProtocolStepStepType.Corn;
  }

  private mapActionToStepType(
    action: string,
    grainOrStep?: string | any
  ): EnumMashingProtocolStepStepType {
    // For grain additions, use the specific grain type mapping
    if (action === "Add Grain" && typeof grainOrStep === "string") {
      return this.mapGrainTypeToStepType(grainOrStep);
    }

    // For hold actions, check if we have additional step info
    if (action === "Hold" && typeof grainOrStep === "object" && grainOrStep) {
      if (grainOrStep.holdType === "Heat") {
        return EnumMashingProtocolStepStepType.Hold;
      } else if (grainOrStep.holdType === "Cool") {
        return EnumMashingProtocolStepStepType.Hold;
      }
    }

    // For other actions, use the general mapping
    const mapping: { [key: string]: EnumMashingProtocolStepStepType } = {
      Hold: EnumMashingProtocolStepStepType.Hold,
      Heat: EnumMashingProtocolStepStepType.Hold,
      Cool: EnumMashingProtocolStepStepType.Hold,
      "Add Liquid": EnumMashingProtocolStepStepType.LiquidAdd,
      "Add Additive": EnumMashingProtocolStepStepType.AdditiveAdd,
      "Add Water": EnumMashingProtocolStepStepType.LiquidAdd,
      "Add Backset": EnumMashingProtocolStepStepType.LiquidAdd,
      Prompt: EnumMashingProtocolStepStepType.Prompt,
    };

    return mapping[action] || EnumMashingProtocolStepStepType.Hold;
  }

  private async createProductionOrder(
    client: PrismaService,
    recipeId: string,
    itemId: string,
    bomId: string,
    customerId: string,
    customerCode: string,
    orderQty: number,
    bblsPerFerm: number,
    username: string,
    scheduleOrderId?: string
  ): Promise<ProductionOrder> {
    const now = new Date();
    const yearLastTwoDigits = now.getFullYear().toString().slice(-2);
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor(
      (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    );
    const productionOrderName = `PRO${yearLastTwoDigits}${dayOfYear}`;

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const mostRecent = await client.productionOrder.findFirst({
      where: { createdAt: { gte: today }, name: { startsWith: "PRO" } },
      orderBy: { createdAt: "desc" },
    });
    const seq = parseInt(mostRecent?.name?.split("PRO")[1] ?? "0", 10) + 1;

    const name = await (async () => {
      const baseName = `${productionOrderName}${seq}`;
      let suffix = 0;
      let finalName = baseName;
      while (
        await client.productionOrder.findFirst({ where: { name: finalName } })
      ) {
        suffix++;
        finalName = `${baseName}-${suffix}`;
      }
      return finalName;
    })();

    const productionOrderData: any = {
      name,
      recipe: { connect: { id: recipeId } },
      customer: { connect: { id: customerId } },
      item: { connect: { id: itemId } },
      bom: { connect: { id: bomId } },
      status: EnumProductionOrderStatus.Initiated,
      customerCode: customerCode,
      units: "Barrels",
      quantity: orderQty,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      totalCooks: Math.ceil(orderQty / bblsPerFerm) * 3,
      totalFermenters: Math.ceil(orderQty / bblsPerFerm),
      executedCooks: 0,
      executedFermenters: 0,
      createdBy: username,
    };

    // Connect to schedule order if provided
    if (scheduleOrderId) {
      productionOrderData.scheduleOrder = { connect: { id: scheduleOrderId } };
    }

    const productionOrder = await client.productionOrder.create({
      data: productionOrderData,
    });

    await this.rabbitMQProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Productionorder,
      {
        recordName: "ProductionOrder",
        event_type: "create",
        data: productionOrder,
      }
    );
    return productionOrder;
  }

  private async createScheduleOrder(
    client: PrismaService,
    recipeId: string,
    recipeGroupId: string,
    orderQty: number,
    username: string,
    productionOrderId?: string
  ): Promise<ScheduleOrder> {
    const now = new Date();
    const yearLastTwoDigits = now.getFullYear().toString().slice(-2);
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor(
      (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    );
    const scheduleOrderName = `SHO${yearLastTwoDigits}${dayOfYear}`;

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const mostRecent = await client.scheduleOrder.findFirst({
      where: { createdAt: { gte: today }, name: { startsWith: "SHO" } },
      orderBy: { createdAt: "desc" },
    });
    const seq = parseInt(mostRecent?.name?.split("SHO")[1] ?? "0", 10) + 1;

    const name = await (async () => {
      const baseName = `${scheduleOrderName}${seq}`;
      let suffix = 0;
      let finalName = baseName;
      while (
        await client.scheduleOrder.findFirst({ where: { name: finalName } })
      ) {
        suffix++;
        finalName = `${baseName}-${suffix}`;
      }
      return finalName;
    })();

    // Get recipe name using the recipeId
    const recipe = await client.recipe.findUnique({
      where: { id: recipeId },
    });

    if (!recipe) {
      throw new Error(`Recipe with ID ${recipeId} not found`);
    }

    // Constants for timing calculations
    const COOK_DURATION_HOURS = 2.25;
    const FERMENTATION_DAYS = 3;
    const DISTILLATION_HOURS_PER_FERMENTER = 12;
    const BARRELING_CAPACITY_PER_DAY = 500;

    const totalFermenters = Math.ceil(orderQty / this.BBLS_PER_FERM);
    const totalCooks = totalFermenters * 3;

    const startDate = new Date();

    const mashingTotalHours = totalCooks * COOK_DURATION_HOURS;
    const mashingEndDate = new Date(startDate);
    mashingEndDate.setHours(mashingEndDate.getHours() + mashingTotalHours);

    const fermentationStartDate = new Date(startDate);
    fermentationStartDate.setHours(
      fermentationStartDate.getHours() + COOK_DURATION_HOURS
    );

    const fermentationDurationHours =
      mashingTotalHours - COOK_DURATION_HOURS + FERMENTATION_DAYS * 24;

    // Distillation starts after first cook + fermentation time
    const distillationStartDate = new Date(startDate);
    distillationStartDate.setHours(
      distillationStartDate.getHours() +
        COOK_DURATION_HOURS +
        FERMENTATION_DAYS * 24
    );

    const distillationDurationHours =
      totalFermenters * DISTILLATION_HOURS_PER_FERMENTER;

    const barrelingStartDate = new Date(distillationStartDate);
    const barrelingDay = barrelingStartDate.getDay();
    if (barrelingDay === 0) {
      barrelingStartDate.setDate(barrelingStartDate.getDate() + 1);
    } else if (barrelingDay === 6) {
      barrelingStartDate.setDate(barrelingStartDate.getDate() + 2);
    }

    const barrelingDays = Math.ceil(orderQty / BARRELING_CAPACITY_PER_DAY);
    this.logger.log(
      `Barreling will take ${barrelingDays} working days for ${orderQty} barrels`
    );

    const endDate = new Date(barrelingStartDate);
    let remainingWorkDays = barrelingDays;
    while (remainingWorkDays > 0) {
      endDate.setDate(endDate.getDate() + 1);
      const dayOfWeek = endDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remainingWorkDays--;
      }
    }

    const totalProductionDurationHours = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
    );

    this.logger.log(`Schedule calculation:
      - Order Quantity: ${orderQty} barrels
      - Fermenters: ${totalFermenters}
      - Mashing: ${mashingTotalHours} hours
      - Fermentation: ${fermentationDurationHours} hours
      - Distillation: ${distillationDurationHours} hours
      - Barreling: ${barrelingDays} working days
      - Total Duration: ${totalProductionDurationHours} hours`);

    const scheduleOrderData: any = {
      name,
      recipeName: recipe.Recipe,
      status: EnumScheduleOrderStatus.Scheduled,
      createdBy: username,
      estimatedStart: startDate,
      estimatedEnd: endDate,
      recipeGroup: { connect: { id: recipeGroupId } },
      productionOrderAllocation: JSON.stringify({ barrels: orderQty }),

      // Add all the estimated time fields
      estimatedMashingStartTime: startDate,
      estimatedMashingDuration: mashingTotalHours,

      estimatedFermentationStartTime: fermentationStartDate,
      estimatedFermentationDuration: fermentationDurationHours,

      estimatedDistillationStartTime: distillationStartDate,
      estimatedDistillationDuration: distillationDurationHours,

      estimatedBarrelingStartTime: barrelingStartDate,
      estimatedProcessingStartTime: startDate, // Same as overall start

      estimatedTotalProductionDuration: totalProductionDurationHours,
      duration: totalProductionDurationHours,
      durationUnits: "Hours",

      totalBarrels: orderQty,
      totalProofGallons: orderQty * this.FINAL_PROOF, // Assuming final proof corresponds to proof gallons per barrel
    };

    // Connect to schedule order recipe if available
    if (recipeId) {
      scheduleOrderData.scheduleOrderRecipe = { connect: { id: recipeId } };
    }

    // Connect to production order if provided
    if (productionOrderId) {
      scheduleOrderData.productionOrders = {
        connect: { id: productionOrderId },
      };
    }

    const scheduleOrder = await client.scheduleOrder.create({
      data: scheduleOrderData,
    });

    await this.rabbitMQProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "create",
        data: scheduleOrder,
      }
    );
    return scheduleOrder;
  }

  /**
   * Calculates the estimated end date for a schedule order based on operational constraints
   * @param startDate The estimated start date
   * @param orderQty The order quantity in barrels
   * @param bblsPerFerm Barrels per fermentation
   * @returns The calculated end date
   */
  private calculateEstimatedEndDate(
    startDate: Date,
    orderQty: number,
    bblsPerFerm: number
  ): Date {
    this.logger.log(
      `Calculating estimated end date for order quantity: ${orderQty}, barrels per fermentation: ${bblsPerFerm}`
    );

    // Constants based on operational constraints
    const COOK_DURATION_HOURS = 2.25; // Each cook takes 2.25 hours
    const FERMENTATION_LAG_DAYS = 3; // 3-day lag from mashing to distillation/barreling
    const BARRELING_CAPACITY_PER_DAY = 500; // 500 barrels per day

    // Calculate total cooks needed
    const totalCooks = Math.ceil(orderQty / bblsPerFerm) * 3; // 3 cooks per fermenter

    // Calculate total cooking time in hours
    const totalCookingHours = totalCooks * COOK_DURATION_HOURS;
    this.logger.log(
      `Total cooking hours: ${totalCookingHours} for ${totalCooks} cooks`
    );

    // Add cooking time to start date to get mashing end date
    const mashingEndDate = new Date(startDate);
    mashingEndDate.setHours(mashingEndDate.getHours() + totalCookingHours);

    // Add fermentation lag to get earliest possible barreling date
    const earliestBarrelingDate = new Date(mashingEndDate);
    earliestBarrelingDate.setDate(
      earliestBarrelingDate.getDate() + FERMENTATION_LAG_DAYS
    );

    // Ensure barreling starts on a weekday (1-5 = Monday-Friday, 0,6 = Sunday/Saturday)
    const barrelingStartDate = new Date(earliestBarrelingDate);
    const dayOfWeek = barrelingStartDate.getDay();

    if (dayOfWeek === 0) {
      // Sunday
      barrelingStartDate.setDate(barrelingStartDate.getDate() + 1); // Move to Monday
    } else if (dayOfWeek === 6) {
      // Saturday
      barrelingStartDate.setDate(barrelingStartDate.getDate() + 2); // Move to Monday
    }

    // Calculate how many days of barreling are needed
    const barrelingDays = Math.ceil(orderQty / BARRELING_CAPACITY_PER_DAY);
    this.logger.log(
      `Barreling will take ${barrelingDays} working days for ${orderQty} barrels`
    );

    // Calculate the final end date accounting for weekends
    const endDate = new Date(barrelingStartDate);
    let remainingWorkDays = barrelingDays;

    while (remainingWorkDays > 0) {
      endDate.setDate(endDate.getDate() + 1);
      const dayOfWeek = endDate.getDay();

      // Only count weekdays (Monday-Friday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remainingWorkDays--;
      }
    }

    this.logger.log(
      `Estimated end date: ${endDate.toISOString()} (${Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )} days total)`
    );
    return endDate;
  }

  private async createScheduleOrderQueue(
    client: PrismaService,
    scheduleOrderId: string,
    unitProcedureId: string,
    username: string
  ): Promise<any> {
    // Get the max queue index
    const maxQueueIndex = await client.scheduleOrderQueue.aggregate({
      _max: {
        queueIndex: true,
      },
    });

    const newQueueIndex = (maxQueueIndex._max.queueIndex ?? 0) + 1;

    // Get the asset for the unit procedure first
    const unitProcedure = await client.unitProcedure.findUnique({
      where: { id: unitProcedureId },
      include: { operations: true },
    });

    // Find appropriate assets by name
    const assets = await client.asset.findMany({
      where: {
        name: {
          contains: unitProcedure?.name || "Mashing",
        },
      },
      take: 1,
    });

    const assetIds = assets.map((asset) => ({ id: asset.id }));

    return client.scheduleOrderQueue.create({
      data: {
        scheduleOrder: { connect: { id: scheduleOrderId } },
        queueIndex: newQueueIndex,
        createdBy: username,
        areas: {
          connect: assetIds.length > 0 ? assetIds : undefined,
        },
      },
    });
  }

  /**
   * Creates a recipe BOM and associated BOM items in the database
   * @param client Prisma client instance
   * @param recipeId ID of the recipe to associate with the BOM
   * @param grainQuantitiesFromMashBill Optional grain quantities from mash bill
   * @returns The created recipe BOM
   */
  private async createRecipeBomAndItems(
    client: PrismaService,
    recipeId: string,
    grainQuantitiesFromMashBill?: { [key: string]: number }
  ): Promise<any> {
    this.logger.log(`Creating recipe BOM for recipe ID: ${recipeId}`);
    this.logger.log(`Current grain quantities in MASHING_PROTOCOL:`);

    // Debug logging of grain quantities in mashing protocol
    for (const step of this.MASHING_PROTOCOL) {
      if (step.action === "Add Grain") {
        this.logger.log(
          `Grain: ${step.grainType}, Quantity: ${step.qty || "undefined"}`
        );
      }
    }

    // Create the recipe BOM
    const recipeBom = await client.recipeBom.create({
      data: {
        recipe: {
          connect: {
            id: recipeId,
          },
        },
        revision: this.BOM_REVISION,
        master: true,
        running: true,
      },
    });

    this.logger.log(`Created recipe BOM: ${recipeBom.id}`);

    // Base BOM Items
    const waterItemId = "clyd1ofw2009yfd4504c6wt1w";
    const backsetItemId = "clyd1oftx006jfd4514hrak80";
    const viscofermItemId = "clyd1ofou0024fd45e71gyxcu";
    const liquozymeItemId = "clzhhlwfj0f8ysuwb7whvgy9s";
    const diazymeItemId = "clzhhlsx30f09mbc9r5mj02z7";
    const termamylItemId = "clzelxl5v005osuwb3rfax6ix";
    const saczymeItemId = "clyd1ofot0022fd45d8j321v4";
    const laminexItemId = "clyd1ofoq001xfd45678b666b";
    const maltItemId = "clyd1ofw0009ufd45hlzpnqa9";
    const ryeItemId = "clyd1ofy600d9fd45p99px0c0";
    const cornItemId = "clyd1ofw1009wfd45oghso7y5";
    const wheatItemId = "cm0e1ocx0012xl6xv4i696cfh";
    const citricItemId = "clyd1ofpw0032fd45omeixgvv";

    // Add the base recipe BOM items
    await client.recipeBomItem.createMany({
      data: [
        {
          recipeBomsId: recipeBom.id,
          itemId: waterItemId,
          quantity: this.WATER_QTY || 0, // Ensure quantity is never null
          createdBy: this.USER,
          isClassDefinition: true,
          operation: EnumRecipeBomItemOperation.Mashing01,
          // units: "NA",
        },
        {
          recipeBomsId: recipeBom.id,
          itemId: backsetItemId,
          quantity: this.BACKSET_QTY || 0, // Ensure quantity is never null
          createdBy: this.USER,
          isClassDefinition: true,
          operation: EnumRecipeBomItemOperation.Mashing01,
          // units: "NA",
        },
        {
          recipeBomsId: recipeBom.id,
          itemId: citricItemId,
          quantity: 0,
          createdBy: this.USER,
          isClassDefinition: true,
          operation: EnumRecipeBomItemOperation.Mashing01,
          // units: "NA",
        },
      ],
    });

    // Add the barrel BOM items
    if (this.BBL_ITEM_NUMBERS.length > 0) {
      for (const itemNumber of this.BBL_ITEM_NUMBERS) {
        const itemId = await client.item.findFirst({
          where: {
            itemNumber: itemNumber,
          },
        });
        if (itemId) {
          await client.recipeBomItem.create({
            data: {
              recipeBomsId: recipeBom.id,
              itemId: itemId?.id,
              quantity: 1 / this.BBL_ITEM_NUMBERS.length || 1, // Ensure quantity is never null
              createdBy: this.USER,
              isClassDefinition: true,
              operation: EnumRecipeBomItemOperation.Mashing01,
              // units: "NA",
            },
          });
        } else {
          this.logger.warn(
            `Item not found for barrel item number: ${itemNumber}`
          );
        }
      }
    }

    // Add the yeast items
    for (const [yeastItemNumber, quantity] of Object.entries(
      this.YEAST_ITEM_NUMBERS_QTYS
    )) {
      const item = await client.item.findFirst({
        where: {
          itemNumber: yeastItemNumber,
        },
      });
      if (item) {
        await client.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: item.id } },
            quantity: this.YEAST_ITEM_NUMBERS_QTYS[yeastItemNumber] || 1, // Ensure quantity is never null
            createdBy: this.USER,
            isClassDefinition: true,
            operation: EnumRecipeBomItemOperation.Mashing01,
            displayUnits: { connect: { name: "Kilograms per Fermenter" } },
          },
        });
      } else {
        this.logger.warn(
          `Item not found for yeast item number: ${yeastItemNumber}`
        );
      }
    }

    // Track grain quantities to ensure each grain type has at least one BOM item
    const grainQuantities: { [key: string]: number } = {};
    const grainItemIds: { [key: string]: string } = {
      Corn: cornItemId,
      Rye: ryeItemId,
      Wheat: wheatItemId,
      Malt: maltItemId,
    };

    // Add the BOM items for the grains according to the mashing protocol
    for (const step of this.MASHING_PROTOCOL) {
      if (step.action === "Add Grain") {
        let itemId;
        let quantity: number;

        switch (step.grainType) {
          case "Corn":
            itemId = cornItemId;
            // Use the percentage directly from the mash bill quantities
            quantity =
              step.qty ||
              (grainQuantitiesFromMashBill &&
                grainQuantitiesFromMashBill["Corn"]) ||
              0;
            // Track total for this grain type
            grainQuantities["Corn"] = (grainQuantities["Corn"] || 0) + quantity;
            break;
          case "Rye":
            itemId = ryeItemId;
            // Use the percentage directly from the mash bill quantities
            quantity =
              step.qty ||
              (grainQuantitiesFromMashBill &&
                grainQuantitiesFromMashBill["Rye"]) ||
              0;
            // Track total for this grain type
            grainQuantities["Rye"] = (grainQuantities["Rye"] || 0) + quantity;
            break;
          case "Malt":
            itemId = maltItemId;
            // Use the percentage directly from the mash bill quantities
            quantity =
              step.qty ||
              (grainQuantitiesFromMashBill &&
                grainQuantitiesFromMashBill["Malt"]) ||
              0;
            // Track total for this grain type
            grainQuantities["Malt"] = (grainQuantities["Malt"] || 0) + quantity;
            break;
          case "Wheat":
            itemId = wheatItemId;
            // Use the percentage directly from the mash bill quantities
            quantity =
              step.qty ||
              (grainQuantitiesFromMashBill &&
                grainQuantitiesFromMashBill["Wheat"]) ||
              0;
            // Track total for this grain type
            grainQuantities["Wheat"] =
              (grainQuantities["Wheat"] || 0) + quantity;
            break;
          case "PreMalt":
            itemId = maltItemId;
            // For PreMalt, use a fraction of the Malt percentage
            quantity =
              step.qty ||
              (grainQuantitiesFromMashBill &&
                grainQuantitiesFromMashBill["Malt"] * 0.1) ||
              0;
            // Track total for this grain type (PreMalt counts as Malt)
            grainQuantities["Malt"] = (grainQuantities["Malt"] || 0) + quantity;
            break;
          case "Specialty":
            if (this.SPECIALTY_ITEM_ID) {
              itemId = this.SPECIALTY_ITEM_ID;
              quantity = step.qty;
            } else {
              this.logger.warn(
                `Specialty grain type found but no specialty item ID set`
              );
              continue;
            }
            break;
          default:
            this.logger.warn(`Unknown grain type: ${step.grainType}`);
            continue;
        }

        this.logger.log(
          `Creating BOM item for ${step.grainType} with percentage quantity ${quantity}`
        );

        await client.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: itemId } },
            quantity: quantity,
            createdBy: this.USER,
            isClassDefinition: true,
            operation: EnumRecipeBomItemOperation.Mashing01,
            displayUnits: { connect: { name: "Percent" } },
            // units: "NA",
          },
        });
      } else if (step.action === "Add Additive") {
        let itemId;

        switch (step.additiveType) {
          case "Viscoferm":
            itemId = viscofermItemId;
            break;
          case "Liquozyme":
            itemId = liquozymeItemId;
            break;
          case "Diazyme":
          case "DIAZYME":
            itemId = diazymeItemId;
            break;
          case "Termamyl":
            itemId = termamylItemId;
            break;
          case "Saczyme":
            itemId = saczymeItemId;
            break;
          case "Laminex":
            itemId = laminexItemId;
            break;
          case "Citric":
            itemId = citricItemId;
            break;
          default:
            this.logger.warn(`Unknown additive type: ${step.additiveType}`);
            continue;
        }

        this.logger.log(
          `Creating BOM item for ${step.additiveType} with ratio quantity ${
            step.qty || 0
          }`
        );

        await client.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: itemId } },
            quantity: step.qty || 0, // This is now the unitless ratio (enzyme lbs / grain lbs)
            createdBy: this.USER,
            isClassDefinition: true,
            operation: EnumRecipeBomItemOperation.Mashing01,
            displayUnits: { connect: { name: "Pounds per Cook" } },
          },
        });
      }
    }

    // Log grain quantities to check if they're correct
    this.logger.log(
      `Final grain quantities (as percentages) in BOM items: ${JSON.stringify(
        grainQuantities
      )}`
    );

    // Add fallback BOM items for any grains that weren't added but are in the mash bill
    if (grainQuantitiesFromMashBill) {
      for (const [grainType, quantity] of Object.entries(
        grainQuantitiesFromMashBill
      )) {
        // Skip if we already added this grain type or if the quantity is 0
        if (grainQuantities[grainType] || quantity <= 0) {
          continue;
        }

        const itemId = grainItemIds[grainType];
        if (!itemId) {
          this.logger.warn(`No item ID for grain type: ${grainType}`);
          continue;
        }

        this.logger.log(
          `Creating fallback BOM item for ${grainType} with percentage quantity ${quantity}`
        );

        await client.recipeBomItem.create({
          data: {
            recipeBoms: { connect: { id: recipeBom.id } },
            item: { connect: { id: itemId } },
            quantity: quantity, // Using percentage directly
            createdBy: this.USER,
            isClassDefinition: true,
            operation: EnumRecipeBomItemOperation.Mashing01,
            displayUnits: { connect: { name: "Percent" } },
            // units: "NA",
          },
        });

        // Update the tracked quantities
        grainQuantities[grainType] = quantity;
      }
    }

    this.logger.log(`Recipe BOM and items created successfully`);
    return recipeBom;
  }

  /**
   * Creates a mashing protocol and its steps, linking them to recipe BOM items
   * @param client Prisma client instance
   * @param recipeId ID of the recipe
   * @param mashingProtocol Array of mashing protocol steps
   * @param recipeBomItems Array of recipe BOM items to link to steps
   * @returns The created mashing protocol
   */
  private async createMashingProtocolAndSteps(
    client: PrismaService,
    recipeId: string,
    mashingProtocol: any[],
    recipeBomItems: any[]
  ): Promise<any> {
    this.logger.log(`Creating mashing protocol for recipe ID: ${recipeId}`);

    const protocolName = `${this.RECIPE} Mashing Protocol`;

    // Check if a mashing protocol already exists for this recipe OR with this name
    const existingProtocol = await client.mashingProtocol.findFirst({
      where: {
        OR: [
          {
            recipes: {
              some: {
                id: recipeId,
              },
            },
          },
          {
            name: protocolName,
          },
        ],
      },
      include: {
        recipes: true, // Include recipes to check if this recipe is already connected
      },
    });

    if (existingProtocol) {
      this.logger.log(
        `Mashing protocol already exists for recipe ID: ${recipeId} or with name: ${protocolName}, skipping creation`
      );

      // If the protocol exists but isn't connected to this recipe, connect it
      const isRecipeConnected = existingProtocol.recipes?.some(
        (r: any) => r.id === recipeId
      );
      if (!isRecipeConnected) {
        await client.mashingProtocol.update({
          where: { id: existingProtocol.id },
          data: {
            recipes: {
              connect: { id: recipeId },
            },
          },
        });
        this.logger.log(
          `Linked existing protocol ${existingProtocol.id} to recipe ${recipeId}`
        );
      }

      // Get existing protocol steps to link with BOM items
      const existingSteps = await client.mashingProtocolStep.findMany({
        where: {
          mashingProtocolId: existingProtocol.id,
        },
        orderBy: {
          index: "asc",
        },
      });

      this.logger.log(
        `Found ${existingSteps.length} existing protocol steps to link with BOM items`
      );

      // Map the existing steps to their corresponding step data in the mashing protocol
      const protocolSteps = [];
      for (
        let i = 0;
        i < Math.min(existingSteps.length, mashingProtocol.length);
        i++
      ) {
        const step = existingSteps[i];
        const stepData = mashingProtocol[i];

        protocolSteps.push({
          step: step,
          data: stepData,
          index: i + 1,
        });

        this.logger.log(
          `Mapped existing step ${step.id} (index: ${step.index}) to protocol data`
        );
      }

      // Organize BOM items by type for matching
      const grainBomItemsByType: { [key: string]: any[] } = {};
      const liquidBomItemsByType: { [key: string]: any[] } = {};
      const additiveBomItemsByType: { [key: string]: any[] } = {};

      // Classify BOM items by type
      for (const bomItem of recipeBomItems) {
        if (!bomItem.item || !bomItem.item.itemNumber) {
          this.logger.warn(
            `BOM item missing item property or item number: ${JSON.stringify(
              bomItem
            )}`
          );
          continue;
        }

        const itemNumber = bomItem.item.itemNumber.toLowerCase();

        // Check for grain types
        if (itemNumber.includes("corn") || itemNumber.includes("cor")) {
          if (!grainBomItemsByType["Corn"]) grainBomItemsByType["Corn"] = [];
          grainBomItemsByType["Corn"].push(bomItem);
        } else if (itemNumber.includes("wheat") || itemNumber.includes("wht")) {
          if (!grainBomItemsByType["Wheat"]) grainBomItemsByType["Wheat"] = [];
          grainBomItemsByType["Wheat"].push(bomItem);
        } else if (itemNumber.includes("rye")) {
          if (!grainBomItemsByType["Rye"]) grainBomItemsByType["Rye"] = [];
          grainBomItemsByType["Rye"].push(bomItem);
        } else if (itemNumber.includes("malt") || itemNumber.includes("bry")) {
          if (!grainBomItemsByType["Malt"]) grainBomItemsByType["Malt"] = [];
          grainBomItemsByType["Malt"].push(bomItem);
        }
        // Check for liquid types
        else if (itemNumber.includes("water") || itemNumber.includes("h2o")) {
          if (!liquidBomItemsByType["Water"])
            liquidBomItemsByType["Water"] = [];
          liquidBomItemsByType["Water"].push(bomItem);
        } else if (itemNumber.includes("backset")) {
          if (!liquidBomItemsByType["Backset"])
            liquidBomItemsByType["Backset"] = [];
          liquidBomItemsByType["Backset"].push(bomItem);
        }
        // Check for additive types
        else if (itemNumber.includes("diazyme") || itemNumber.includes("dia")) {
          if (!additiveBomItemsByType["Diazyme"])
            additiveBomItemsByType["Diazyme"] = [];
          additiveBomItemsByType["Diazyme"].push(bomItem);
        } else if (
          itemNumber.includes("liquozyme") ||
          itemNumber.includes("liq")
        ) {
          if (!additiveBomItemsByType["Liquozyme"])
            additiveBomItemsByType["Liquozyme"] = [];
          additiveBomItemsByType["Liquozyme"].push(bomItem);
        } else if (
          itemNumber.includes("viscoferm") ||
          itemNumber.includes("vis")
        ) {
          if (!additiveBomItemsByType["Viscoferm"])
            additiveBomItemsByType["Viscoferm"] = [];
          additiveBomItemsByType["Viscoferm"].push(bomItem);
        } else if (
          itemNumber.includes("laminex") ||
          itemNumber.includes("lam")
        ) {
          if (!additiveBomItemsByType["Laminex"])
            additiveBomItemsByType["Laminex"] = [];
          additiveBomItemsByType["Laminex"].push(bomItem);
        } else if (
          itemNumber.includes("citric") ||
          itemNumber.includes("cit")
        ) {
          if (!additiveBomItemsByType["Citric"])
            additiveBomItemsByType["Citric"] = [];
          additiveBomItemsByType["Citric"].push(bomItem);
        }
      }

      // Sort BOM items by quantity (descending)
      for (const grainType in grainBomItemsByType) {
        grainBomItemsByType[grainType].sort(
          (a, b) => (b.quantity || 0) - (a.quantity || 0)
        );
        this.logger.log(
          `Sorted ${grainBomItemsByType[grainType].length} ${grainType} BOM items by quantity`
        );
      }

      for (const liquidType in liquidBomItemsByType) {
        liquidBomItemsByType[liquidType].sort(
          (a, b) => (b.quantity || 0) - (a.quantity || 0)
        );
        this.logger.log(
          `Sorted ${liquidBomItemsByType[liquidType].length} ${liquidType} BOM items by quantity`
        );
      }

      for (const additiveType in additiveBomItemsByType) {
        additiveBomItemsByType[additiveType].sort(
          (a, b) => (b.quantity || 0) - (a.quantity || 0)
        );
        this.logger.log(
          `Sorted ${additiveBomItemsByType[additiveType].length} ${additiveType} BOM items by quantity`
        );
      }

      // Organize protocol steps by type
      const grainStepsByType: { [key: string]: any[] } = {};
      const liquidSteps: any[] = [];
      const additiveStepsByType: { [key: string]: any[] } = {};

      for (const stepInfo of protocolSteps) {
        const step = stepInfo.data;

        if (step.action === "Add Grain" && step.grainType) {
          const grainType = step.grainType;
          if (!grainStepsByType[grainType]) grainStepsByType[grainType] = [];
          grainStepsByType[grainType].push(stepInfo);
        } else if (step.action === "Add Liquid") {
          liquidSteps.push(stepInfo);
        } else if (step.action === "Add Additive" && step.additiveType) {
          const additiveType = step.additiveType;
          if (!additiveStepsByType[additiveType])
            additiveStepsByType[additiveType] = [];
          additiveStepsByType[additiveType].push(stepInfo);
        }
      }

      // Sort steps by index
      for (const grainType in grainStepsByType) {
        grainStepsByType[grainType].sort((a, b) => a.index - b.index);
        this.logger.log(
          `Sorted ${grainStepsByType[grainType].length} ${grainType} protocol steps by index`
        );
      }

      liquidSteps.sort((a, b) => a.index - b.index);

      for (const additiveType in additiveStepsByType) {
        additiveStepsByType[additiveType].sort((a, b) => a.index - b.index);
        this.logger.log(
          `Sorted ${additiveStepsByType[additiveType].length} ${additiveType} protocol steps by index`
        );
      }

      // Clear existing links first to avoid duplicates
      this.logger.log(
        `Clearing existing links between protocol steps and BOM items`
      );
      for (const stepInfo of protocolSteps) {
        try {
          await client.mashingProtocolStep.update({
            where: { id: stepInfo.step.id },
            data: {
              recipeBomItem: {
                set: [], // Clear existing links
              },
            },
          });
        } catch (error) {
          this.logger.error(
            `Error clearing links for step: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Link grain steps to BOM items
      for (const grainType in grainStepsByType) {
        const steps = grainStepsByType[grainType];
        const bomItems = grainBomItemsByType[grainType] || [];

        this.logger.log(
          `Linking ${bomItems.length} ${grainType} BOM items to ${steps.length} protocol steps`
        );

        // Match each step with a BOM item, starting with the largest BOM item
        for (let i = 0; i < Math.min(steps.length, bomItems.length); i++) {
          const stepInfo = steps[i];
          const bomItem = bomItems[i];

          this.logger.log(
            `Linking ${grainType} step ${i + 1} to BOM item with quantity ${
              bomItem.quantity
            }`
          );

          try {
            await client.mashingProtocolStep.update({
              where: { id: stepInfo.step.id },
              data: {
                recipeBomItem: {
                  connect: { id: bomItem.id },
                },
              },
            });
            this.logger.log(
              `Successfully linked ${grainType} BOM item (qty: ${bomItem.quantity}) to step ${stepInfo.step.id}`
            );
          } catch (error) {
            this.logger.error(
              `Error linking BOM item to step: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      // Link liquid steps to BOM items
      const waterBomItems = liquidBomItemsByType["Water"] || [];
      const backsetBomItems = liquidBomItemsByType["Backset"] || [];

      for (const stepInfo of liquidSteps) {
        const step = stepInfo.data;
        const liquidType1 = step.liquidType01?.toLowerCase();
        const liquidType2 = step.liquidType02?.toLowerCase();

        // Try to match Water
        if (liquidType1 === "water" && waterBomItems.length > 0) {
          const bomItem = waterBomItems.shift(); // Take the largest water BOM item
          try {
            await client.mashingProtocolStep.update({
              where: { id: stepInfo.step.id },
              data: {
                recipeBomItem: {
                  connect: { id: bomItem.id },
                },
              },
            });
            this.logger.log(
              `Successfully linked Water BOM item (qty: ${bomItem.quantity}) to liquid step ${stepInfo.step.id}`
            );
          } catch (error) {
            this.logger.error(
              `Error linking Water BOM item to step: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Try to match Backset
        if (liquidType2 === "backset" && backsetBomItems.length > 0) {
          const bomItem = backsetBomItems.shift(); // Take the largest backset BOM item
          try {
            await client.mashingProtocolStep.update({
              where: { id: stepInfo.step.id },
              data: {
                recipeBomItem: {
                  connect: { id: bomItem.id },
                },
              },
            });
            this.logger.log(
              `Successfully linked Backset BOM item (qty: ${bomItem.quantity}) to liquid step ${stepInfo.step.id}`
            );
          } catch (error) {
            this.logger.error(
              `Error linking Backset BOM item to step: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      // Link additive steps to BOM items
      for (const additiveType in additiveStepsByType) {
        const steps = additiveStepsByType[additiveType];
        const normalizedAdditiveType =
          additiveType.toLowerCase() === "diazyme"
            ? "Diazyme"
            : additiveType.toLowerCase() === "liquozyme"
            ? "Liquozyme"
            : additiveType.toLowerCase() === "viscoferm"
            ? "Viscoferm"
            : additiveType.toLowerCase() === "laminex"
            ? "Laminex"
            : additiveType.toLowerCase() === "citric"
            ? "Citric"
            : additiveType;

        const bomItems = additiveBomItemsByType[normalizedAdditiveType] || [];

        this.logger.log(
          `Linking ${bomItems.length} ${additiveType} BOM items to ${steps.length} protocol steps`
        );

        // Match each step with a BOM item
        for (let i = 0; i < Math.min(steps.length, bomItems.length); i++) {
          const stepInfo = steps[i];
          const bomItem = bomItems[i];

          this.logger.log(
            `Linking ${additiveType} step ${i + 1} to BOM item with quantity ${
              bomItem.quantity
            }`
          );

          try {
            await client.mashingProtocolStep.update({
              where: { id: stepInfo.step.id },
              data: {
                recipeBomItem: {
                  connect: { id: bomItem.id },
                },
              },
            });
            this.logger.log(
              `Successfully linked ${additiveType} BOM item (qty: ${bomItem.quantity}) to step ${stepInfo.step.id}`
            );
          } catch (error) {
            this.logger.error(
              `Error linking BOM item to step: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      return existingProtocol;
    }

    // Create new mashing protocol
    this.logger.log(`Creating new mashing protocol ${protocolName}`);
    const protocol = await client.mashingProtocol.create({
      data: {
        name: protocolName,
        recipes: {
          connect: { id: recipeId },
        },
        createdBy: this.USER,
        isTemplate: false,
        master: true,
      },
    });

    // Create each step in the protocol
    for (const [index, step] of mashingProtocol.entries()) {
      const stepType = this.mapActionToStepType(
        step.action,
        step.action === "Add Grain" ? step.grainType : step
      );

      const stepData: any = {
        mashingProtocol: { connect: { id: protocol.id } },
        index: index + 1,
        stepType: stepType,
        createdBy: this.USER,
      };

      // Set step-specific properties based on action type
      switch (step.action) {
        case "Hold":
          stepData.holdType = step.holdType || "Hold";
          // Map the time property to stepTime for Hold steps
          if (step.time !== undefined) {
            stepData.stepTime = step.time;
          }
          break;
        case "Add Grain":
          // For grain steps, don't need additional properties
          break;
        case "Add Liquid":
          // For liquid steps, could include liquid types or quantities
          break;
        case "Add Additive":
          // For additive steps, could include additive types or dosing
          break;
        default:
          break;
      }

      const createdStep = await client.mashingProtocolStep.create({
        data: stepData,
      });

      // Link the step to appropriate BOM items if needed
      // ... existing code for linking steps to BOM items ...
    }

    return protocol;
  }

  /**
   * Calculates the normalized quantity for BOM items based on the final finished good quantity
   * @param quantity Original quantity
   * @param finalGoodQuantity The quantity of the final finished good (typically 1)
   * @returns Normalized quantity for BOM
   */
  private normalizeQuantityForBom(
    quantity: number,
    finalGoodQuantity: number
  ): number {
    if (finalGoodQuantity <= 0) {
      this.logger.warn(
        `Invalid final good quantity: ${finalGoodQuantity}, using default of 1`
      );
      finalGoodQuantity = 1;
    }

    return quantity / finalGoodQuantity;
  }

  /**
   * Creates a complete BOM with normalized quantities for all items
   * @param client Prisma client instance
   * @param recipeId ID of the recipe
   * @param recipeBomItems Array of recipe BOM items to convert to BOM items
   * @param finalGoodQuantity The quantity of the final finished good (typically 1)
   * @returns Created recipe BOM with normalized items
   */
  private async createNormalizedBom(
    client: PrismaService,
    recipeId: string,
    recipeBomItems: Array<{
      itemId: string;
      quantity: number;
      units?: string;
    }>,
    finalGoodQuantity: number
  ): Promise<any> {
    this.logger.log(
      `Creating normalized BOM for recipe ID: ${recipeId} with ${recipeBomItems.length} items`
    );

    // Find or create the recipe BOM
    let recipeBom = await client.recipeBom.findFirst({
      where: {
        recipe: {
          some: {
            id: recipeId,
          },
        },
        revision: this.BOM_REVISION,
      },
    });

    if (!recipeBom) {
      recipeBom = await client.recipeBom.create({
        data: {
          recipe: {
            connect: {
              id: recipeId,
            },
          },
          revision: this.BOM_REVISION,
        },
      });
    }

    // Create all BOM items with normalized quantities
    for (const recipeBomItem of recipeBomItems) {
      const normalizedQuantity = this.normalizeQuantityForBom(
        recipeBomItem.quantity,
        finalGoodQuantity
      );

      await client.bomItem.create({
        data: {
          bom: { connect: { id: recipeBom.id } },
          item: { connect: { id: recipeBomItem.itemId } },
          quantity: normalizedQuantity,
          createdBy: this.USER,
          isClassDefinition: true,
          units: recipeBomItem.units || "NA",
        },
      });
    }

    this.logger.log(
      `Normalized BOM created successfully with ${recipeBomItems.length} items`
    );
    return recipeBom;
  }
}
