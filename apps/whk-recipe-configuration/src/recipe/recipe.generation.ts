import {
  EnumRecipeParameterRecipeSetpointType,
  EnumEquipmentPhaseName,
  EnumEquipmentPhaseStepType,
  EnumOperationName,
  EnumPhaseParameterSetpointType,
  EnumPhaseParameterStaticName,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
  Item,
  Operation,
  PrismaClient,
  Recipe,
  RecipeGroup,
  RecipeParameter,
  UnitProcedure,
  EnumRecipeWhiskeyType,
} from "@prisma/client";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { EnzymeDosingService } from "./enzyme.dosing";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

// Define the BinAssignments interface to allow string or string[] values
interface BinAssignments {
  [bin: string]: string | string[];
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

  private readonly MAX_QUANTITIES: { [key: string]: number } = {
    bin1: 6500,
    bin2: 18100,
    bin3: 1700,
    // bin4: 2000, // Add more bins if necessary
  };

  constructor(
    private readonly rabbitMQProducer: RabbitMQProducerService,
    private readonly enzymeDosingService: EnzymeDosingService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {
    this.RECIPE = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-R01`;
    if (this.BARREL_INFO !== "") {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.BARREL_INFO}-${this.FINAL_PROOF}-R01`;
    } else {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.FINAL_PROOF}-R01`;
    }
    this.BOM_REVISION = `BOM-${this.CUSTOMER_CODE}-${this.MASH_BILL}-R01`;
  }

  // Function to calculate grain quantities based on mash bill
  private calculateGrainQuantities(mashBill: string, totalGrainWeight: number) {
    const [cornPercent, ryePercent, wheatPercent, maltPercent] = mashBill
      .split("-")
      .map((percent) => parseFloat(percent) / 100);

    return {
      Corn: Math.round(totalGrainWeight * cornPercent),
      Rye: Math.round(totalGrainWeight * ryePercent),
      Wheat: Math.round(totalGrainWeight * wheatPercent),
      Malt: Math.round(totalGrainWeight * maltPercent),
    };
  }

  private splitGrainAdditions(
    grainType: string,
    qty: number,
    binAssignments: BinAssignments,
    grainQuantities: { [key: string]: number },
    hasPreMalt = false
  ): any[] {
    this.logger.log(
      `Grain type ${grainType} with qty ${qty} and bin assignments ${JSON.stringify(
        binAssignments
      )}`
    );

    const SPLITS_RATIO = 0.8;
    const MIN_SPLIT_QTY = 10; // Minimum quantity to allow a split to prevent excessive actions

    const splits: any[] = [];
    let remainingQty =
      grainQuantities[grainType === "PreMalt" ? "Malt" : grainType];

    // Handle PreMalt separately
    if (grainType === "PreMalt") {
      const preMaltQty = Math.round(remainingQty * 0.1);
      if (preMaltQty > 0) {
        splits.push({
          action: "Add Grain",
          grainType: "Malt",
          qty: preMaltQty,
        });
        remainingQty -= preMaltQty;
        this.logger.log(
          `Allocated PreMalt Qty: ${preMaltQty}. Remaining Qty: ${remainingQty}`
        );
        return splits;
      }
    }

    // Handle big malt
    if (grainType === "Malt" && remainingQty > 0 && hasPreMalt) {
      remainingQty = Math.round(remainingQty * 0.9);
      this.logger.log(
        `Allocated 90% of Malt Qty: ${remainingQty}. Remaining Qty: ${remainingQty}`
      );
    }

    // Convert binAssignments to an ordered array based on bin numbers
    const orderedBins = Object.keys(binAssignments)
      .sort((a, b) => {
        const numA = parseInt(a.replace("bin", ""), 10);
        const numB = parseInt(b.replace("bin", ""), 10);
        return numA - numB;
      })
      .map((bin) => [bin, binAssignments[bin]] as [string, string | string[]]);

    while (remainingQty > 0) {
      let splitOccurred = false;

      for (const [binNum, binGrains] of orderedBins) {
        const grains = Array.isArray(binGrains) ? binGrains : [binGrains];
        this.logger.log(
          `Checking bin ${binNum} for grains ${JSON.stringify(
            grains
          )} with max capacity of ${this.MAX_QUANTITIES[binNum]}`
        );
        const maxBinQty = this.MAX_QUANTITIES[binNum];
        this.logger.log(
          `Max bin capacity: ${maxBinQty}, remaining qty: ${remainingQty}. Grain type: ${grainType}`
        );
        const numGrainsInBin = grains.length;
        this.logger.log(`Number of grains in bin ${binNum}: ${numGrainsInBin}`);
        for (const binGrainType of grains) {
          this.logger.log(
            `Grain type in bin ${binNum}: ${binGrainType}, grain type: ${grainType}`
          );
          if (grainType === binGrainType) {
            if (remainingQty > maxBinQty) {
              this.logger.log(
                `Match found for bin ${binNum} and grain type ${binGrainType}. Remaining qty: ${remainingQty}`
              );

              // Calculate the split quantity without exceeding the bin capacity
              const splitQty = Math.min(
                Math.round(remainingQty * SPLITS_RATIO),
                maxBinQty
              );

              if (splitQty >= MIN_SPLIT_QTY) {
                splits.push({
                  action: "Add Grain",
                  grainType: binGrainType,
                  qty: splitQty,
                });
                remainingQty -= splitQty;
                this.logger.log(
                  `Added ${splitQty} of ${binGrainType} to bin ${binNum}. Remaining Qty: ${remainingQty}`
                );
                splitOccurred = true;
              }

              // Add Hold action if necessary
              splits.push({
                action: "Hold",
                holdType: "Hold",
                time: 2, // 2 minutes hold
              });
              this.logger.log(`Added Hold action for ${splitQty} qty.`);
              splitOccurred = true;
            } else {
              if (remainingQty >= MIN_SPLIT_QTY) {
                splits.push({
                  action: "Add Grain",
                  grainType: binGrainType,
                  qty: remainingQty,
                });
                this.logger.log(
                  `Final split: Added ${remainingQty} of ${binGrainType} to bin ${binNum}.`
                );
                remainingQty = 0;
                splitOccurred = true;
              }
            }
            break; // Exit the loop after processing a matching bin grain
          } else {
            // Skip grains that do not match the grain type
            this.logger.log(
              `Grain type ${binGrainType} in bin ${binNum} does not match grain type ${grainType}. Skipping.`
            );
          }
        }
      }

      if (!splitOccurred) {
        this.logger.log(
          `No further splits could be made for grain type ${grainType}. Remaining qty: ${remainingQty}`
        );
        // Optionally, handle the remaining quantity here or log a warning
        // For example, throw an error if grain can't be fully allocated
        throw new Error(
          `Unable to allocate all grains for ${grainType}. Remaining quantity: ${remainingQty}`
        );
      }
    }

    return splits;
  }

  

  private getEnzymeDosing(
    enzymeName: string,
    totalGrainLoadLbs: number,
    mashBill: string
  ) {
    return this.enzymeDosingService.calculateEnzymeDosing(
      totalGrainLoadLbs,
      mashBill,
      enzymeName
    );
  }

  private setEnzymeDosing(mashingProtocol: any[]) {
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
      const dosing = this.getEnzymeDosing(
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
    // Convert to uppercase for consistent comparison
    const upperMashBill = mashBill.toUpperCase();

    const cornPercentage = this.calculateGrainPercentage("CORN", upperMashBill);
    const ryePercentage = this.calculateGrainPercentage("RYE", upperMashBill);
    const wheatPercentage = this.calculateGrainPercentage(
      "WHEAT",
      upperMashBill
    );
    const maltPercentage = this.calculateGrainPercentage("MALT", upperMashBill);

    // Bourbon variations (corn > 51%)
    if (cornPercentage > 51) {
      if (ryePercentage > 0 && wheatPercentage === 0) {
        return EnumRecipeWhiskeyType.RyeBourbon;
      }
      if (wheatPercentage > 0 && ryePercentage === 0) {
        return EnumRecipeWhiskeyType.WheatedBourbon;
      }
      if (wheatPercentage > 0 && ryePercentage > 0) {
        return EnumRecipeWhiskeyType.FourGrainBourbon;
      }
    }

    // Rye whiskey (rye > 51%)
    if (ryePercentage > 51) {
      return EnumRecipeWhiskeyType.RyeWhiskey;
    }

    // Wheat whiskey (wheat > 51%)
    if (wheatPercentage > 51) {
      return EnumRecipeWhiskeyType.WheatWhiskey;
    }

    // Malt whiskey (malt > 51%)
    if (maltPercentage > 51) {
      return EnumRecipeWhiskeyType.MaltWhiskey;
    }
    return EnumRecipeWhiskeyType.RyeBourbon;
  }

  private calculateGrainPercentage(
    grainType: string,
    mashBill: string
  ): number {
    // Split the mash bill into components
    const components = mashBill.split("-");
    let totalPercentage = 0;
    let grainPercentage = 0;

    // Calculate percentages
    components.forEach((component) => {
      const match = component.match(/(\d+)/);
      if (match) {
        const percentage = parseInt(match[1], 10);
        totalPercentage += percentage;
        if (component.includes(grainType)) {
          grainPercentage += percentage;
        }
      }
    });

    // Return percentage if total is valid, otherwise 0
    return totalPercentage > 0 ? (grainPercentage / totalPercentage) * 100 : 0;
  }

  private validateMashingProtocolAgainstMashBill(
    mashingProtocol: any[],
    mashBill: string
  ): boolean {
    this.logger.log('Validating mashing protocol against mash bill...');

    // Extract grains from mash bill
    const [corn, rye, wheat, malt] = mashBill.split('-').map(Number);
    const mashBillGrains = new Set<string>();
    
    // Only add grains that have non-zero percentages
    if (corn > 0) mashBillGrains.add('Corn');
    if (rye > 0) mashBillGrains.add('Rye');
    if (wheat > 0) mashBillGrains.add('Wheat');
    if (malt > 0) mashBillGrains.add('Malt');

    // Collect all grains from mashing protocol
    const protocolGrains = new Set<string>();
    let foundPreMalt = false;

    for (const step of mashingProtocol) {
      if (step.action === 'Add Grain') {
        if (step.grainType === 'PreMalt') {
          foundPreMalt = true;
          protocolGrains.add('Malt'); // PreMalt counts as Malt
        } else {
          protocolGrains.add(step.grainType);
        }
      }
    }

    // If we found PreMalt, ensure there's also a regular Malt addition
    if (foundPreMalt && mashBillGrains.has('Malt')) {
      let foundRegularMalt = false;
      for (const step of mashingProtocol) {
        if (step.action === 'Add Grain' && step.grainType === 'Malt') {
          foundRegularMalt = true;
          break;
        }
      }
      if (!foundRegularMalt) {
        this.logger.error('PreMalt is present but missing regular Malt addition');
        return false;
      }
    }

    // Check if all mash bill grains are in the protocol
    for (const grain of mashBillGrains) {
      if (!protocolGrains.has(grain)) {
        this.logger.error(`Grain ${grain} from mash bill is not present in mashing protocol`);
        return false;
      }
    }

    // Check if there are any extra grains in protocol that aren't in the mash bill
    for (const grain of protocolGrains) {
      if (!mashBillGrains.has(grain)) {
        this.logger.error(`Grain ${grain} is in mashing protocol but not present in mash bill`);
        return false;
      }
    }

    // Validate the sequence of steps
    let foundWater = false;
    let foundGrain = false;
    let foundAdditive = false;

    for (const step of mashingProtocol) {
      switch (step.action) {
        case 'Add Liquid':
          if (foundGrain) {
            this.logger.error('Invalid sequence: Water addition after grain addition');
            return false;
          }
          foundWater = true;
          break;
        case 'Add Grain':
          if (!foundWater) {
            this.logger.error('Invalid sequence: Grain addition before water addition');
            return false;
          }
          foundGrain = true;
          break;
        case 'Add Additive':
          foundAdditive = true;
          break;
        case 'Hold':
          // Holds are allowed anywhere
          break;
        default:
          this.logger.error(`Invalid action type in mashing protocol: ${step.action}`);
          return false;
      }
    }

    // Ensure we have the minimum required steps
    if (!foundWater) {
      this.logger.error('Missing water addition in mashing protocol');
      return false;
    }
    if (!foundGrain) {
      this.logger.error('Missing grain addition in mashing protocol');
      return false;
    }
    if (!foundAdditive) {
      this.logger.error('Missing additive addition in mashing protocol');
      return false;
    }

    this.logger.log('Mashing protocol matches mash bill components and has valid sequence');
    return true;
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
    binAssignments: BinAssignments // Updated type
  ): Promise<void> {
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
    this.RECIPE_PARAMETERS = recipeParameters;
    this.RECIPE = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-R01`;
    if (this.BARREL_INFO !== "") {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.BARREL_INFO}-${this.FINAL_PROOF}-R01`;
    } else {
      this.ITEM_NUMBER = `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.FINAL_PROOF}-R01`;
    }
    this.BOM_REVISION = `BOM-${this.CUSTOMER_CODE}-${this.MASH_BILL}-R01`;

    console.info("Seeding database with custom seed for Mashing Recipe...");

    // Add validation for mashing protocol
    if (!this.validateMashingProtocolAgainstMashBill(mashingProtocol, mashBill)) {
      throw new Error('Invalid mashing protocol for given mash bill');
    }

    // ------------------------------------ BOM CREATION ------------------------------------
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

    // --------------------------- Processing Bin Assignments ---------------------------
    // Validate bin assignments
    if (!this.validateBinAssignments(binAssignments)) {
      throw new Error("Invalid bin assignments");
    }

    // Process the mashing protocol to get the quantities of each grain type and to split the additions if necessary
    const grainQuantities: any = this.calculateGrainQuantities(
      this.MASH_BILL,
      this.TOTAL_GRAIN_WEIGHT
    );

    const hasPreMalt = this.MASHING_PROTOCOL.some(
      (step) => step.action === "Add Grain" && step.grainType === "PreMalt"
    );

    this.logger.log(`Grain quantities: ${JSON.stringify(grainQuantities)}`);
    const grainAdditions = mashingProtocol.filter(
      (param) => param.action === "Add Grain"
    );
    this.logger.log(`Grain additions: ${JSON.stringify(grainAdditions)}`);

    const mashingProtocolWithSplits = this.MASHING_PROTOCOL.reduce(
      (acc: any[], step) => {
        if (step.action === "Add Grain") {
          const grainType = step.grainType;
          const qty = grainQuantities[grainType];
          const splitSteps = this.splitGrainAdditions(
            grainType,
            qty,
            binAssignments,
            grainQuantities,
            hasPreMalt
          );
          return [...acc, ...splitSteps];
        }
        return [...acc, step];
      },
      []
    );

    this.logger.log(
      `Mashing protocol with splits: ${JSON.stringify(
        mashingProtocolWithSplits
      )}`
    );

    // Set the enzyme dosing
    const finalizedMashingProtocol: any[] = this.setEnzymeDosing(
      mashingProtocolWithSplits
    );
    this.logger.log(
      `Finalized mashing protocol: ${JSON.stringify(finalizedMashingProtocol)}`
    );

    const client = new PrismaClient();
    console.log("Creating recipe...");
    const itemNumber =
      this.BARREL_INFO !== ""
        ? `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.BARREL_INFO}-${this.FINAL_PROOF}-R01`
        : `${this.CUSTOMER_CODE}-${this.MASH_BILL}-${this.FINAL_PROOF}-R01`;
    console.log("itemNumber:", itemNumber);
    // Create the base BOM and bom items
    const fgItem = await client.item.findFirst({
      where: {
        itemNumber: itemNumber,
      },
    });

    if (!fgItem) {
      console.log(`Item ${itemNumber} not found`);
      throw new Error(`Item ${itemNumber} not found`);
    }

    // Check for existing BOM with the same revision
    const existingBom = await client.bom.findFirst({
      where: {
        bomRevision: this.BOM_REVISION,
      },
    });

    if (existingBom) {
      console.log(
        `BOM with revision ${this.BOM_REVISION} already exists. Skipping creation.`
      );
    } else {
      console.log("Creating base BOM...");
      const baseBom = await client.bom.create({
        data: {
          bomRevision: this.BOM_REVISION,
          bomName: `BOM-${this.CUSTOMER_CODE}-${this.MASH_BILL}`,
          createdBy: this.USER,
          item: {
            connect: {
              id: fgItem?.id,
            },
          },
        },
      });
      console.log(`Created base BOM: ${baseBom.id}`);
      console.log(`Water id: ${waterItemId}`);
      console.log(`Backset id: ${backsetItemId}`);
      console.log(`Viscoferm id: ${viscofermItemId}`);
      console.log(`Liquozyme id: ${liquozymeItemId}`);
      console.log(`Diazyme id: ${diazymeItemId}`);
      console.log(`Termamyl id: ${termamylItemId}`);
      console.log(`Saczyme id: ${saczymeItemId}`);
      console.log(`Malt id: ${maltItemId}`);
      console.log(`Rye id: ${ryeItemId}`);
      console.log(`Corn id: ${cornItemId}`);
      console.log(`Wheat id: ${wheatItemId}`);
      console.log(`Citric id: ${citricItemId}`);
      // add the base bom items
      await client.bomItem.createMany({
        data: [
          {
            bomId: baseBom.id,
            itemId: waterItemId,
            quantity: this.WATER_QTY,
            createdBy: this.USER,
            isClassDefinition: true,
          },
          {
            bomId: baseBom.id,
            itemId: backsetItemId,
            quantity: this.BACKSET_QTY,
            createdBy: this.USER,
            isClassDefinition: true,
          },
          {
            bomId: baseBom.id,
            itemId: citricItemId,
            quantity: 0,
            createdBy: this.USER,
            isClassDefinition: true,
          },
        ],
      });

      // add the barrel bom items
      if (this.BBL_ITEM_NUMBERS.length > 0) {
        for (const itemNumber of this.BBL_ITEM_NUMBERS) {
          const itemId = await client.item.findFirst({
            where: {
              itemNumber: itemNumber,
            },
          });
          if (itemId) {
            await client.bomItem.create({
              data: {
                bomId: baseBom.id,
                itemId: itemId?.id,
                quantity: 1 / this.BBL_ITEM_NUMBERS.length,
                createdBy: this.USER,
                isClassDefinition: true,
              },
            });
          }
        }
      }

      // add the yeast items
      for (const [yeastItemNumber, quantity] of Object.entries(
        this.YEAST_ITEM_NUMBERS_QTYS
      )) {
        const item = await client.item.findFirst({
          where: {
            itemNumber: yeastItemNumber,
          },
        });
        if (item) {
          await client.bomItem.create({
            data: {
              bomId: baseBom.id,
              itemId: item.id,
              quantity: this.YEAST_ITEM_NUMBERS_QTYS[yeastItemNumber],
              createdBy: this.USER,
              isClassDefinition: true,
            },
          });
        } else {
          console.log(
            `Item not found for yeast item number: ${yeastItemNumber}`
          );
        }
      }

      // Add the bom items for the grains according to the mashingProtocol
      // Add the bom items for the grains according to the mashingProtocol
      for (const step of finalizedMashingProtocol) {
        if (step.action === "Add Grain") {
          let itemId;
          let quantity: number;

          switch (step.grainType) {
            case "Corn":
              itemId = cornItemId;
              quantity = step.qty || 0;
              break;
            case "Rye":
              itemId = ryeItemId;
              quantity = step.qty || 0;
              break;
            case "Malt":
              itemId = maltItemId;
              quantity = step.qty || 0;
              break;
            case "Wheat":
              itemId = wheatItemId;
              quantity = step.qty || 0;
              break;
            default:
              console.log(`Unknown grain type: ${step.grainType}`);
              continue;
          }

          if (itemId && quantity) {
            await client.bomItem.create({
              data: {
                bomId: baseBom.id,
                itemId: itemId,
                quantity: quantity,
                createdBy: this.USER,
                isClassDefinition: true,
              },
            });
            console.log(
              `Added ${step.grainType} to BOM with quantity ${quantity}`
            );
          }
        } else if (step.action === "Add Additive") {
          let itemId;
          let quantity;

          switch (step.additiveType?.toLowerCase()) {
            case "viscoferm":
              itemId = viscofermItemId;
              quantity = step.qty || 0;
              break;
            case "liquozyme":
              itemId = liquozymeItemId;
              quantity = step.qty || 0;
              break;
            case "diazyme":
              itemId = diazymeItemId;
              quantity = step.qty || 0;
              break;
            case "termamyl":
              itemId = termamylItemId;
              quantity = step.qty || 0;
              break;
            case "saczyme":
              itemId = saczymeItemId;
              quantity = step.qty || 0;
              break;
            case "laminex":
              itemId = laminexItemId;
              quantity = step.qty || 0;
              break;
          }

          if (itemId && quantity) {
            await client.bomItem.create({
              data: {
                bomId: baseBom.id,
                itemId: itemId || "",
                quantity: quantity || 0,
                createdBy: this.USER,
                isClassDefinition: true,
              },
            });
            console.log(
              `Added ${step.additiveType} to BOM with quantity ${quantity}`
            );
          }
        }
      }
    }

    // ------------------------------------ END OF BOM CREATION ------------------------------------

    /*
    1. Seed instance of unit procedures, using the main procedure instance
    2. Seed instances of operations for each UP. Using the parameters to seed the number of operations per UP
    3. Find the appropriate BOM for the mashing recipe
    4. Using the structure of the mashing protocol to map the equipment phases to cook. 
      a. Connect the correct phase parameters
      b. Connect the step type if applicable.  
      c. Map the bom components to the proper equipment phase

    */

    // Find Unit Procedure class definitions
    const unitProcedureClassDefs = await client.unitProcedure.findMany({
      where: {
        isClassDef: true,
        name: "Mashing01",
      },
    });

    console.log("Unit Procedure Class Definitions:", unitProcedureClassDefs);

    // Find the procedure instance for the mashing recipe
    const mashingRecipeProcedure = await client.procedure.findFirst({
      where: {
        name: "Line1",
        isClassDefinition: false,
      },
    });

    if (!mashingRecipeProcedure) {
      console.error("Mashing Recipe procedure instance not found");
      return;
    }

    console.log(
      "Found Mashing Recipe procedure instance:",
      mashingRecipeProcedure.id
    );

    let mashInstance: UnitProcedure | null = null;
    // Create instances of Unit Procedures
    for (const classDef of unitProcedureClassDefs) {
      const existingInstance = await client.unitProcedure.findFirst({
        where: {
          name: classDef.name,
          isClassDef: false,
          recipe: {
            some: {
              Recipe: this.RECIPE,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      mashInstance = existingInstance;
      if (!existingInstance) {
        // if (true) {
        const newInstance = await client.unitProcedure.create({
          data: {
            name: classDef.name,
            path: classDef.path,
            isClassDef: false,
            classId: { connect: { id: classDef.id } },
            revision: 0,
            description: `Instance of ${classDef.name}`,
            createdBy: "seed",
            procedure: { connect: { id: mashingRecipeProcedure.id } },
          },
        });
        console.log(`Created new Unit Procedure instance: ${newInstance.name}`);
        if (newInstance.name.includes("Mashing01")) {
          mashInstance = newInstance;
        }
      } else {
        console.log(`Instance of ${classDef.name} already exists, skipping.`);
        // mashIstance = existingInstance;
      }
      if (!mashInstance) {
        console.log(`Mashing unit procedure instance not found`);
        mashInstance = existingInstance;
      }
    }

    // find the appropriate BOM / BOM Version
    const bom = await client.bom.findFirst({
      where: {
        bomRevision: this.BOM_REVISION,
      },
    });

    // Seed operations based on number of cooks per ferm and number of cooks
    const numberOfCooksPerFerm = 3; // This should be configurable or fetched from a setting
    const totalNumberOfCooks = 1; // This should be configurable or fetched from a setting
    const startCook = 0;

    const operationClassDefs = await client.operation.findMany({
      where: {
        isClassDefinition: true,
      },
    });

    console.log("Operation Class Definitions:", operationClassDefs);

    if (!mashInstance) {
      console.log(`Mashing unit procedure instance not found`);
      return;
    }
    const mashingUnitProcedure = await client.unitProcedure.findFirst({
      where: {
        id: mashInstance.id,
        // name: EnumUnitProcedureName.Mashing01,
        // isClassDef: false,
        // procedure: { id: mashingRecipeProcedure.id }
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!mashingUnitProcedure) {
      console.error("Mashing Unit Procedure instance not found");
      return;
    }
    const newCookInstances: Operation[] = [];
    for (
      let cookIndex = startCook;
      cookIndex < totalNumberOfCooks;
      cookIndex++
    ) {
      const existingInstance = await client.operation.findFirst({
        where: {
          name: EnumOperationName.Cook,
          isClassDefinition: false,
          // unitProcedure: { id: mashingUnitProcedure.id },
          unitProcedureId: mashInstance.id,
          procedureSequenceIndex: cookIndex,
        },
      });
      const cookClassDef = operationClassDefs.find(
        (def) => def.name === EnumOperationName.Cook
      );

      if (cookClassDef) {
        newCookInstances[cookIndex] = await client.operation.create({
          data: {
            name: EnumOperationName.Cook,
            path: `${cookClassDef.path}/Cook${cookIndex + 1}`,
            isClassDefinition: false,
            classId: { connect: { id: cookClassDef.id } },
            revision: 0,
            description: `Instance of Cook for Cook ${cookIndex + 1}`,
            createdBy: "seed",
            unitProcedure: { connect: { id: mashingUnitProcedure.id } },
            procedureSequenceIndex: cookIndex,
            abbreviation: "MAS",
          },
        });
        console.log(
          `Created new Operation instance: ${
            newCookInstances[cookIndex].name
          } for Cook ${cookIndex + 1}`
        );
      } else {
        console.log(
          `Cook class definition not found, skipping Cook ${cookIndex + 1}`
        );
      }
    }

    for (
      let cookIndex = startCook;
      cookIndex < totalNumberOfCooks;
      cookIndex++
    ) {
      // const fermIndex = Math.floor(cookIndex / numberOfCooksPerFerm);

      const cookOperation = await client.operation.findFirst({
        where: {
          // name: EnumOperationName.Cook,
          // isClassDefinition: false,
          // unitProcedure: { id: mashingUnitProcedure.id },
          // procedureSequenceIndex: cookIndex
          id: newCookInstances[cookIndex].id,
        },
      });

      if (!cookOperation) {
        console.log(
          `Cook operation not found for Cook ${
            cookIndex + 1
          }, skipping phase creation.`
        );
        continue;
      }

      // Map the provided phase names to the actual enum values
      const phaseNameMap: { [key: string]: EnumEquipmentPhaseName } = {
        "Add Liquid": EnumEquipmentPhaseName.LiquidAdd,
        Hold: EnumEquipmentPhaseName.Hold,
        "Add Grain": EnumEquipmentPhaseName.GrainAdd,
        "Add Additive": EnumEquipmentPhaseName.AdditiveAdd,
      };

      // Update the MASHING_PROTOCOL with the mapped enum values
      const mappedMASHING_PROTOCOL = finalizedMashingProtocol.map((phase) => ({
        ...phase,
        action: phaseNameMap[phase.action] || phase.action,
      }));

      for (const [phaseIndex, phase] of finalizedMashingProtocol.entries()) {
        const existingPhase = await client.equipmentPhase.findFirst({
          where: {
            name:
              phaseNameMap[phase.action] ||
              (phase.action as EnumEquipmentPhaseName),
            operation: {
              id: newCookInstances[cookIndex].id,
            },
            operationSequenceIndex: phaseIndex,
          },
          include: {
            operation: true,
          },
        });

        if (!existingPhase) {
          const cookOperation: Operation | null =
            await client.operation.findFirst({
              where: {
                name: EnumOperationName.Cook,
                isClassDefinition: false,
                unitProcedure: { id: mashingUnitProcedure.id },
                procedureSequenceIndex: cookIndex,
              },
              orderBy: { createdAt: "desc" },
            });

          if (cookOperation) {
            const stepType =
              phase.action === "Hold"
                ? phase.holdType
                : phase.action === "Add Grain"
                ? phase.grainType
                : phase.action === "Add Liquid"
                ? phase.liquidType01
                : undefined;
            const newPhase = await client.equipmentPhase.create({
              data: {
                name:
                  phaseNameMap[phase.action] ||
                  (phase.action as EnumEquipmentPhaseName),
                path: `${mashingUnitProcedure.path}/Cook${cookIndex + 1}/${
                  phase.action
                }`,
                isClassDefinition: false,
                revision: 0,
                description: `Cook ${cookIndex + 1}`,
                createdBy: "seed",
                operation: {
                  connect: {
                    id: (cookOperation as Operation).id as string,
                  },
                },
                stepType: stepType as EnumEquipmentPhaseStepType,
                operationSequenceIndex: phaseIndex,
              },
            });
            console.log(
              `Created new Equipment Phase: ${newPhase.name} for Cook ${
                cookIndex + 1
              }`
            );

            // Add phase parameters based on the action
            const parameterData: {
              name: string;
              value: number | string;
              units: string;
            }[] = [];
            if (phase.temperature) {
              parameterData.push({
                name: "Temperature",
                value: phase.temperature,
                units: "°F",
              });
            }
            if (phase.time) {
              parameterData.push({
                name: "Time",
                value: phase.time,
                units: "minutes",
              });
            }
            for (const param of parameterData) {
              await client.phaseParameter.create({
                data: {
                  name: param.name,
                  staticName: param.name as EnumPhaseParameterStaticName,
                  setpointNumericalValue: param.value as number,
                  units: param.units,
                  description: param.name,
                  isClassDef: false,
                  equipmentPhases: { connect: { id: newPhase.id } },
                  createdBy: "seed",
                  setpointType: EnumPhaseParameterSetpointType.Numeric,
                },
              });
            }

            // Initialize a flag to track if a BOM item has been linked for this phase
            let bomItemLinked = false;

            // Link BOM components to their equipment phases - these will be the "class definitions"
            if (bom) {
              const bomComponents = await client.bomItem.findMany({
                where: {
                  bom: { id: bom.id },
                  isClassDefinition: true,
                },
                include: {
                  item: true,
                },
              });

              for (const component of bomComponents) {
                if (
                  (phase.action === "Add Grain" &&
                    phase.grainType &&
                    component.item.itemNumber
                      .toLowerCase()
                      .includes(phase.grainType.toLowerCase()) &&
                    phase.grainType != "Corn") ||
                  (phase.action === "Add Liquid" &&
                    ((phase.liquidType01 &&
                      component.item.itemNumber
                        .toLowerCase()
                        .includes(phase.liquidType01.toLowerCase())) ||
                      (phase.liquidType02 &&
                        component.item.itemNumber
                          .toLowerCase()
                          .includes(phase.liquidType02.toLowerCase()))))
                ) {
                  // Check if the quantity field is present in the phase object
                  if (phase.qty !== undefined) {
                    // Only match if the bomItem quantity equals the phase quantity
                    if (component.quantity == phase.qty) {
                      const updatedPhase = await client.equipmentPhase.update({
                        where: { id: newPhase.id },
                        data: {
                          bomItem: {
                            connect: { id: component.id },
                          },
                        },
                        include: {
                          bomItem: true,
                        },
                      });
                      console.log(
                        `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                      );
                      bomItemLinked = true;
                    } else {
                      console.log(
                        `Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`
                      );
                    }
                  } else if (phase.notQty !== undefined) {
                    // Only match if the bomItem quantity does not equal the phase notQty
                    if (component.quantity != phase.notQty) {
                      await client.equipmentPhase.update({
                        where: { id: newPhase.id },
                        data: {
                          bomItem: {
                            connect: { id: component.id },
                          },
                        },
                      });
                      console.log(
                        `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                      );
                      bomItemLinked = true;
                    } else {
                      console.log(
                        `Skipped linking BOM component ${component.item.itemNumber} due to quantity match with notQty. NotQty: ${phase.notQty}, Actual: ${component.quantity}`
                      );
                    }
                  } else {
                    await client.equipmentPhase.update({
                      where: { id: newPhase.id },
                      data: {
                        bomItem: {
                          connect: { id: component.id },
                        },
                      },
                    });
                    console.log(
                      `Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                    );
                    bomItemLinked = true;
                  }
                } else if (phase.grainType == "Corn") {
                  console.log(`Corn: ${component.item.itemNumber}`);
                  if (
                    component.item.itemNumber ===
                    "COR-DLF02-US #2 Yellow Dent GMO"
                  ) {
                    // Check if the quantity field is present in the phase object
                    if (phase.qty !== undefined) {
                      // Only match if the bomItem quantity equals the phase quantity
                      if (component.quantity == phase.qty) {
                        await client.equipmentPhase.update({
                          where: { id: newPhase.id },
                          data: {
                            bomItem: {
                              connect: { id: component.id },
                            },
                          },
                        });
                        console.log(
                          `Linked BOM component ${component.item.itemNumber} with quantity ${component.quantity} to Equipment Phase ${newPhase.name}`
                        );
                        bomItemLinked = true;
                      } else {
                        console.log(
                          `Skipped linking BOM component ${component.item.itemNumber} due to quantity mismatch. Required: ${phase.qty}, Actual: ${component.quantity}`
                        );
                      }
                    } else {
                      await client.equipmentPhase.update({
                        where: { id: newPhase.id },
                        data: {
                          bomItem: {
                            connect: { id: component.id },
                          },
                        },
                      });
                      console.log(
                        `Linked specific corn BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                      );
                      bomItemLinked = true;
                    }
                  }
                } else if (
                  phase.action === "Add Additive" &&
                  phase.additiveType &&
                  component.item.itemNumber
                    .toLowerCase()
                    .includes(phase.additiveType.toLowerCase())
                ) {
                  console.log(`Add Additive: ${component.item.itemNumber}`);
                  // if (phase.additiveType == "Teramyl") {
                  //   console.log(`Teramyl: ${component.item.itemNumber}`);
                  // } else if (phase.additiveType)
                  await client.equipmentPhase.update({
                    where: { id: newPhase.id },
                    data: {
                      bomItem: {
                        connect: { id: component.id },
                      },
                    },
                  });
                  console.log(
                    `Linked BOM component ${component.item.itemNumber} to Equipment Phase ${newPhase.name}`
                  );
                  bomItemLinked = true;
                }
                if (bomItemLinked && phase.action !== "Add Liquid") {
                  break; // Exit the loop once a BOM item is linked
                }
              }
            } else {
              console.log(
                "BOM not found, skipping linking BOM components to Equipment Phases"
              );
            }
          }
        } else {
          console.log(
            `Equipment Phase ${phase.action} already exists, skipping.`
          );
        }
      }
    }

    // Get the item with the correct item number
    const getItemByItemNumber = async (itemNumber: string) => {
      const item = await client.item.findFirst({
        where: {
          itemNumber: {
            equals: itemNumber,
            mode: "insensitive",
          },
        },
      });

      if (!item) {
        console.log(`Item with item number ${itemNumber} not found`);
        return null;
      }

      return item;
    };

    const item = await getItemByItemNumber(this.ITEM_NUMBER);
    if (item) {
      console.log(`Found item: ${item.id}, ${item.itemNumber}`);
    }

    const customer = await client.customer.findFirst({
      where: {
        name: this.CUSTOMER_NAME,
      },
    });

    if (customer) {
      console.log(`Found customer: ${customer.id}, ${customer.name}`);
    } else {
      console.log(`Customer '${this.CUSTOMER_NAME}' not found`);
    }

    let mashBillType = "Invalid"; // Default to "Invalid"
    enum Bool {
      False = 0,
      True = 1,
    }

    const determineMashBill = (parameter: string): string => {
      const parts = parameter.split("-").map((part) => parseInt(part, 10));

      let validCount = 0;
      let hasNegative = false;

      for (let i = 0; i < parts.length; i++) {
        const value = parts[i];

        if (value < 0) {
          hasNegative = true;
          break;
        } else if (value > 0) {
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
      // console.log("4-grain Mash Bill detected");
      return determineMashBill(mashBill) === "4-grain" ? true : false;
    };

    const isFourGrain = isFourGrainMashBill(mashBillType);
    console.log(`Grain type: ${determineMashBill(mashBillType)}`);

    // Create or update the Recipe record and link it to the Mashing Unit Procedure
    const existingRecipe = await client.recipe.findFirst({
      where: {
        Recipe: this.RECIPE,
      },
    });

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

    let recipe: Recipe;
    if (existingRecipe) {
      console.log("Mashing Recipe already exists, updating...");
      recipe = await client.recipe.update({
        where: { id: existingRecipe.id },
        data: {
          unitProcedures: {
            connect: { id: mashingUnitProcedure.id },
          },
        },
        include: {
          item: true,
          customer: true,
          recipeGroup: true,
          recipeBoms: true,
          unitProcedures: true,
          productionOrders: true,
        },
      });
      console.log("Mashing Recipe updated successfully");
    } else {
      console.log("Creating new Mashing Recipe...");
      recipe = await client.recipe.create({
        data: {
          Recipe: this.RECIPE,
          revision: 1,
          createdBy: this.USER,
          whiskeyType:
            EnumRecipeWhiskeyType[this.detectWhiskeyType(this.MASH_BILL)],
          unitProcedures: {
            connect: { id: mashingUnitProcedure.id },
          },
          customer: {
            connect: { id: customer?.id },
          },
          item: {
            connect: { id: (item as Item).id },
          },
          parameters: {
            connect: newParams.map((param) => ({ id: param.id })),
          },
          customerCode: this.CUSTOMER_CODE,
        },
        include: {
          item: true,
          customer: true,
          recipeGroup: true,
          recipeBoms: true,
          unitProcedures: true,
          productionOrders: true,
        },
      });
      console.log("New Mashing Recipe created successfully:", recipe.id);
    }

    console.log("Publishing Recipe to RabbitMQ...");
    await this.rabbitMQProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Recipe,
      {
        recordName: "Recipe",
        event_type: "create",
        data: recipe,
      }
    );
    console.log("Production order published successfully");

    // Create a recipe group and add the recipe to it
    console.log("Creating recipe group and adding recipe...");
    let recipeGroup: RecipeGroup;
    const recipeGroupName = this.RECIPE.split("-")
      .slice(1, -1)
      .join("-")
      .replace(/\n|\r/g, "");
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

    // Create a sample sales order
    console.log("Creating sample sales order...");

    // Get the current date
    const currentDate = new Date();

    // Calculate the day of the year
    const startOfYear = new Date(currentDate.getFullYear(), 0, 0);
    const diff = currentDate.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    console.log(`Current day of the year: ${dayOfYear}`);

    // Get the most recent production order created today, if it exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentSalesOrder = await client.salesOrder.findFirst({
      where: {
        createdAt: {
          gte: today,
        },
        name: {
          startsWith: "SO",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const salesOrderNumber = mostRecentSalesOrder?.name?.split("SO")[1] ?? "01";
    const newSalesOrderNumber = parseInt(salesOrderNumber, 10) + 1;

    if (mostRecentSalesOrder) {
      console.log(
        `Most recent sales order created today: ${
          mostRecentSalesOrder.name ?? "Unknown"
        }`
      );
    } else {
      console.log("No sales orders created today.");
    }

    const newSalesOrder = await client.salesOrder.create({
      data: {
        item: {
          connect: { id: (item as Item).id },
        },
        customer: {
          connect: { id: customer?.id },
        },
        createdBy: this.USER,
        // orderDate: new Date(),
        // requestedShipDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        quantity: this.ORDER_QTY, // Adjust as needed
        name: await (async () => {
          const baseName = `SO${dayOfYear}${newSalesOrderNumber}`;
          let suffix = 0;
          let finalName = baseName;

          while (
            await client.salesOrder.findFirst({
              where: { name: finalName },
            })
          ) {
            suffix++;
            finalName = `${baseName}-${suffix}`;
          }

          return finalName;
        })(),
        // units: "Barrels",
      },
    });

    console.log("Sample sales order created successfully:", newSalesOrder.id);

    // Update the salesOrder variable for use in production order creation
    const salesOrder = newSalesOrder;

    // Create a sample production order
    console.log("Creating sample production order...");

    const productionOrderName = `PRO${dayOfYear}`;
    const existingProductionOrder = await client.productionOrder.findFirst({
      where: {
        name: {
          contains: productionOrderName,
          mode: "insensitive",
        },
        bom: {
          id: bom?.id,
        },
      },
    });

    // if (existingProductionOrder) {
    //   console.log(`Production order ${productionOrderName} already exists, skipping creation.`);
    // } else {
    // Get the most recent production order created today, if it exists
    today.setHours(0, 0, 0, 0);

    const mostRecentProductionOrder = await client.productionOrder.findFirst({
      where: {
        createdAt: {
          gte: today,
        },
        name: {
          startsWith: "PRO",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const productionOrderNumber =
      mostRecentProductionOrder?.name?.split("PRO")[1] ?? "01";
    const newProductionOrderNumber = parseInt(productionOrderNumber, 10) + 1;

    if (mostRecentProductionOrder) {
      console.log(
        `Most recent production order created today: ${
          mostRecentProductionOrder.name ?? "Unknown"
        }`
      );
    } else {
      console.log("No production orders created today.");
    }

    console.log("Creating new production order...");
    const newProductionOrder = await client.productionOrder.create({
      data: {
        recipe: {
          connect: { id: recipe.id },
        },
        item: {
          connect: { id: (item as Item).id },
        },
        bom: {
          connect: { id: bom?.id },
        },
        customer: {
          connect: { id: customer?.id },
        },
        // salesOrder: {
        //   connect: { id: salesOrder?.id }
        // },
        createdBy: this.USER,
        status: EnumProductionOrderStatus.Initiated,
        customerCode: this.CUSTOMER_CODE,
        units: "Barrels",
        quantity: this.ORDER_QTY,
        name: `${productionOrderName}${newProductionOrderNumber}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        totalCooks: Math.ceil(this.ORDER_QTY / this.BBLS_PER_FERM) * 3,
        totalFermenters: Math.ceil(this.ORDER_QTY / this.BBLS_PER_FERM),
        executedCooks: 0,
        executedFermenters: 0,
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

    // Create a sample schedule order
    console.log("Creating sample schedule order...");
    const scheduleOrderName = `SHO${dayOfYear}`;
    const newScheduleOrder = await client.scheduleOrder.create({
      data: {
        productionOrders: {
          connect: { id: newProductionOrder.id },
        },
        status: EnumScheduleOrderStatus.Scheduled,
        createdBy: this.USER,
        estimatedStart: new Date(),
        estimatedEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 7 days from now
        recipeName: this.RECIPE,
        productionOrderAllocation: this.ORDER_QTY,
        recipeGroup: {
          connect: { id: recipeGroup.id },
        },
        name: `${scheduleOrderName}${newProductionOrderNumber}`,
      },
    });

    console.log(
      "Sample schedule order created successfully:",
      newScheduleOrder.id
    );

    console.log("Publishing schedule order to RabbitMQ...");
    await this.rabbitMQProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Scheduleorder,
      {
        recordName: "ScheduleOrder",
        event_type: "create",
        data: newScheduleOrder,
      }
    );
    console.log("Schedule order published successfully");

    // Create a sample schedule order queue record
    console.log("Creating sample schedule order queue record...");

    const maxQueueIndex = await client.scheduleOrderQueue.findFirst({
      where: {
        queueIndex: {
          not: null,
        },
      },
      orderBy: {
        queueIndex: "desc",
      },
      select: {
        queueIndex: true,
      },
    });

    const newQueueIndex = (maxQueueIndex?.queueIndex ?? 0) + 1;

    const newScheduleOrderQueue = await client.scheduleOrderQueue.create({
      data: {
        scheduleOrder: {
          connect: { id: newScheduleOrder.id },
        },
        queueIndex: newQueueIndex,
        createdBy: this.USER,
        nextUnitProcedureName: EnumUnitProcedureName.Mashing01,
        nextUnitProcedure: {
          connect: { id: mashingUnitProcedure.id },
        },
      },
    });

    console.log(
      "Sample schedule order queue record created successfully:",
      newScheduleOrderQueue.id
    );

    console.log(
      "Sample production order created successfully:",
      newProductionOrder.id
    );
    // }

    // Close the Prisma client connection
    await client.$disconnect();
  }

  private validateGrainAssignmentsAgainstMashBill(
    binAssignments: BinAssignments,
    mashBill: string
  ): boolean {
    this.logger.log('Validating grain assignments against mash bill...');
    
    // Extract grains from mash bill
    const [corn, rye, wheat, malt] = mashBill.split('-').map(Number);
    const mashBillGrains = new Set<string>();
    
    // Only add grains that have non-zero percentages
    if (corn > 0) mashBillGrains.add('Corn');
    if (rye > 0) mashBillGrains.add('Rye');
    if (wheat > 0) mashBillGrains.add('Wheat');
    if (malt > 0) mashBillGrains.add('Malt');

    // Collect all grains from bin assignments
    const assignedGrains = new Set<string>();
    for (const [bin, grains] of Object.entries(binAssignments)) {
      if (typeof grains === 'string') {
        assignedGrains.add(grains);
      } else if (Array.isArray(grains)) {
        grains.forEach(grain => assignedGrains.add(grain));
      }
    }

    // Check if all mash bill grains are assigned to bins
    for (const grain of mashBillGrains) {
      if (!assignedGrains.has(grain)) {
        this.logger.error(`Grain ${grain} from mash bill is not assigned to any bin`);
        return false;
      }
    }

    // Check if there are any extra grains assigned that aren't in the mash bill
    for (const grain of assignedGrains) {
      if (!mashBillGrains.has(grain)) {
        this.logger.error(`Grain ${grain} is assigned to a bin but not present in mash bill`);
        return false;
      }
    }

    this.logger.log('Grain assignments match mash bill components');
    return true;
  }

  private validateBinAssignments(binAssignments: BinAssignments): boolean {
    // First validate the bin structure
    const allowedBins = ["bin1", "bin2", "bin3"]; // Update as needed
    for (const [bin, grains] of Object.entries(binAssignments)) {
      if (!allowedBins.includes(bin)) {
        this.logger.error(`Invalid bin: ${bin}`);
        return false;
      }
      if (typeof grains === "string") {
        // Single grain validation
        if (!this.isValidGrain(grains)) {
          this.logger.error(`Invalid grain: ${grains} in ${bin}`);
          return false;
        }
      } else if (Array.isArray(grains)) {
        // Multiple grains validation
        for (const grain of grains) {
          if (!this.isValidGrain(grain)) {
            this.logger.error(`Invalid grain: ${grain} in ${bin}`);
            return false;
          }
        }
      } else {
        this.logger.error(`Invalid grain type in ${bin}`);
        return false;
      }
    }

    // Then validate against mash bill
    return this.validateGrainAssignmentsAgainstMashBill(binAssignments, this.MASH_BILL);
  }

  private isValidGrain(grain: string): boolean {
    const validGrains = ["Rye", "Corn", "Malt", "Wheat"]; // Extend as needed
    return validGrains.includes(grain);
  }
}
