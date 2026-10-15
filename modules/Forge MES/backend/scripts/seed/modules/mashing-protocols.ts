import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const mashingProtocolsModule: SeedModule = {
  name: "mashing-protocols",
  description: "Mashing process protocols and procedures",
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
      console.log("  └─ Seeding mashing protocols...");

      // Check existing protocols
      const existingCount = await client.mashingProtocol.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing mashing protocols, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} mashing protocols already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Create master protocols first
        const masterProtocols = [
          {
            name: "Standard-Bourbon-Mashing",
            revision: "1.0",
            master: true,
            isTemplate: true,
            createdBy: "system",
          },
          {
            name: "High-Rye-Mashing",
            revision: "1.0",
            master: true,
            isTemplate: true,
            createdBy: "system",
          },
          {
            name: "Wheated-Bourbon-Mashing",
            revision: "1.0",
            master: true,
            isTemplate: true,
            createdBy: "system",
          },
        ];

        const createdMasters = [];
        for (const protocol of masterProtocols) {
          const created = await client.mashingProtocol.create({
            data: protocol,
          });
          createdMasters.push(created);
          recordsCreated++;
        }
        console.log(
          `    Created ${masterProtocols.length} master mashing protocols`
        );

        // Create instance protocols linked to masters
        const standardMaster = createdMasters.find(
          (p) => p.name === "Standard-Bourbon-Mashing"
        );
        const ryeMaster = createdMasters.find(
          (p) => p.name === "High-Rye-Mashing"
        );
        const wheatedMaster = createdMasters.find(
          (p) => p.name === "Wheated-Bourbon-Mashing"
        );

        const instanceProtocols = [
          {
            name: "Standard-Bourbon-Mashing-Instance-001",
            revision: "1.0",
            master: false,
            isTemplate: false,
            running: false,
            masterMashingProtocolId: standardMaster?.id,
            createdBy: "system",
          },
          {
            name: "High-Rye-Mashing-Instance-001",
            revision: "1.0",
            master: false,
            isTemplate: false,
            running: false,
            masterMashingProtocolId: ryeMaster?.id,
            createdBy: "system",
          },
          {
            name: "Wheated-Bourbon-Mashing-Instance-001",
            revision: "1.0",
            master: false,
            isTemplate: false,
            running: false,
            masterMashingProtocolId: wheatedMaster?.id,
            createdBy: "system",
          },
        ];

        for (const protocol of instanceProtocols) {
          await client.mashingProtocol.create({ data: protocol });
          recordsCreated++;
        }
        console.log(
          `    Created ${instanceProtocols.length} instance protocols with master FK links`
        );
      } else {
        console.log(
          `    Skipped creating mashing protocols - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} mashing protocols with FK hierarchy`
            : "Skipped - mashing protocols already exist",
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
          : "Unknown error in mashing protocols seeding";
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
      // Validate protocols exist
      const protocolsCount = await client.mashingProtocol.count();
      recordsValidated += protocolsCount;

      if (protocolsCount < 4) {
        errors.push(
          `Insufficient mashing protocols: ${protocolsCount} (expected at least 4)`
        );
      }

      // Check master templates exist
      const mastersCount = await client.mashingProtocol.count({
        where: { master: true, isTemplate: true },
      });
      if (mastersCount < 2) {
        errors.push(
          `Insufficient master templates: ${mastersCount} (expected at least 2)`
        );
      }

      // Check instances linked to masters
      const instancesCount = await client.mashingProtocol.count({
        where: {
          master: false,
          masterMashingProtocolId: { not: null },
        },
      });
      if (instancesCount < 2) {
        warnings.push(
          `Few protocol instances linked to masters: ${instancesCount}`
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
