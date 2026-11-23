import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const itemGroupsModule: SeedModule = {
  name: "item-groups",
  description: "Item classification groups for inventory organization",
  dependencies: [],
  priority: SEED_PRIORITIES.CORE_CONFIG,
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
      console.log("  └─ Seeding item groups...");

      const itemGroups = [
        { name: "RM-GR-COR", description: "Raw Material - Grains - Corn" },
        { name: "RM-GR-RYE", description: "Raw Material - Grains - Rye" },
        { name: "RM-GR-BRY", description: "Raw Material - Grains - Barley" },
        { name: "RM-GR-WHT", description: "Raw Material - Grains - Wheat" },
        { name: "RM-ENZ", description: "Raw Material - Enzymes" },
        { name: "RM-YEA", description: "Raw Material - Yeast" },
        { name: "RM-BBL", description: "Raw Material - Barrels" },
        { name: "CP-BBL", description: "Co-Product - Barrels" },
        { name: "FG-BBL", description: "Finished Goods - Barrels" },
        {
          name: "FG-SST",
          description: "Finished Goods - Stainless Steel Tanks",
        },
        { name: "FG-IBC", description: "Finished Goods - IBC Totes" },
        { name: "FG-DRM", description: "Finished Goods - Drums" },
      ];

      // Check existing item groups
      const existingCount = await client.itemGroup.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing item groups, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} item groups already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create item groups
      if (existingCount === 0) {
        await client.itemGroup.createMany({
          data: itemGroups,
        });
        recordsCreated = itemGroups.length;
        console.log(`    Created ${recordsCreated} item groups`);
      } else {
        console.log(
          `    Skipped creating item groups - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} item groups`
            : "Skipped - item groups already exist",
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
          : "Unknown error in item groups seeding";
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
      // Validate item groups exist
      const itemGroupsCount = await client.itemGroup.count();
      recordsValidated += itemGroupsCount;

      if (itemGroupsCount < 8) {
        errors.push(
          `Insufficient item groups: ${itemGroupsCount} (expected at least 8)`
        );
      }

      // Check for specific required groups
      const requiredGroups = ["RM-GR-COR", "RM-GR-RYE", "RM-ENZ", "FG-BBL"];
      for (const groupName of requiredGroups) {
        const group = await client.itemGroup.findFirst({
          where: { name: groupName },
        });
        if (!group) {
          errors.push(`Missing required item group: ${groupName}`);
        }
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
