import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const recipeGroupsModule: SeedModule = {
  name: "recipe-groups",
  description: "Recipe groups for organizing and versioning recipes",
  dependencies: [],
  priority: SEED_PRIORITIES.RECIPES,
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
      console.log("  └─ Seeding recipe groups...");

      const recipeGroups = [
        {
          recipe: "Bourbon-Standard",
          revision: 1,
          createdBy: "system",
        },
        {
          recipe: "Bourbon-Premium",
          revision: 1,
          createdBy: "system",
        },
        {
          recipe: "RyeWhiskey-Classic",
          revision: 1,
          createdBy: "system",
        },
        {
          recipe: "RyeWhiskey-HighRye",
          revision: 1,
          createdBy: "system",
        },
        {
          recipe: "WheatedBourbon-Soft",
          revision: 1,
          createdBy: "system",
        },
        {
          recipe: "Bourbon-SingleBarrel",
          revision: 1,
          createdBy: "system",
        },
      ];

      // Check existing recipe groups
      const existingCount = await client.recipeGroup.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing recipe groups, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} recipe groups already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create recipe groups
      if (existingCount === 0) {
        await client.recipeGroup.createMany({
          data: recipeGroups,
        });
        recordsCreated = recipeGroups.length;
        console.log(`    Created ${recordsCreated} recipe groups`);
      } else {
        console.log(
          `    Skipped creating recipe groups - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} recipe groups`
            : "Skipped - recipe groups already exist",
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
          : "Unknown error in recipe groups seeding";
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
      // Validate recipe groups exist
      const groupsCount = await client.recipeGroup.count();
      recordsValidated += groupsCount;

      if (groupsCount < 4) {
        errors.push(
          `Insufficient recipe groups: ${groupsCount} (expected at least 4)`
        );
      }

      // Check for specific required groups
      const bourbonGroups = await client.recipeGroup.count({
        where: { recipe: { contains: "Bourbon" } },
      });
      if (bourbonGroups < 2) {
        warnings.push(
          `Few bourbon recipe groups: ${bourbonGroups} (expected at least 2)`
        );
      }

      const ryeGroups = await client.recipeGroup.count({
        where: { recipe: { contains: "Rye" } },
      });
      if (ryeGroups < 1) {
        warnings.push(`No rye recipe groups found`);
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
