import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const unitLinksModule: SeedModule = {
  name: "unit-links",
  description: "Unit conversion links and lookup data",
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
      console.log("  └─ Seeding unit links...");

      const unitLinks = [
        {
          name: "Pound",
          pluralName: "Pounds",
          typeName: "Mass (Pound)",
          abbreviation: "lb",
          pluralAbbreviation: "lb",
          conversionRate: 1,
          baseUnit: true,
        },
        {
          name: "Ounce",
          pluralName: "Ounces",
          typeName: "Mass (Ounce)",
          abbreviation: "oz",
          pluralAbbreviation: "oz",
          conversionRate: 0.0625,
          baseUnit: false,
        },
        {
          name: "Kilogram",
          pluralName: "Kilograms",
          typeName: "Mass (Kilogram)",
          abbreviation: "kg",
          pluralAbbreviation: "kg",
          conversionRate: 2.20462,
          baseUnit: false,
        },
        {
          name: "Gram",
          pluralName: "Grams",
          typeName: "Mass (Gram)",
          abbreviation: "g",
          pluralAbbreviation: "g",
          conversionRate: 0.00220462,
          baseUnit: false,
        },
        {
          name: "Gallon",
          pluralName: "Gallons",
          typeName: "Volume (Gallon)",
          abbreviation: "gal",
          pluralAbbreviation: "gal",
          conversionRate: 1,
          baseUnit: true,
        },
        {
          name: "Liter",
          pluralName: "Liters",
          typeName: "Volume (Liter)",
          abbreviation: "L",
          pluralAbbreviation: "L",
          conversionRate: 0.264172,
          baseUnit: false,
        },
        {
          name: "Barrel",
          pluralName: "Barrels",
          typeName: "Volume (Barrel)",
          abbreviation: "bbl",
          pluralAbbreviation: "bbl",
          conversionRate: 31.5,
          baseUnit: false,
        },
        {
          name: "Proof Gallon",
          pluralName: "Proof Gallons",
          typeName: "Volume (Proof Gallon)",
          abbreviation: "proof gal",
          pluralAbbreviation: "proof gal",
          conversionRate: 1,
          baseUnit: false,
        },
      ];

      // Check existing unit links
      const existingCount = await client.unitLookup.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing unit links, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} unit links already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create unit links (only if table is empty to avoid duplicates)
      if (existingCount === 0) {
        await client.unitLookup.createMany({
          data: unitLinks,
        });
        recordsCreated = unitLinks.length;
        console.log(`    Created ${recordsCreated} unit links`);
      } else {
        console.log(
          `    Skipped creating unit links - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} unit links`
            : "Skipped - unit links already exist",
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
          : "Unknown error in unit links seeding";
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
      // Validate unit links exist
      const unitLinksCount = await client.unitLookup.count();
      recordsValidated += unitLinksCount;

      if (unitLinksCount < 5) {
        errors.push(
          `Insufficient unit links: ${unitLinksCount} (expected at least 5)`
        );
      }

      // Check for base units
      const baseUnitsCount = await client.unitLookup.count({
        where: { baseUnit: true },
      });
      if (baseUnitsCount < 1) {
        errors.push(
          `Insufficient base units: ${baseUnitsCount} (expected at least 1)`
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
