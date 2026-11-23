import { PrismaClient, EnumOperationName } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const operationsModule: SeedModule = {
  name: "operations",
  description: "Production operations and process definitions",
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
      console.log("  └─ Seeding operations...");

      // Check existing operations
      const existingCount = await client.operation.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing operations, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} operations already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Create class definitions first (parent operations)
        const classOperations = [
          {
            name: EnumOperationName.Cook,
            abbreviation: "COOK",
            description: "Grain mashing and cooking operations",
            isClassDefinition: true,
            createdBy: "system",
          },
          {
            name: EnumOperationName.Fermenter,
            abbreviation: "FERM",
            description: "Yeast fermentation operations",
            isClassDefinition: true,
            createdBy: "system",
          },
          {
            name: EnumOperationName.StillRun,
            abbreviation: "STILL",
            description: "Distillation and rectification operations",
            isClassDefinition: true,
            createdBy: "system",
          },
          {
            name: EnumOperationName.Barreling,
            abbreviation: "BARREL",
            description: "Barrel filling and aging operations",
            isClassDefinition: true,
            createdBy: "system",
          },
        ];

        const createdClassOps = [];
        for (const op of classOperations) {
          const created = await client.operation.create({ data: op });
          createdClassOps.push(created);
          recordsCreated++;
        }
        console.log(
          `    Created ${classOperations.length} class operation definitions`
        );

        // Create instance operations linked to class definitions
        const cookClass = createdClassOps.find(
          (op) => op.abbreviation === "COOK"
        );
        const fermClass = createdClassOps.find(
          (op) => op.abbreviation === "FERM"
        );
        const stillClass = createdClassOps.find(
          (op) => op.abbreviation === "STILL"
        );

        const instanceOperations = [
          {
            name: EnumOperationName.Cook,
            abbreviation: "COOK-CORN",
            description: "Corn-based cooking operation for bourbon",
            isClassDefinition: false,
            classId: { connect: { id: cookClass?.id } },
            createdBy: "system",
          },
          {
            name: EnumOperationName.FermenterSet,
            abbreviation: "FERM-SET",
            description: "Fermenter setup operation",
            isClassDefinition: false,
            classId: { connect: { id: fermClass?.id } },
            createdBy: "system",
          },
          {
            name: EnumOperationName.Fermenter,
            abbreviation: "FERM-RUN",
            description: "Primary alcoholic fermentation",
            isClassDefinition: false,
            classId: { connect: { id: fermClass?.id } },
            createdBy: "system",
          },
          {
            name: EnumOperationName.StillRun,
            abbreviation: "STILL-RUN",
            description: "Distillation run operation",
            isClassDefinition: false,
            classId: { connect: { id: stillClass?.id } },
            createdBy: "system",
          },
        ];

        for (const op of instanceOperations) {
          await client.operation.create({ data: op });
          recordsCreated++;
        }
        console.log(
          `    Created ${instanceOperations.length} operation instances with class FK links`
        );
      } else {
        console.log(
          `    Skipped creating operations - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} operations with FK hierarchy`
            : "Skipped - operations already exist",
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
          : "Unknown error in operations seeding";
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
      // Validate operations exist
      const operationsCount = await client.operation.count();
      recordsValidated += operationsCount;

      if (operationsCount < 6) {
        errors.push(
          `Insufficient operations: ${operationsCount} (expected at least 6)`
        );
      }

      // Check class definitions exist
      const classDefsCount = await client.operation.count({
        where: { isClassDefinition: true },
      });
      if (classDefsCount < 3) {
        errors.push(
          `Insufficient class definitions: ${classDefsCount} (expected at least 3)`
        );
      }

      // Check instances linked to classes
      const instancesCount = await client.operation.count({
        where: {
          isClassDefinition: false,
          NOT: { classId: null },
        },
      });
      if (instancesCount < 3) {
        warnings.push(
          `Few operation instances linked to classes: ${instancesCount}`
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
