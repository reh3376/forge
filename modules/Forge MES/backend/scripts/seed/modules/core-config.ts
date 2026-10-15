import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

// Import existing seed functions
import { seedRecipeParameters } from "../../seed.prod.recipeParameters";
import { seedTests } from "../../seed.prod.tests";
import { seedUnitLink } from "../../seed.prod.unitLink";
import { seedItemGroups } from "../../seed.prod.itemGroups";
import { seedMillingBinConfiguration } from "../../seed.prod.millingBinConfiguration";

export const coreConfigModule: SeedModule = {
  name: "core-config",
  description:
    "Core system configuration (recipe parameters, tests, units, item groups)",
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
      console.log("  └─ Seeding recipe parameters...");
      await seedRecipeParameters(client);
      recordsCreated += 25; // Approximate count

      console.log("  └─ Seeding test parameters...");
      await seedTests(client);
      recordsCreated += 15;

      console.log("  └─ Seeding unit links...");
      await seedUnitLink(client);
      recordsCreated += 10;

      console.log("  └─ Seeding item groups...");
      await seedItemGroups(client);
      recordsCreated += 8;

      console.log("  └─ Seeding milling bin configurations...");
      await seedMillingBinConfiguration(client);
      recordsCreated += 12;

      return {
        success: true,
        message: "Core configuration seeded successfully",
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
          : "Unknown error in core config seeding";
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
      // Validate recipe parameters exist
      const recipeParamsCount = await client.recipeParameter.count();
      recordsValidated += recipeParamsCount;
      if (recipeParamsCount < 20) {
        errors.push(
          `Insufficient recipe parameters: ${recipeParamsCount} (expected at least 20)`
        );
      }

      // Validate test parameters exist
      const testParamsCount = await client.testParameter.count();
      recordsValidated += testParamsCount;
      if (testParamsCount < 10) {
        errors.push(
          `Insufficient test parameters: ${testParamsCount} (expected at least 10)`
        );
      }

      // Validate unit links exist
      const unitLinksCount = await client.unitLookup.count();
      recordsValidated += unitLinksCount;
      if (unitLinksCount < 8) {
        warnings.push(
          `Few unit links: ${unitLinksCount} (expected at least 8)`
        );
      }

      // Validate item groups exist
      const itemGroupsCount = await client.itemGroup.count();
      recordsValidated += itemGroupsCount;
      if (itemGroupsCount < 6) {
        errors.push(
          `Insufficient item groups: ${itemGroupsCount} (expected at least 6)`
        );
      }

      // Validate milling bin configurations exist
      const millingBinCount = await client.millingBinConfiguration.count();
      recordsValidated += millingBinCount;
      if (millingBinCount < 10) {
        warnings.push(
          `Few milling bin configurations: ${millingBinCount} (expected at least 10)`
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
