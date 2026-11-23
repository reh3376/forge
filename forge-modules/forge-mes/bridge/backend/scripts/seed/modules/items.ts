import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const itemsModule: SeedModule = {
  name: "items",
  description: "Raw materials, finished goods, and process items",
  dependencies: ["vendors-customers", "core-config"],
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
      // Get vendor IDs for foreign key relationships
      const grainVendor = await client.vendor.findFirst({
        where: { name: "Prairie Grain Cooperative" },
      });
      const yeastVendor = await client.vendor.findFirst({
        where: { name: "Lallemand Distilling" },
      });
      const enzymeVendor = await client.vendor.findFirst({
        where: { name: "Novozymes Biologicals" },
      });
      const barrelVendor = await client.vendor.findFirst({
        where: { name: "Independent Stave Company" },
      });

      if (!grainVendor || !yeastVendor || !enzymeVendor) {
        errors.push(
          "Required vendors not found - cannot create items with proper relationships"
        );
        return {
          success: false,
          message: "Missing required vendor relationships",
          recordsCreated,
          recordsUpdated,
          errors,
          warnings,
          executionTimeMs: Date.now() - startTime,
        };
      }

      console.log("  └─ Seeding raw materials...");

      const itemsData = [
        // Raw Materials - Grains
        {
          id: "item-corn-001",
          itemNumber: "RM-CORN-001",
          itemName: "Corn #2 Yellow Dent",
          itemDescription: "Premium #2 Yellow Dent Corn for Bourbon Production",
          itemType: "RawMaterial",
          itemClass: "Grain",
          itemGroup: "Corn",
          erpId: "ERP-RM-001",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: grainVendor.id,
        },
        {
          id: "item-rye-001",
          itemNumber: "RM-RYE-001",
          itemName: "Rye Grain",
          itemDescription: "Premium Rye Grain for Whiskey Production",
          itemType: "RawMaterial",
          itemClass: "Grain",
          itemGroup: "Rye",
          erpId: "ERP-RM-002",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: grainVendor.id,
        },
        {
          id: "item-wheat-001",
          itemNumber: "RM-WHEAT-001",
          itemName: "Winter Wheat",
          itemDescription: "Soft Red Winter Wheat for Wheated Bourbon",
          itemType: "RawMaterial",
          itemClass: "Grain",
          itemGroup: "Wheat",
          erpId: "ERP-RM-003",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: grainVendor.id,
        },
        {
          id: "item-malt-001",
          itemNumber: "RM-MALT-001",
          itemName: "Malted Barley",
          itemDescription: "6-Row Malted Barley for Enzyme Conversion",
          itemType: "RawMaterial",
          itemClass: "Grain",
          itemGroup: "Malt",
          erpId: "ERP-RM-004",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: grainVendor.id,
        },
        // Yeast
        {
          id: "item-yeast-001",
          itemNumber: "RM-YEAST-001",
          itemName: "DistilaMax MW",
          itemDescription:
            "Active Dry Distillers Yeast for Whiskey Fermentation",
          itemType: "RawMaterial",
          itemClass: "Yeast",
          itemGroup: "Yeast",
          erpId: "ERP-RM-005",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: yeastVendor.id,
        },
        // Enzymes
        {
          id: "item-enzyme-alpha-001",
          itemNumber: "RM-ENZ-001",
          itemName: "Liquozyme SC DS",
          itemDescription: "Alpha-Amylase Enzyme for Starch Liquefaction",
          itemType: "ProcessAid",
          itemClass: "Enzyme",
          itemGroup: "Enzyme",
          erpId: "ERP-RM-006",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: enzymeVendor.id,
        },
        {
          id: "item-enzyme-gluco-001",
          itemNumber: "RM-ENZ-002",
          itemName: "SAN Super 240L",
          itemDescription: "Glucoamylase Enzyme for Starch Saccharification",
          itemType: "ProcessAid",
          itemClass: "Enzyme",
          itemGroup: "Enzyme",
          erpId: "ERP-RM-007",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
          vendorId: enzymeVendor.id,
        },
        // Process Aids
        {
          id: "item-water-001",
          itemNumber: "PA-WATER-001",
          itemName: "Process Water",
          itemDescription: "Treated Process Water for Mashing and Fermentation",
          itemType: "ProcessAid",
          itemClass: "Water",
          itemGroup: "Water",
          erpId: "ERP-PA-001",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
        },
        {
          id: "item-citric-acid-001",
          itemNumber: "PA-CITRIC-001",
          itemName: "Citric Acid",
          itemDescription: "Food Grade Citric Acid for pH Adjustment",
          itemType: "ProcessAid",
          itemClass: "Acid",
          itemGroup: "Acid",
          erpId: "ERP-PA-002",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
        },
      ];

      // Add packaging items if barrel vendor exists
      if (barrelVendor) {
        itemsData.push(
          {
            id: "item-barrel-53-001",
            itemNumber: "PKG-BARREL-53",
            itemName: "53-Gallon Oak Barrel",
            itemDescription: "New 53-Gallon American Oak Barrel #3 Char",
            itemType: "Packaging",
            itemClass: "Barrel",
            itemGroup: "Barrel",
            erpId: "ERP-PKG-001",
            active: true,
            createdBy: "system-migration",
            updatedBy: "system-migration",
            itemRevision: 0,
            updatedAt: new Date(),
            vendorId: barrelVendor.id,
          },
          {
            id: "item-barrel-30-001",
            itemNumber: "PKG-BARREL-30",
            itemName: "30-Gallon Oak Barrel",
            itemDescription: "New 30-Gallon American Oak Barrel #3 Char",
            itemType: "Packaging",
            itemClass: "Barrel",
            itemGroup: "Barrel",
            erpId: "ERP-PKG-002",
            active: true,
            createdBy: "system-migration",
            updatedBy: "system-migration",
            itemRevision: 0,
            updatedAt: new Date(),
            vendorId: barrelVendor.id,
          }
        );
      }

      const itemResult = await client.item.createMany({
        data: itemsData,
        skipDuplicates: true,
      });
      recordsCreated += itemResult.count;

      console.log("  └─ Seeding finished goods...");

      const finishedGoodsData = [
        {
          id: "item-bourbon-rye-001",
          itemNumber: "FG-BOURBON-001",
          itemName: "Premium Rye Bourbon",
          itemDescription:
            "High Rye Bourbon Whiskey (75% Corn, 21% Rye, 4% Malt)",
          itemType: "FinishedGood",
          itemClass: "Whiskey",
          itemGroup: "Bourbon",
          erpId: "ERP-FG-001",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
        },
        {
          id: "item-bourbon-wheated-001",
          itemNumber: "FG-BOURBON-002",
          itemName: "Wheated Bourbon",
          itemDescription:
            "Wheated Bourbon Whiskey (68% Corn, 16% Wheat, 16% Malt)",
          itemType: "FinishedGood",
          itemClass: "Whiskey",
          itemGroup: "Bourbon",
          erpId: "ERP-FG-002",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
        },
        {
          id: "item-rye-whiskey-001",
          itemNumber: "FG-RYE-001",
          itemName: "95% Rye Whiskey",
          itemDescription: "High Rye Whiskey (51% Rye, 35% Corn, 14% Malt)",
          itemType: "FinishedGood",
          itemClass: "Whiskey",
          itemGroup: "Rye",
          erpId: "ERP-FG-003",
          active: true,
          createdBy: "system-migration",
          updatedBy: "system-migration",
          itemRevision: 0,
          updatedAt: new Date(),
        },
      ];

      const finishedGoodsResult = await client.item.createMany({
        data: finishedGoodsData,
        skipDuplicates: true,
      });
      recordsCreated += finishedGoodsResult.count;

      return {
        success: true,
        message: "Items seeded successfully",
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
          : "Unknown error in items seeding";
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
      // Validate minimum number of items exist
      const totalItems = await client.item.count();
      recordsValidated += totalItems;
      if (totalItems < 10) {
        errors.push(`Insufficient items: ${totalItems} (expected at least 10)`);
      }

      // Validate items by type
      const itemsByType = await client.item.groupBy({
        by: ["itemType"],
        _count: { itemType: true },
      });

      const typeCounts = itemsByType.reduce((acc, item) => {
        acc[item.itemType] = item._count.itemType;
        return acc;
      }, {} as Record<string, number>);

      if (!typeCounts["RawMaterial"] || typeCounts["RawMaterial"] < 5) {
        errors.push(
          `Insufficient raw materials: ${
            typeCounts["RawMaterial"] || 0
          } (expected at least 5)`
        );
      }

      if (!typeCounts["FinishedGood"] || typeCounts["FinishedGood"] < 2) {
        warnings.push(
          `Few finished goods: ${
            typeCounts["FinishedGood"] || 0
          } (expected at least 2)`
        );
      }

      // Validate required grains exist
      const requiredGrains = [
        "Corn #2 Yellow Dent",
        "Rye Grain",
        "Malted Barley",
      ];
      for (const grainName of requiredGrains) {
        const grain = await client.item.findFirst({
          where: { itemName: grainName },
        });
        if (!grain) {
          errors.push(`Required grain not found: ${grainName}`);
        }
      }

      // Validate vendor relationships
      const itemsWithoutVendors = await client.item.count({
        where: {
          itemType: "RawMaterial",
          vendorId: null,
        },
      });

      if (itemsWithoutVendors > 0) {
        warnings.push(
          `${itemsWithoutVendors} raw materials without vendor relationships`
        );
      }

      // Validate unique item numbers
      const duplicateItemNumbers = await client.item.groupBy({
        by: ["itemNumber"],
        _count: { itemNumber: true },
        having: { itemNumber: { _count: { gt: 1 } } },
      });

      if (duplicateItemNumbers.length > 0) {
        errors.push(
          `Duplicate item numbers found: ${duplicateItemNumbers
            .map((i) => i.itemNumber)
            .join(", ")}`
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
