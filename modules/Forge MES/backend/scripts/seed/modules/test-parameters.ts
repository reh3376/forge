import {
  PrismaClient,
  EnumTestParameterTestSetpointType,
} from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const testParametersModule: SeedModule = {
  name: "test-parameters",
  description: "Quality control test parameters and specifications",
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
      console.log("  └─ Seeding test parameters...");

      const testParameters = [
        {
          name: "Alcohol by Volume",
          description: "Alcohol by Volume",
          testParamUnits: "%",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 95,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Proof",
          description: "Proof",
          testParamUnits: "proof",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 190,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Specific Gravity",
          description: "Specific Gravity",
          testParamUnits: "SG",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 1.2,
          testSetpointLowerLimit: 0.8,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "pH",
          description: "pH Level",
          testParamUnits: "pH",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 14,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Temperature",
          description: "Temperature",
          testParamUnits: "°F",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 300,
          testSetpointLowerLimit: 32,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Moisture Content",
          description: "Moisture Content",
          testParamUnits: "%",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 100,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Color",
          description: "Color Measurement",
          testParamUnits: "L*a*b*",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 100,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Turbidity",
          description: "Turbidity",
          testParamUnits: "NTU",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 1000,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Total Solids",
          description: "Total Solids",
          testParamUnits: "%",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 50,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
        {
          name: "Foreign Material",
          description: "Foreign Material",
          testParamUnits: "%",
          testSetpointType: EnumTestParameterTestSetpointType.Numerical,
          testSetpointUpperLimit: 50,
          testSetpointLowerLimit: 0,
          testParamRevision: "0",
          createdBy: "system",
        },
      ];

      // Check existing test parameters
      const existingCount = await client.testParameter.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing test parameters, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} test parameters already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Create test parameters
      if (existingCount === 0) {
        await client.testParameter.createMany({
          data: testParameters,
        });
        recordsCreated = testParameters.length;
        console.log(`    Created ${recordsCreated} test parameters`);
      } else {
        console.log(
          `    Skipped creating test parameters - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} test parameters`
            : "Skipped - test parameters already exist",
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
          : "Unknown error in test parameters seeding";
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
      // Validate test parameters exist
      const testParamsCount = await client.testParameter.count();
      recordsValidated += testParamsCount;

      if (testParamsCount < 8) {
        errors.push(
          `Insufficient test parameters: ${testParamsCount} (expected at least 8)`
        );
      }

      // Check for specific required parameters (flexible matching)
      const requiredParams = ["Alcohol", "Proof", "pH", "Temperature"];
      for (const paramName of requiredParams) {
        const param = await client.testParameter.findFirst({
          where: { name: { contains: paramName, mode: "insensitive" } },
        });
        if (!param) {
          warnings.push(`Missing test parameter containing: ${paramName}`);
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
