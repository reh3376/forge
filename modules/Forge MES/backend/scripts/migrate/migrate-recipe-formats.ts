/**
 * Recipe Format Migration Script
 *
 * Migrates existing recipes from legacy format (WHK-75-21-00-04-R01) to
 * new format (WHK-75C-21R-4M-v01).
 *
 * This script:
 * 1. Reads all recipes from the database
 * 2. Detects legacy format recipes
 * 3. Converts them to new format
 * 4. Updates the Recipe field with the new format
 *
 * Run with: DB_URL=<database_url> npx ts-node scripts/migrate/migrate-recipe-formats.ts
 */

import { PrismaClient } from "@prisma/client";
import { MashBillParser } from "../../src/recipe/mashbill-parser";

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  converted: number;
  skipped: number;
  errors: number;
  alreadyNewFormat: number;
}

async function migrateRecipeFormats(
  dryRun: boolean = true
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    converted: 0,
    skipped: 0,
    errors: 0,
    alreadyNewFormat: 0,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Recipe Format Migration ${dryRun ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    // Get all recipes
    const recipes = await prisma.recipe.findMany({
      orderBy: { createdAt: "asc" },
    });

    stats.total = recipes.length;
    console.log(`Found ${recipes.length} recipes to process\n`);

    for (const recipe of recipes) {
      const recipeString = recipe.Recipe;

      if (!recipeString) {
        console.log(`  [SKIP] Recipe ${recipe.id}: No recipe string`);
        stats.skipped++;
        continue;
      }

      // Detect format
      const format = MashBillParser.detectFormat(recipeString);

      if (format === "new") {
        console.log(`  [OK] ${recipeString}: Already in new format`);
        stats.alreadyNewFormat++;
        continue;
      }

      if (format === "unknown") {
        console.log(`  [SKIP] ${recipeString}: Unknown format`);
        stats.skipped++;
        continue;
      }

      // Convert legacy to new format
      try {
        const newRecipeString = MashBillParser.convertLegacyToNew(recipeString);

        if (newRecipeString === recipeString) {
          console.log(
            `  [SKIP] ${recipeString}: Conversion resulted in same string`
          );
          stats.skipped++;
          continue;
        }

        console.log(`  [CONVERT] ${recipeString} -> ${newRecipeString}`);

        if (!dryRun) {
          await prisma.recipe.update({
            where: { id: recipe.id },
            data: { Recipe: newRecipeString },
          });
        }

        stats.converted++;
      } catch (error) {
        console.error(
          `  [ERROR] ${recipeString}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        stats.errors++;
      }
    }

    // Print summary
    console.log(`\n${"=".repeat(60)}`);
    console.log("Migration Summary");
    console.log(`${"=".repeat(60)}`);
    console.log(`Total recipes:        ${stats.total}`);
    console.log(`Already new format:   ${stats.alreadyNewFormat}`);
    console.log(`Converted:            ${stats.converted}`);
    console.log(`Skipped:              ${stats.skipped}`);
    console.log(`Errors:               ${stats.errors}`);
    console.log(`${"=".repeat(60)}\n`);

    if (dryRun && stats.converted > 0) {
      console.log(
        "This was a DRY RUN. To apply changes, run with --live flag.\n"
      );
    }

    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

// Also migrate related entities that reference the recipe string
async function migrateRelatedEntities(dryRun: boolean = true): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Related Entity Migration ${dryRun ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    // Migrate RecipeGroup.recipe field
    const recipeGroups = await prisma.recipeGroup.findMany();
    let groupsConverted = 0;

    console.log(`Found ${recipeGroups.length} recipe groups to check\n`);

    for (const group of recipeGroups) {
      if (!group.recipe) continue;

      const format = MashBillParser.detectFormat(`TEMP-${group.recipe}-v01`);

      if (format === "legacy") {
        try {
          // The recipe field in RecipeGroup is just the mashbill part (e.g., "75-21-00-04")
          const fullString = `TEMP-${group.recipe}-v01`;
          const newFullString = MashBillParser.convertLegacyToNew(fullString);

          // Extract just the mashbill part from the converted string
          const parts = newFullString.split("-");
          const newMashBill = parts.slice(1, -1).join("-");

          if (newMashBill !== group.recipe) {
            console.log(
              `  [CONVERT] RecipeGroup ${group.id}: ${group.recipe} -> ${newMashBill}`
            );

            if (!dryRun) {
              await prisma.recipeGroup.update({
                where: { id: group.id },
                data: { recipe: newMashBill },
              });
            }
            groupsConverted++;
          }
        } catch (error) {
          console.error(
            `  [ERROR] RecipeGroup ${group.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    console.log(`\nConverted ${groupsConverted} recipe groups\n`);

    // Migrate ScheduleOrder.recipeName field
    const scheduleOrders = await prisma.scheduleOrder.findMany({
      where: {
        recipeName: {
          not: { equals: "" },
        },
      },
    });
    let ordersConverted = 0;

    console.log(`Found ${scheduleOrders.length} schedule orders to check\n`);

    for (const order of scheduleOrders) {
      if (!order.recipeName) continue;

      const format = MashBillParser.detectFormat(order.recipeName);

      if (format === "legacy") {
        try {
          const newRecipeName = MashBillParser.convertLegacyToNew(
            order.recipeName
          );

          if (newRecipeName !== order.recipeName) {
            console.log(
              `  [CONVERT] ScheduleOrder ${order.id}: ${order.recipeName} -> ${newRecipeName}`
            );

            if (!dryRun) {
              await prisma.scheduleOrder.update({
                where: { id: order.id },
                data: { recipeName: newRecipeName },
              });
            }
            ordersConverted++;
          }
        } catch (error) {
          console.error(
            `  [ERROR] ScheduleOrder ${order.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    console.log(`\nConverted ${ordersConverted} schedule orders\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const migrateRelated = args.includes("--related");

  if (args.includes("--help")) {
    console.log(`
Recipe Format Migration Script

Usage: npx ts-node scripts/migrate/migrate-recipe-formats.ts [options]

Options:
  --live      Apply changes to database (default is dry run)
  --related   Also migrate related entities (RecipeGroup, ScheduleOrder)
  --help      Show this help message

Examples:
  # Dry run (preview changes)
  DB_URL=<url> npx ts-node scripts/migrate/migrate-recipe-formats.ts

  # Apply changes
  DB_URL=<url> npx ts-node scripts/migrate/migrate-recipe-formats.ts --live

  # Migrate all related entities
  DB_URL=<url> npx ts-node scripts/migrate/migrate-recipe-formats.ts --live --related
`);
    process.exit(0);
  }

  try {
    await migrateRecipeFormats(!isLive);

    if (migrateRelated) {
      await migrateRelatedEntities(!isLive);
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
