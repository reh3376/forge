import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const unitsItemGroupsModule: SeedModule = {
  name: "units-itemgroups",
  description: "Link units to appropriate item groups for inventory management",
  dependencies: ["units", "item-groups"],
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
      console.log("  └─ Linking units to item groups...");

      // Get existing units and item groups
      const units = await client.units.findMany();
      const itemGroups = await client.itemGroup.findMany();

      if (units.length === 0) {
        throw new Error("No units found - units module must run first");
      }
      if (itemGroups.length === 0) {
        throw new Error(
          "No item groups found - item-groups module must run first"
        );
      }

      // Define mappings of units to item groups
      const unitGroupMappings = [
        // Mass units go with grain groups
        { unitAbbr: "lb", itemGroupName: "RM-GR-COR" },
        { unitAbbr: "oz", itemGroupName: "RM-GR-RYE" },
        { unitAbbr: "kg", itemGroupName: "RM-GR-BRY" },

        // Volume units go with liquid/barrel groups
        { unitAbbr: "gal", itemGroupName: "FG-BBL" },
        { unitAbbr: "bbl", itemGroupName: "FG-BBL" },
        { unitAbbr: "L", itemGroupName: "FG-SST" },

        // Count units go with discrete items
        { unitAbbr: "ea", itemGroupName: "RM-BBL" },
      ];

      for (const mapping of unitGroupMappings) {
        const unit = units.find((u) => u.abbreviation === mapping.unitAbbr);
        const itemGroup = itemGroups.find(
          (ig) => ig.name === mapping.itemGroupName
        );

        if (unit && itemGroup && !unit.itemGroupId) {
          await client.units.update({
            where: { id: unit.id },
            data: { itemGroupId: itemGroup.id },
          });
          recordsUpdated++;
          console.log(
            `    Linked ${unit.name} (${unit.abbreviation}) → ${itemGroup.name}`
          );
        } else if (unit && itemGroup) {
          console.log(`    Skipped ${unit.name} - already linked`);
        } else {
          warnings.push(
            `Could not find unit ${mapping.unitAbbr} or item group ${mapping.itemGroupName}`
          );
        }
      }

      return {
        success: true,
        message:
          recordsUpdated > 0
            ? `Successfully linked ${recordsUpdated} units to item groups`
            : "No units needed linking",
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
          : "Unknown error in units-itemgroups linking";
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
      // Validate units have item group links
      const unitsWithGroups = await client.units.count({
        where: { itemGroupId: { not: null } },
      });
      recordsValidated += unitsWithGroups;

      if (unitsWithGroups < 3) {
        warnings.push(
          `Few units linked to groups: ${unitsWithGroups} (expected at least 3)`
        );
      }

      // Check specific critical links
      const massUnitWithGroup = await client.units.findFirst({
        where: {
          abbreviation: "lb",
          itemGroupId: { not: null },
        },
      });
      if (!massUnitWithGroup) {
        errors.push("Pound unit not linked to any item group");
      }

      const volumeUnitWithGroup = await client.units.findFirst({
        where: {
          abbreviation: "gal",
          itemGroupId: { not: null },
        },
      });
      if (!volumeUnitWithGroup) {
        errors.push("Gallon unit not linked to any item group");
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
