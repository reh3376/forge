/**
 * Recipe Group Migration Script
 *
 * Fixes orphaned recipes that don't have a recipe group assigned.
 * Extracts the mash bill from the recipe name and creates/links recipe groups.
 *
 * Run with: DB_URL=<database_url> npx ts-node scripts/migrate/fix-recipe-groups.ts
 * Dry run: DB_URL=<database_url> npx ts-node scripts/migrate/fix-recipe-groups.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { MashBillParser } from "../../src/recipe/mashbill-parser";

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  alreadyLinked: number;
  groupsCreated: number;
  recipesLinked: number;
  errors: number;
}

async function migrateRecipeGroups(
  dryRun: boolean = false
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    alreadyLinked: 0,
    groupsCreated: 0,
    recipesLinked: 0,
    errors: 0,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Recipe Group Migration ${dryRun ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    // Get all recipes
    const recipes = await prisma.recipe.findMany({
      select: {
        id: true,
        Recipe: true,
        recipeGroupId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    stats.total = recipes.length;
    console.log(`Found ${recipes.length} total recipes\n`);

    // Filter to recipes without groups
    const orphanedRecipes = recipes.filter((r) => !r.recipeGroupId);
    const alreadyLinked = recipes.filter((r) => r.recipeGroupId);

    stats.alreadyLinked = alreadyLinked.length;
    console.log(`Already linked: ${stats.alreadyLinked}`);
    console.log(`Orphaned (need linking): ${orphanedRecipes.length}\n`);

    if (orphanedRecipes.length === 0) {
      console.log("No orphaned recipes to process!");
      return stats;
    }

    // Track created groups to avoid duplicates within this run
    const createdGroups = new Map<string, string>(); // mashBill -> groupId

    for (const recipe of orphanedRecipes) {
      try {
        // Extract mash bill from recipe name
        const mashBill = MashBillParser.extractMashBillString(recipe.Recipe);
        console.log(`[${recipe.Recipe}] Extracted mash bill: ${mashBill}`);

        // Check if we already created this group in this run
        let recipeGroupId = createdGroups.get(mashBill);

        if (!recipeGroupId) {
          // Check if group exists in database
          const existingGroup = await prisma.recipeGroup.findFirst({
            where: { recipe: mashBill },
          });

          if (existingGroup) {
            recipeGroupId = existingGroup.id;
            console.log(`  -> Found existing group: ${existingGroup.id}`);
          } else {
            // Create new group
            if (!dryRun) {
              const newGroup = await prisma.recipeGroup.create({
                data: {
                  recipe: mashBill,
                  revision: 1,
                  createdBy: "migration",
                },
              });
              recipeGroupId = newGroup.id;
              console.log(`  -> Created new group: ${newGroup.id}`);
            } else {
              recipeGroupId = "DRY_RUN_ID";
              console.log(
                `  -> [DRY RUN] Would create new group for: ${mashBill}`
              );
            }
            stats.groupsCreated++;
          }

          createdGroups.set(mashBill, recipeGroupId);
        } else {
          console.log(`  -> Using cached group: ${recipeGroupId}`);
        }

        // Link recipe to group
        if (!dryRun) {
          await prisma.recipe.update({
            where: { id: recipe.id },
            data: { recipeGroupId },
          });
          console.log(`  -> Linked recipe to group`);
        } else {
          console.log(`  -> [DRY RUN] Would link recipe to group`);
        }
        stats.recipesLinked++;
      } catch (err) {
        console.error(
          `  -> ERROR: ${err instanceof Error ? err.message : err}`
        );
        stats.errors++;
      }
    }

    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

migrateRecipeGroups(dryRun)
  .then((stats) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Migration Complete!");
    console.log(`${"=".repeat(60)}`);
    console.log(`Total recipes:        ${stats.total}`);
    console.log(`Already linked:       ${stats.alreadyLinked}`);
    console.log(`Groups created:       ${stats.groupsCreated}`);
    console.log(`Recipes linked:       ${stats.recipesLinked}`);
    console.log(`Errors:               ${stats.errors}`);
    console.log(`${"=".repeat(60)}\n`);
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
