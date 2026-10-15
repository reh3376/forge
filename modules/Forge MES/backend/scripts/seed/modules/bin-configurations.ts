import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const binConfigurationsModule: SeedModule = {
  name: "bin-configurations",
  description: "Milling bin configurations linking silos to grain item groups",
  dependencies: ["assets", "item-groups"],
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
      console.log("  └─ Seeding milling bin configurations...");

      const siloNames = ["SIL-110", "SIL-115", "SIL-120"];
      const grainGroupNames = [
        "RM-GR-COR",
        "RM-GR-RYE",
        "RM-GR-BRY",
        "RM-GR-WHT",
      ];

      // Fetch silos
      const silos = await client.asset.findMany({
        where: { name: { in: siloNames } },
      });

      if (silos.length === 0) {
        warnings.push(
          `No silo assets found (looked for: ${siloNames.join(", ")})`
        );
        return {
          success: true,
          message: "Skipped - no silo assets found",
          recordsCreated: 0,
          recordsUpdated: 0,
          errors,
          warnings,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (silos.length < siloNames.length) {
        const foundNames = silos.map((s) => s.name);
        const missingNames = siloNames.filter((n) => !foundNames.includes(n));
        warnings.push(`Missing silos: ${missingNames.join(", ")}`);
      }

      // Fetch grain item groups
      const grainGroups = await client.itemGroup.findMany({
        where: { name: { in: grainGroupNames } },
      });

      if (grainGroups.length === 0) {
        errors.push(
          `No grain item groups found (looked for: ${grainGroupNames.join(
            ", "
          )})`
        );
        return {
          success: false,
          message: "Failed - no grain item groups found",
          recordsCreated: 0,
          recordsUpdated: 0,
          errors,
          warnings,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (grainGroups.length < grainGroupNames.length) {
        const foundNames = grainGroups.map((g) => g.name);
        const missingNames = grainGroupNames.filter(
          (n) => !foundNames.includes(n)
        );
        warnings.push(`Missing grain groups: ${missingNames.join(", ")}`);
      }

      console.log(
        `    Found ${silos.length} silos and ${grainGroups.length} grain groups`
      );

      // Create cross-join configurations (each silo gets each grain group)
      for (const silo of silos) {
        for (const grainGroup of grainGroups) {
          // Check if configuration already exists
          const existing = await client.millingBinConfiguration.findFirst({
            where: {
              binId: silo.id,
              itemGroupId: grainGroup.id,
            },
          });

          if (!existing) {
            await client.millingBinConfiguration.create({
              data: {
                binId: silo.id,
                itemGroupId: grainGroup.id,
              },
            });
            recordsCreated++;
          }
        }
      }

      console.log(`    Created ${recordsCreated} milling bin configurations`);

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} milling bin configurations`
            : "Skipped - configurations already exist",
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
          : "Unknown error in bin configurations seeding";
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
      const configCount = await client.millingBinConfiguration.count();
      recordsValidated += configCount;

      // With 3 silos and 4 grain groups, we expect 12 configurations
      if (configCount < 12) {
        warnings.push(
          `Few milling bin configurations: ${configCount} (expected 12 for full coverage)`
        );
      }

      // Verify each silo has all grain groups configured
      const siloNames = ["SIL-110", "SIL-115", "SIL-120"];
      const silos = await client.asset.findMany({
        where: { name: { in: siloNames } },
      });

      for (const silo of silos) {
        const siloConfigCount = await client.millingBinConfiguration.count({
          where: { binId: silo.id },
        });
        if (siloConfigCount < 4) {
          warnings.push(
            `Silo ${silo.name} has only ${siloConfigCount} grain configurations (expected 4)`
          );
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
