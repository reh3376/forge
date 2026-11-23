import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const unitsModule: SeedModule = {
  name: "units",
  description: "Unit of measure definitions and conversions",
  dependencies: ["item-groups"],
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
      console.log("  └─ Seeding units with FK relationships...");

      // Step 1: Ensure base units exist
      const baseUnits = [
        {
          name: "Pound",
          abbreviation: "lb",
          pluralName: "Pounds",
          isBaseUnit: true,
          createdBy: "system",
          conversions: { factor: 1, type: "mass" },
        },
        {
          name: "Gallon",
          abbreviation: "gal",
          pluralName: "Gallons",
          isBaseUnit: true,
          createdBy: "system",
          conversions: { factor: 1, type: "volume" },
        },
        {
          name: "Each",
          abbreviation: "ea",
          pluralName: "Each",
          isBaseUnit: true,
          createdBy: "system",
          conversions: { factor: 1, type: "count" },
        },
      ];

      for (const unit of baseUnits) {
        const existing = await client.units.findFirst({
          where: { abbreviation: unit.abbreviation },
        });
        if (!existing) {
          await client.units.create({ data: unit });
          recordsCreated++;
        } else {
          // Optional: update if needed, but skipping for now to preserve existing data
          // await client.units.update({ where: { id: existing.id }, data: unit });
          // recordsUpdated++;
        }
      }

      // Step 2: Get base unit IDs for FK relationships
      const poundUnit = await client.units.findFirst({
        where: { abbreviation: "lb" },
      });
      const gallonUnit = await client.units.findFirst({
        where: { abbreviation: "gal" },
      });

      if (!poundUnit || !gallonUnit) {
        throw new Error(
          "Failed to create or find base units for FK relationships"
        );
      }

      // Step 3: Ensure derived units exist
      const derivedUnits = [
        {
          name: "Ounce",
          abbreviation: "oz",
          pluralName: "Ounces",
          isBaseUnit: false,
          baseUnitId: poundUnit.id,
          createdBy: "system",
          conversions: { factor: 0.0625, baseTo: "lb", type: "mass" },
        },
        {
          name: "Kilogram",
          abbreviation: "kg",
          pluralName: "Kilograms",
          isBaseUnit: false,
          baseUnitId: poundUnit.id,
          createdBy: "system",
          conversions: { factor: 2.20462, baseTo: "lb", type: "mass" },
        },
        {
          name: "Liter",
          abbreviation: "L",
          pluralName: "Liters",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 0.264172, baseTo: "gal", type: "volume" },
        },
        {
          name: "Barrel",
          abbreviation: "bbl",
          pluralName: "Barrels",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 31.5, baseTo: "gal", type: "volume" },
        },
        {
          name: "Proof Gallon",
          abbreviation: "proof gal",
          pluralName: "Proof Gallons",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 1, baseTo: "gal", type: "proof_volume" },
        },

        // Container-based units
        {
          name: "53-Gallon Barrel",
          abbreviation: "53-bbl",
          pluralName: "53-Gallon Barrels",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 53, baseTo: "gal", type: "volume" },
        },
        {
          name: "30-Gallon Barrel",
          abbreviation: "30-bbl",
          pluralName: "30-Gallon Barrels",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 30, baseTo: "gal", type: "volume" },
        },
        {
          name: "Plastic Drum",
          abbreviation: "drum",
          pluralName: "Plastic Drums",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 55, baseTo: "gal", type: "volume" },
        },
        {
          name: "275-Gallon IBC Tote",
          abbreviation: "ibc-275",
          pluralName: "275-Gallon IBC Totes",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 275, baseTo: "gal", type: "volume" },
        },
        {
          name: "275-Gallon SS Tote",
          abbreviation: "ss-275",
          pluralName: "275-Gallon SS Totes",
          isBaseUnit: false,
          baseUnitId: gallonUnit.id,
          createdBy: "system",
          conversions: { factor: 275, baseTo: "gal", type: "volume" },
        },
      ];

      for (const unit of derivedUnits) {
        const existing = await client.units.findFirst({
          where: { abbreviation: unit.abbreviation },
        });
        if (!existing) {
          await client.units.create({ data: unit });
          recordsCreated++;
        } else {
          // Optional: update logic here if needed
        }
      }
      console.log(
        `    Processed units. Created: ${recordsCreated}, Existing: ${
          derivedUnits.length + baseUnits.length - recordsCreated
        }`
      );

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} units`
            : "Skipped - units already exist",
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
          : "Unknown error in units seeding";
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
      // Validate units exist
      const unitsCount = await client.units.count();
      recordsValidated += unitsCount;

      if (unitsCount < 6) {
        errors.push(`Insufficient units: ${unitsCount} (expected at least 6)`);
      }

      // Check for base units
      const baseUnitsCount = await client.units.count({
        where: { isBaseUnit: true },
      });
      if (baseUnitsCount < 2) {
        errors.push(
          `Insufficient base units: ${baseUnitsCount} (expected at least 2)`
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
