import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";
import { recipeBomsModule } from "./recipe-boms";
import { recipeParametersModule } from "./recipe-parameters";
import { mashingProtocolStepsModule } from "./mashing-protocol-steps";

export const recipesModule: SeedModule = {
  name: "recipes",
  description:
    "Recipes with complete dependencies: BOMs, parameters, and mashing protocol steps",
  dependencies: [
    "customers",
    "recipe-groups",
    "mashing-protocols",
    "basic-items",
    "operations",
    "units",
  ],
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
      console.log("  └─ Seeding recipes...");

      // Check existing recipes
      const existingCount = await client.recipe.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(`    Found ${existingCount} existing recipes, skipping`);
        return {
          success: true,
          message: `Skipped - ${existingCount} recipes already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Get required FKs
        const customer = await client.customer.findFirst({
          where: { name: "WhiskeyHouse Internal" },
        });
        if (!customer) {
          errors.push("WhiskeyHouse Internal customer not found");
          throw new Error("Required customer not found");
        }

        const recipeGroups = await client.recipeGroup.findMany();
        if (recipeGroups.length === 0) {
          errors.push("No recipe groups found");
          throw new Error("Required recipe groups not found");
        }

        const mashingProtocols = await client.mashingProtocol.findMany({
          where: { master: true, isTemplate: true },
        });
        if (mashingProtocols.length === 0) {
          errors.push("No master mashing protocols found");
          throw new Error("Required mashing protocols not found");
        }

        // Create master recipe templates first
        const bourbonStandardGroup = recipeGroups.find(
          (g) => g.recipe === "Bourbon-Standard"
        );
        const bourbonPremiumGroup = recipeGroups.find(
          (g) => g.recipe === "Bourbon-Premium"
        );
        const ryeClassicGroup = recipeGroups.find(
          (g) => g.recipe === "RyeWhiskey-Classic"
        );
        const wheatedGroup = recipeGroups.find(
          (g) => g.recipe === "WheatedBourbon-Soft"
        );

        const standardProtocol = mashingProtocols.find(
          (p) => p.name === "Standard-Bourbon-Mashing"
        );
        const ryeProtocol = mashingProtocols.find(
          (p) => p.name === "High-Rye-Mashing"
        );
        const wheatedProtocol = mashingProtocols.find(
          (p) => p.name === "Wheated-Bourbon-Mashing"
        );

        const masterRecipes = [
          {
            Recipe: "Master-Bourbon-Standard-Recipe-001",
            customerId: customer.id,
            recipeGroupId: bourbonStandardGroup?.id,
            mashingProtocolId: standardProtocol?.id,
            isClassDefinition: true,
            cooksPerFerm: 3,
            totalCooks: 12,
            totalFermenters: 4,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
          {
            Recipe: "Master-Bourbon-Premium-Recipe-001",
            customerId: customer.id,
            recipeGroupId: bourbonPremiumGroup?.id,
            mashingProtocolId: standardProtocol?.id,
            isClassDefinition: true,
            cooksPerFerm: 2,
            totalCooks: 8,
            totalFermenters: 4,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
          {
            Recipe: "Master-Rye-Classic-Recipe-001",
            customerId: customer.id,
            recipeGroupId: ryeClassicGroup?.id,
            mashingProtocolId: ryeProtocol?.id,
            isClassDefinition: true,
            cooksPerFerm: 3,
            totalCooks: 9,
            totalFermenters: 3,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
          {
            Recipe: "Master-Wheated-Bourbon-Recipe-001",
            customerId: customer.id,
            recipeGroupId: wheatedGroup?.id,
            mashingProtocolId: wheatedProtocol?.id,
            isClassDefinition: true,
            cooksPerFerm: 3,
            totalCooks: 12,
            totalFermenters: 4,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
        ];

        const createdMasters = [];
        for (const recipe of masterRecipes) {
          const created = await client.recipe.create({ data: recipe });
          createdMasters.push(created);
          recordsCreated++;
        }
        console.log(
          `    Created ${masterRecipes.length} master recipe templates`
        );

        // Create instance recipes linked to masters
        const bourbonMaster = createdMasters.find(
          (r) => r.Recipe === "Master-Bourbon-Standard-Recipe-001"
        );
        const premiumMaster = createdMasters.find(
          (r) => r.Recipe === "Master-Bourbon-Premium-Recipe-001"
        );
        const ryeMaster = createdMasters.find(
          (r) => r.Recipe === "Master-Rye-Classic-Recipe-001"
        );

        const instanceRecipes = [
          {
            Recipe: "Instance-Bourbon-Standard-Batch-001",
            customerId: customer.id,
            recipeGroupId: bourbonStandardGroup?.id,
            mashingProtocolId: standardProtocol?.id,
            classIdId: bourbonMaster?.id,
            isClassDefinition: false,
            cooksPerFerm: 3,
            totalCooks: 12,
            totalFermenters: 4,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
          {
            Recipe: "Instance-Bourbon-Premium-Batch-001",
            customerId: customer.id,
            recipeGroupId: bourbonPremiumGroup?.id,
            mashingProtocolId: standardProtocol?.id,
            classIdId: premiumMaster?.id,
            isClassDefinition: false,
            cooksPerFerm: 2,
            totalCooks: 8,
            totalFermenters: 4,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
          {
            Recipe: "Instance-Rye-Classic-Batch-001",
            customerId: customer.id,
            recipeGroupId: ryeClassicGroup?.id,
            mashingProtocolId: ryeProtocol?.id,
            classIdId: ryeMaster?.id,
            isClassDefinition: false,
            cooksPerFerm: 3,
            totalCooks: 9,
            totalFermenters: 3,
            customerCode: "WHK-INT",
            createdBy: "system",
          },
        ];

        for (const recipe of instanceRecipes) {
          await client.recipe.create({ data: recipe });
          recordsCreated++;
        }
        console.log(
          `    Created ${instanceRecipes.length} recipe instances with master FK links`
        );
      } else {
        console.log(
          `    Skipped creating recipes - ${existingCount} already exist`
        );
      }

      // Seed dependent modules automatically
      console.log("  └─ Seeding recipe dependencies...");

      // Create config for dependent modules (disable validation to avoid transaction issues)
      const dependentConfig = { ...config, enableValidation: false };

      // 1. Seed mashing protocol steps for the protocols used by recipes
      console.log("    ├─ Seeding mashing protocol steps...");
      const mashingStepsResult = await mashingProtocolStepsModule.runner(
        client,
        dependentConfig
      );
      if (!mashingStepsResult.success) {
        errors.push(...mashingStepsResult.errors);
        warnings.push(...mashingStepsResult.warnings);
      } else {
        recordsCreated += mashingStepsResult.recordsCreated;
        recordsUpdated += mashingStepsResult.recordsUpdated;
        console.log(`    │  ${mashingStepsResult.message}`);
      }

      // 2. Seed recipe BOMs
      console.log("    ├─ Seeding recipe BOMs...");
      const bomsResult = await recipeBomsModule.runner(client, dependentConfig);
      if (!bomsResult.success) {
        errors.push(...bomsResult.errors);
        warnings.push(...bomsResult.warnings);
      } else {
        recordsCreated += bomsResult.recordsCreated;
        recordsUpdated += bomsResult.recordsUpdated;
        console.log(`    │  ${bomsResult.message}`);
      }

      // 3. Seed recipe parameters
      console.log("    └─ Seeding recipe parameters...");
      const parametersResult = await recipeParametersModule.runner(
        client,
        dependentConfig
      );
      if (!parametersResult.success) {
        errors.push(...parametersResult.errors);
        warnings.push(...parametersResult.warnings);
      } else {
        recordsCreated += parametersResult.recordsCreated;
        recordsUpdated += parametersResult.recordsUpdated;
        console.log(`       ${parametersResult.message}`);
      }

      const hasErrors = errors.length > 0;
      const mainMessage =
        recordsCreated > 0
          ? `Successfully created ${recordsCreated} recipes with complete dependencies`
          : "Skipped - recipes already exist";

      return {
        success: !hasErrors,
        message: hasErrors
          ? `Recipe seeding completed with errors: ${errors.join(", ")}`
          : mainMessage,
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
          : "Unknown error in recipes seeding";
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
      // Validate recipes exist
      const recipesCount = await client.recipe.count();
      recordsValidated += recipesCount;

      if (recipesCount < 5) {
        errors.push(
          `Insufficient recipes: ${recipesCount} (expected at least 5)`
        );
      }

      // Check master templates exist
      const mastersCount = await client.recipe.count({
        where: { isClassDefinition: true },
      });
      if (mastersCount < 3) {
        errors.push(
          `Insufficient master templates: ${mastersCount} (expected at least 3)`
        );
      }

      // Check instances linked to masters
      const instancesCount = await client.recipe.count({
        where: {
          isClassDefinition: false,
          classIdId: { not: null },
        },
      });
      if (instancesCount < 2) {
        warnings.push(
          `Few recipe instances linked to masters: ${instancesCount}`
        );
      }

      // Validate FK links exist (check for actual values)
      const recipesWithFKs = await client.recipe.findMany({
        select: {
          customerId: true,
          recipeGroupId: true,
          mashingProtocolId: true,
        },
      });

      const withCustomerCount = recipesWithFKs.filter(
        (r) => r.customerId !== null
      ).length;
      if (withCustomerCount !== recipesCount) {
        errors.push(
          `${recipesCount - withCustomerCount} recipes missing customer FK`
        );
      }

      const withGroupCount = recipesWithFKs.filter(
        (r) => r.recipeGroupId !== null
      ).length;
      if (withGroupCount < recipesCount * 0.8) {
        warnings.push(
          `${recipesCount - withGroupCount} recipes missing recipe group FK`
        );
      }

      const withProtocolCount = recipesWithFKs.filter(
        (r) => r.mashingProtocolId !== null
      ).length;
      if (withProtocolCount < recipesCount * 0.8) {
        warnings.push(
          `${
            recipesCount - withProtocolCount
          } recipes missing mashing protocol FK`
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
