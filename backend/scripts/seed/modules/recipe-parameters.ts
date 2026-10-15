import {
  PrismaClient,
  EnumRecipeParameterRecipeSetpointType,
  EnumRecipeParameterCategory,
} from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const recipeParametersModule: SeedModule = {
  name: "recipe-parameters",
  description:
    "Recipe parameters with FK links to recipes and operations (auto-seeded with recipes)",
  dependencies: ["recipes", "operations", "units"],
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
      console.log("  └─ Seeding recipe parameters...");

      // Check existing recipe parameters
      const existingCount = await client.recipeParameter.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing recipe parameters, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} recipe parameters already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Get required FKs
        const recipes = await client.recipe.findMany({
          where: { isClassDefinition: true },
        });
        if (recipes.length === 0) {
          errors.push("No master recipes found");
          throw new Error("Required master recipes not found");
        }

        const operations = await client.operation.findMany({
          where: { isClassDefinition: true },
        });
        if (operations.length === 0) {
          warnings.push(
            "No operations found - parameters will not have operation links"
          );
        }

        const units = await client.units.findMany();
        if (units.length === 0) {
          warnings.push(
            "No units found - parameters will not have units links"
          );
        }

        // Find specific operations and units
        const cookOperation = operations.find(
          (op) => op.abbreviation === "COOK"
        );
        const fermOperation = operations.find(
          (op) => op.abbreviation === "FERM"
        );
        const stillOperation = operations.find(
          (op) => op.abbreviation === "STILL"
        );

        const tempUnits = units.find(
          (u) => u.abbreviation === "°F" || u.abbreviation === "F"
        );
        const timeUnits = units.find(
          (u) => u.abbreviation === "min" || u.abbreviation === "hr"
        );
        const volumeUnits = units.find((u) => u.abbreviation === "gal");

        // Create master recipe parameter templates
        const masterParameters = [
          // Mashing Parameters (Input)
          {
            recipeParamName: "Mash Temperature",
            recipeParamDescription: "Target mashing temperature",
            className: "MashTemperatureParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeNumericalSetpoint: 152.0,
            recipeSetpointLowerLimit: 145.0,
            recipeSetpointUpperLimit: 160.0,
            unitsId: tempUnits?.id,
            operationId: cookOperation?.id,
            isClassDefinition: true,
            required: true,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "Mash Duration",
            recipeParamDescription: "Duration of mashing process",
            className: "MashDurationParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeNumericalSetpoint: 90.0,
            recipeSetpointLowerLimit: 60.0,
            recipeSetpointUpperLimit: 180.0,
            unitsId: timeUnits?.id,
            operationId: cookOperation?.id,
            isClassDefinition: true,
            required: true,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          // Fermentation Parameters (Input)
          {
            recipeParamName: "Fermentation Temperature",
            recipeParamDescription: "Target fermentation temperature",
            className: "FermentationTemperatureParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeNumericalSetpoint: 85.0,
            recipeSetpointLowerLimit: 80.0,
            recipeSetpointUpperLimit: 90.0,
            unitsId: tempUnits?.id,
            operationId: fermOperation?.id,
            isClassDefinition: true,
            required: true,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "Fermentation pH Control",
            recipeParamDescription:
              "Enable automatic pH control during fermentation",
            className: "FermentationPhControlParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Boolean,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeSetpointBooleanValue: true,
            operationId: fermOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          // Distillation Parameters (Input)
          {
            recipeParamName: "Still Heads Cut",
            recipeParamDescription: "Volume of heads cut during distillation",
            className: "StillHeadsCutParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeNumericalSetpoint: 2.5,
            recipeSetpointLowerLimit: 1.0,
            recipeSetpointUpperLimit: 5.0,
            unitsId: volumeUnits?.id,
            operationId: stillOperation?.id,
            isClassDefinition: true,
            required: true,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "Still Hearts Target ABV",
            recipeParamDescription:
              "Target alcohol by volume for hearts collection",
            className: "StillHeartsTargetAbvParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Input,
            recipeNumericalSetpoint: 68.0,
            recipeSetpointLowerLimit: 60.0,
            recipeSetpointUpperLimit: 75.0,
            operationId: stillOperation?.id,
            isClassDefinition: true,
            required: true,
            configurable: true,
            active: true,
            createdBy: "system",
          },
          // Output Parameters (Yields) - for recording actuals
          {
            recipeParamName: "totalWineGallons",
            recipeParamDescription:
              "Total wine gallons yielded from distillation",
            className: "TotalWineGallonsParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Output,
            unitsId: volumeUnits?.id,
            operationId: stillOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: false,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "totalProofGallons",
            recipeParamDescription:
              "Total proof gallons yielded from distillation",
            className: "TotalProofGallonsParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Output,
            operationId: stillOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: false,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "averageProof",
            recipeParamDescription:
              "Average proof calculated from wine gallons and proof gallons",
            className: "AverageProofParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Calculated,
            operationId: stillOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: false,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "finalAlcoholPercent",
            recipeParamDescription:
              "Final alcohol percentage from fermentation",
            className: "FinalAlcoholPercentParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Output,
            operationId: fermOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: false,
            active: true,
            createdBy: "system",
          },
          {
            recipeParamName: "totalGrainWeight",
            recipeParamDescription:
              "Total grain weight consumed during mashing",
            className: "TotalGrainWeightParameter",
            recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
            parameterCategory: EnumRecipeParameterCategory.Calculated,
            operationId: cookOperation?.id,
            isClassDefinition: true,
            required: false,
            configurable: false,
            active: true,
            createdBy: "system",
          },
        ];

        const createdMasterParams = [];
        for (const param of masterParameters) {
          const created = await client.recipeParameter.create({ data: param });
          createdMasterParams.push(created);
          recordsCreated++;
        }
        console.log(
          `    Created ${masterParameters.length} master recipe parameter templates`
        );

        // Link recipe parameters to recipes
        for (const recipe of recipes) {
          // All master recipes get all parameters (Input, Output, and Calculated)
          // Input params: setpoints for the process
          // Output params: yields to record after production
          // Calculated params: derived values

          // Link all parameters to recipe
          for (const param of createdMasterParams) {
            await client.recipe.update({
              where: { id: recipe.id },
              data: {
                parameters: {
                  connect: { id: param.id },
                },
              },
            });
          }
        }
        console.log(
          `    Linked ${createdMasterParams.length} parameters to ${recipes.length} recipes`
        );
      } else {
        console.log(
          `    Skipped creating recipe parameters - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} recipe parameters with FK links`
            : "Skipped - recipe parameters already exist",
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
          : "Unknown error in recipe parameters seeding";
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
      const parametersCount = await client.recipeParameter.count();
      recordsValidated += parametersCount;

      if (parametersCount < 11) {
        errors.push(
          `Insufficient recipe parameters: ${parametersCount} (expected at least 11)`
        );
      }

      // Check master templates exist
      const masterParamsCount = await client.recipeParameter.count({
        where: { isClassDefinition: true },
      });
      if (masterParamsCount < 11) {
        errors.push(
          `Insufficient master parameter templates: ${masterParamsCount} (expected at least 11)`
        );
      }

      // Validate parameter categories
      const inputParams = await client.recipeParameter.count({
        where: { parameterCategory: EnumRecipeParameterCategory.Input },
      });
      const outputParams = await client.recipeParameter.count({
        where: { parameterCategory: EnumRecipeParameterCategory.Output },
      });
      const calculatedParams = await client.recipeParameter.count({
        where: { parameterCategory: EnumRecipeParameterCategory.Calculated },
      });

      if (inputParams < 6) {
        errors.push(
          `Insufficient Input parameters: ${inputParams} (expected at least 6)`
        );
      }
      if (outputParams < 3) {
        errors.push(
          `Insufficient Output parameters: ${outputParams} (expected at least 3)`
        );
      }
      if (calculatedParams < 2) {
        errors.push(
          `Insufficient Calculated parameters: ${calculatedParams} (expected at least 2)`
        );
      }

      // Validate parameter types distribution
      const numericParams = await client.recipeParameter.count({
        where: {
          recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
        },
      });
      const booleanParams = await client.recipeParameter.count({
        where: {
          recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Boolean,
        },
      });

      if (numericParams === 0) {
        errors.push("No numeric recipe parameters found");
      }
      if (booleanParams === 0) {
        warnings.push("No boolean recipe parameters found");
      }

      // Validate FK links to operations and units
      const paramsWithOperations = await client.recipeParameter.findMany({
        select: { operationId: true, unitsId: true },
      });

      const paramsWithOperationCount = paramsWithOperations.filter(
        (p) => p.operationId !== null
      ).length;
      if (paramsWithOperationCount < parametersCount * 0.7) {
        warnings.push(
          `${
            parametersCount - paramsWithOperationCount
          } parameters missing operation FK`
        );
      }

      const paramsWithUnitsCount = paramsWithOperations.filter(
        (p) => p.unitsId !== null
      ).length;
      if (paramsWithUnitsCount < parametersCount * 0.5) {
        warnings.push(
          `${
            parametersCount - paramsWithUnitsCount
          } parameters missing units FK`
        );
      }

      // Validate recipe-parameter relationships
      const recipesWithParams = await client.recipe.findMany({
        include: {
          parameters: true,
        },
      });

      const recipesWithoutParams = recipesWithParams.filter(
        (r) => r.parameters.length === 0
      );
      if (recipesWithoutParams.length > 0) {
        warnings.push(
          `${recipesWithoutParams.length} recipes have no parameters linked`
        );
      }

      // Validate parameter value ranges
      const numericParameters = await client.recipeParameter.findMany({
        where: {
          recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
        },
        select: {
          recipeParamName: true,
          recipeNumericalSetpoint: true,
          recipeSetpointLowerLimit: true,
          recipeSetpointUpperLimit: true,
        },
      });

      for (const param of numericParameters) {
        if (
          param.recipeNumericalSetpoint !== null &&
          param.recipeSetpointLowerLimit !== null &&
          param.recipeSetpointUpperLimit !== null
        ) {
          if (
            param.recipeNumericalSetpoint < param.recipeSetpointLowerLimit ||
            param.recipeNumericalSetpoint > param.recipeSetpointUpperLimit
          ) {
            warnings.push(
              `Parameter ${param.recipeParamName} setpoint outside valid range`
            );
          }
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
