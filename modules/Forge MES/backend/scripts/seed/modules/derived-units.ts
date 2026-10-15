import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const derivedUnitsModule: SeedModule = {
  name: "derived-units",
  description:
    "Derived unit definitions for Recipe BOM (%, Kg/Fermenter, Lbs/Cook)",
  dependencies: ["units"],
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
      console.log("  └─ Seeding derived units for Recipe BOM...");

      // Check if derived units already exist (using actual DB names)
      const existingPercent = await client.units.findFirst({
        where: { name: { in: ["Percent", "Percentage"] } },
      });
      const existingKgPerFermenter = await client.units.findFirst({
        where: { name: "Kilograms per Fermenter" },
      });
      const existingLbsPerCook = await client.units.findFirst({
        where: {
          name: { in: ["Pounds per Cook", "Pounds per Cook (Enzyme)"] },
        },
      });

      const existingCount = [
        existingPercent,
        existingKgPerFermenter,
        existingLbsPerCook,
      ].filter(Boolean).length;

      if (existingCount === 3 && config.skipExistingData) {
        console.log(`    Found all 3 derived units, skipping`);
        return {
          success: true,
          message: `Skipped - all 3 derived units already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Get base units for FK relationships
      const kilogramUnit = await client.units.findFirst({
        where: { abbreviation: "kg" },
      });
      const gramUnit = await client.units.findFirst({
        where: { abbreviation: "g" },
      });
      const poundUnit = await client.units.findFirst({
        where: { abbreviation: "lb" },
      });

      if (!poundUnit) {
        throw new Error(
          "Pound base unit not found - ensure units module runs first"
        );
      }

      if (!kilogramUnit && !gramUnit) {
        warnings.push(
          "Neither Kilogram nor Gram base unit found - will skip Kilograms per Fermenter unit"
        );
      }

      // Create Percent unit (for grain mash bill ratios) if not already present
      if (!existingPercent) {
        await client.units.create({
          data: {
            name: "Percent",
            abbreviation: "%",
            pluralName: "Percent",
            pluralAbbreviation: "%",
            isBaseUnit: false,
            mesConfiguredUnit: true,
            createdBy: "system",
            conversions: {
              factor: 1,
              type: "ratio",
            },
            // perOperation is null for percentages (standalone ratio unit)
          },
        });
        recordsCreated++;
        console.log(`    Created Percent (%) unit`);
      } else {
        console.log(
          `    Percent unit already exists as "${existingPercent.name}"`
        );
      }

      // Create Kilograms per Fermenter unit (for yeast) - use Gram as base if Kilogram not available
      if (!existingKgPerFermenter) {
        const baseUnit = kilogramUnit || gramUnit;
        if (baseUnit) {
          const baseAbbrev = kilogramUnit ? "kg" : "g";
          const conversionFactor = kilogramUnit ? 1 : 1000; // 1 kg = 1000 g

          await client.units.create({
            data: {
              name: "Kilograms per Fermenter",
              abbreviation: "Kg/Fermenter",
              pluralName: "Kilograms per Fermenter",
              pluralAbbreviation: "Kg/Fermenter",
              isBaseUnit: false,
              baseUnitId: baseUnit.id,
              mesConfiguredUnit: true,
              perOperation: "PerFermenter",
              createdBy: "system",
              conversions: {
                factor: conversionFactor,
                baseTo: baseAbbrev,
                type: "per_operation",
              },
            },
          });
          recordsCreated++;
          console.log(
            `    Created Kilograms per Fermenter unit (using ${baseUnit.name} as base)`
          );
        } else {
          warnings.push(
            "Skipped Kilograms per Fermenter - no suitable base unit found"
          );
        }
      } else {
        console.log(`    Kilograms per Fermenter unit already exists`);
      }

      // Create Pounds per Cook unit (for enzymes) if not already present
      if (!existingLbsPerCook) {
        await client.units.create({
          data: {
            name: "Pounds per Cook",
            abbreviation: "Lbs/Cook",
            pluralName: "Pounds per Cook",
            pluralAbbreviation: "Lbs/Cook",
            isBaseUnit: false,
            baseUnitId: poundUnit.id,
            mesConfiguredUnit: true,
            perOperation: "PerCook",
            createdBy: "system",
            conversions: {
              factor: 1,
              baseTo: "lb",
              type: "per_operation",
            },
          },
        });
        recordsCreated++;
        console.log(`    Created Pounds per Cook unit`);
      } else {
        console.log(
          `    Pounds per Cook unit already exists as "${existingLbsPerCook.name}"`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} derived units`
            : "All derived units already exist",
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
          : "Unknown error in derived-units seeding";
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
      // Validate all three derived units exist (using flexible name matching)
      const percentUnit = await client.units.findFirst({
        where: { name: { in: ["Percent", "Percentage"] } },
      });
      const kgPerFermenterUnit = await client.units.findFirst({
        where: { name: "Kilograms per Fermenter" },
      });
      const lbsPerCookUnit = await client.units.findFirst({
        where: {
          name: { in: ["Pounds per Cook", "Pounds per Cook (Enzyme)"] },
        },
      });

      if (percentUnit) {
        recordsValidated++;
        if (percentUnit.name !== "Percent") {
          warnings.push(
            `Percent unit found as "${percentUnit.name}" instead of "Percent"`
          );
        }
      } else {
        errors.push("Missing derived unit: Percent (%) or Percentage");
      }

      if (kgPerFermenterUnit) recordsValidated++;
      else
        warnings.push(
          "Missing derived unit: Kilograms per Fermenter (may be skipped if base unit unavailable)"
        );

      if (lbsPerCookUnit) {
        recordsValidated++;
        if (lbsPerCookUnit.name !== "Pounds per Cook") {
          warnings.push(
            `Pounds per Cook unit found as "${lbsPerCookUnit.name}" instead of "Pounds per Cook"`
          );
        }
      } else {
        errors.push("Missing derived unit: Pounds per Cook");
      }

      // Validate perOperation values are set correctly
      if (
        kgPerFermenterUnit &&
        kgPerFermenterUnit.perOperation !== "PerFermenter"
      ) {
        errors.push(
          `Kilograms per Fermenter has incorrect perOperation: ${kgPerFermenterUnit.perOperation}`
        );
      }

      if (lbsPerCookUnit && lbsPerCookUnit.perOperation !== "PerCook") {
        errors.push(
          `Pounds per Cook has incorrect perOperation: ${lbsPerCookUnit.perOperation}`
        );
      }

      // Validate mesConfiguredUnit flag is set
      if (percentUnit && !percentUnit.mesConfiguredUnit) {
        warnings.push("Percent unit should have mesConfiguredUnit = true");
      }
      if (kgPerFermenterUnit && !kgPerFermenterUnit.mesConfiguredUnit) {
        warnings.push(
          "Kilograms per Fermenter should have mesConfiguredUnit = true"
        );
      }
      if (lbsPerCookUnit && !lbsPerCookUnit.mesConfiguredUnit) {
        warnings.push("Pounds per Cook should have mesConfiguredUnit = true");
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
