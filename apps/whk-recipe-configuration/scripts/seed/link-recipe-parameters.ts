#!/usr/bin/env ts-node

/**
 * Link Recipe Parameters Migration
 *
 * Creates parameter instances for existing recipes based on class definitions.
 * This ensures all recipes have the standard set of parameters.
 *
 * Usage:
 *   npm run migrate:link-recipe-parameters
 *   or
 *   DB_URL=<connection-string> npx ts-node scripts/seed/link-recipe-parameters.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function linkRecipeParameters() {
  console.log("🔗 Starting Recipe Parameters Linking...");

  // Get all class definition parameters
  const classDefinitions = await prisma.recipeParameter.findMany({
    where: {
      isClassDefinition: true,
      active: true,
    },
    include: {
      units: true,
    },
  });

  console.log(
    `📊 Found ${classDefinitions.length} class definition parameters`
  );

  // Get all recipes
  const recipes = await prisma.recipe.findMany({
    where: {
      active: true,
    },
    include: {
      parameters: true,
    },
  });

  console.log(`📊 Found ${recipes.length} active recipes`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalRecipesUpdated = 0;

  for (const recipe of recipes) {
    let recipeUpdated = false;
    let createdForRecipe = 0;

    console.log(`\n🔄 Processing recipe: ${recipe.Recipe} (${recipe.id})`);

    // Get existing parameter names for this recipe
    const existingParamNames = new Set(
      recipe.parameters.map((p) => p.recipeParamName)
    );

    for (const classDef of classDefinitions) {
      // Skip if recipe already has this parameter
      if (existingParamNames.has(classDef.recipeParamName)) {
        console.log(
          `   ⏭️  Skipped: ${classDef.recipeParamName} (already exists)`
        );
        totalSkipped++;
        continue;
      }

      try {
        // Create parameter instance for this recipe
        await prisma.recipeParameter.create({
          data: {
            recipeParamName: classDef.recipeParamName,
            className: classDef.className,
            recipeSetpointType: classDef.recipeSetpointType,
            recipeNumericalSetpoint: classDef.recipeNumericalSetpoint,
            recipeSetpointLowerLimit: classDef.recipeSetpointLowerLimit,
            recipeSetpointUpperLimit: classDef.recipeSetpointUpperLimit,
            recipeSetpointBooleanValue: classDef.recipeSetpointBooleanValue,
            unitsId: classDef.unitsId,
            recipeParamDescription: classDef.recipeParamDescription,
            description: classDef.description,
            active: true,
            isClassDefinition: false, // This is an instance, not a class definition
            revision: recipe.revision || 0,
            schemaVersion: "0001-alpha",
            createdBy: "migration-script",
            updatedBy: "migration-script",
            createdAt: new Date(),
            updatedAt: new Date(),
            recipe: {
              connect: { id: recipe.id },
            },
          },
        });

        console.log(`   ✅ Created: ${classDef.recipeParamName}`);
        totalCreated++;
        createdForRecipe++;
        recipeUpdated = true;
      } catch (error) {
        console.error(
          `   ❌ Error creating ${classDef.recipeParamName}:`,
          error
        );
      }
    }

    if (recipeUpdated) {
      totalRecipesUpdated++;
      console.log(`   📝 Recipe updated: ${createdForRecipe} parameters added`);
    } else {
      console.log(`   ✓ Recipe already has all parameters`);
    }
  }

  console.log("\n📈 Migration Summary:");
  console.log(`   ✅ Parameters Created: ${totalCreated}`);
  console.log(`   ⏭️  Parameters Skipped: ${totalSkipped}`);
  console.log(`   📝 Recipes Updated: ${totalRecipesUpdated}`);
  console.log(`   📊 Total Recipes: ${recipes.length}`);
}

async function main() {
  try {
    await linkRecipeParameters();
    console.log("\n✅ Recipe parameters linking completed successfully!");
  } catch (error) {
    console.error("❌ Error during migration:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { linkRecipeParameters };
