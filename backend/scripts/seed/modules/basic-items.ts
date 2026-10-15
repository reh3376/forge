import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const basicItemsModule: SeedModule = {
  name: "basic-items",
  description: "Essential inventory items for distillery operations",
  dependencies: ["item-groups", "units"],
  priority: SEED_PRIORITIES.ITEMS,
  enabled: true,

  runner: async (
    client: PrismaClient,
    config: SeedConfig
  ): Promise<SeedResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      console.log("  └─ Seeding basic items...");

      const items = [
        {
          itemName: "Yellow Corn",
          itemNumber: "RM-COR-001",
          itemDescription: "Premium yellow corn for mashing",
          erpId: "ERP-COR-001",
          itemClass: "RawMaterial",
          itemType: "Grain",
          itemGroup: "RM-GR-COR",
          createdBy: "system",
        },
        {
          itemName: "Red Winter Wheat",
          itemNumber: "RM-WHT-001",
          itemDescription: "Red winter wheat for wheated bourbon",
          erpId: "ERP-WHT-001",
          itemClass: "RawMaterial",
          itemType: "Grain",
          itemGroup: "RM-GR-WHT",
          createdBy: "system",
        },
        {
          itemName: "Rye Grain",
          itemNumber: "RM-RYE-001",
          itemDescription: "Rye grain for spice character",
          erpId: "ERP-RYE-001",
          itemClass: "RawMaterial",
          itemType: "Grain",
          itemGroup: "RM-GR-RYE",
          createdBy: "system",
        },
        {
          itemName: "Malted Barley",
          itemNumber: "RM-BRY-001",
          itemDescription: "Two-row malted barley for enzymes",
          erpId: "ERP-BRY-001",
          itemClass: "RawMaterial",
          itemType: "Grain",
          itemGroup: "RM-GR-BRY",
          createdBy: "system",
        },
        {
          itemName: "Alpha-Amylase Enzyme",
          itemNumber: "RM-ENZ-001",
          itemDescription: "Heat-stable alpha-amylase enzyme",
          erpId: "ERP-ENZ-001",
          itemClass: "RawMaterial",
          itemType: "Enzyme",
          itemGroup: "RM-ENZ",
          createdBy: "system",
        },
        {
          itemName: "Distillers Yeast",
          itemNumber: "RM-YEA-001",
          itemDescription: "Specialized distilling yeast strain",
          erpId: "ERP-YEA-001",
          itemClass: "RawMaterial",
          itemType: "Yeast",
          itemGroup: "RM-YEA",
          createdBy: "system",
        },
        {
          itemName: "New American Oak Barrel",
          itemNumber: "RM-BBL-001",
          itemDescription: "#3 char new American oak aging barrel",
          erpId: "ERP-BBL-001",
          itemClass: "RawMaterial",
          itemType: "Container",
          itemGroup: "RM-BBL",
          createdBy: "system",
        },
        {
          itemName: "Bourbon Whiskey",
          itemNumber: "FG-BBL-001",
          itemDescription: "Aged bourbon whiskey in barrel",
          erpId: "ERP-FG-001",
          itemClass: "FinishedGoods",
          itemType: "Whiskey",
          itemGroup: "FG-BBL",
          createdBy: "system",
        },
        {
          itemName: "Rye Whiskey",
          itemNumber: "FG-BBL-002",
          itemDescription: "Aged rye whiskey in barrel",
          erpId: "ERP-FG-002",
          itemClass: "FinishedGoods",
          itemType: "Whiskey",
          itemGroup: "FG-BBL",
          createdBy: "system",
        },
        {
          itemName: "Wheated Bourbon",
          itemNumber: "FG-BBL-003",
          itemDescription: "Aged wheated bourbon in barrel",
          erpId: "ERP-FG-003",
          itemClass: "FinishedGoods",
          itemType: "Whiskey",
          itemGroup: "FG-BBL",
          createdBy: "system",
        },
      ];

      // Check existing items
      const existingCount = await client.item.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing items, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} items already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create items
      if (existingCount === 0) {
        await client.item.createMany({
          data: items,
        });
        recordsCreated = items.length;
        console.log(`    Created ${recordsCreated} items`);
      } else {
        console.log(
          `    Skipped creating items - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} items`
            : "Skipped - items already exist",
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error in basic items seeding";
      errors.push(errorMessage);

      return {
        success: false,
        message: errorMessage,
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    }
  },

  validator: async (client: PrismaClient): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsValidated = 0;

    try {
      // Validate items exist
      const itemsCount = await client.item.count();
      recordsValidated += itemsCount;

      if (itemsCount < 8) {
        errors.push(`Insufficient items: ${itemsCount} (expected at least 8)`);
      }

      // Check for required raw materials
      const rawMaterialsCount = await client.item.count({
        where: { itemClass: "RawMaterial" },
      });
      if (rawMaterialsCount < 5) {
        errors.push(
          `Insufficient raw materials: ${rawMaterialsCount} (expected at least 5)`
        );
      }

      // Check for finished goods
      const finishedGoodsCount = await client.item.count({
        where: { itemClass: "FinishedGoods" },
      });
      if (finishedGoodsCount < 2) {
        warnings.push(
          `Few finished goods: ${finishedGoodsCount} (expected at least 2)`
        );
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        recordsValidated,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Validation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings,
        recordsValidated,
      };
    }
  },
};
