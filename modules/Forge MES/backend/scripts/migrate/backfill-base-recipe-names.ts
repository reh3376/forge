/**
 * Backfill script for baseRecipeName field
 *
 * Populates the baseRecipeName field by stripping the -R## suffix from existing Recipe names.
 * Also links parent/child revisions where possible.
 *
 * Run with: DB_URL=<connection> npx ts-node scripts/migrate/backfill-base-recipe-names.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Regex to match revision suffix: -v or -R followed by digits at end of string
const REVISION_SUFFIX_REGEX = /-[Rv](\d+)$/;

/**
 * Extract base recipe name by removing -v##/-R## suffix
 */
function extractBaseRecipeName(recipeName: string): string {
  return recipeName.replace(REVISION_SUFFIX_REGEX, "");
}

/**
 * Extract revision number from recipe name
 */
function extractRevisionNumber(recipeName: string): number {
  const match = recipeName.match(REVISION_SUFFIX_REGEX);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1; // Default to 1 if no revision suffix found
}

async function backfillBaseRecipeNames() {
  console.log("\n=== Backfilling Base Recipe Names ===\n");

  // Get all recipes - sort by Recipe name to ensure R01 is processed before R02
  const recipes = await prisma.recipe.findMany({
    select: {
      id: true,
      Recipe: true,
      revision: true,
      baseRecipeName: true,
      customerId: true,
    },
    orderBy: [{ Recipe: "asc" }],
  });

  // Sort recipes so lower revisions are processed first
  recipes.sort((a, b) => {
    const baseA = extractBaseRecipeName(a.Recipe);
    const baseB = extractBaseRecipeName(b.Recipe);
    if (baseA !== baseB) return baseA.localeCompare(baseB);
    return extractRevisionNumber(a.Recipe) - extractRevisionNumber(b.Recipe);
  });

  console.log(`Found ${recipes.length} recipes to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // First pass: Set baseRecipeName for all recipes
  for (const recipe of recipes) {
    // Skip if already has baseRecipeName
    if (recipe.baseRecipeName) {
      skipped++;
      continue;
    }

    const baseRecipeName = extractBaseRecipeName(recipe.Recipe);
    const parsedRevision = extractRevisionNumber(recipe.Recipe);

    try {
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          baseRecipeName,
          // Update revision from parsed value if current is 0 or null
          revision:
            recipe.revision === 0 || recipe.revision === null
              ? parsedRevision
              : recipe.revision,
        },
      });
      updated++;
      console.log(
        `  ✓ Updated: ${recipe.Recipe} -> base: "${baseRecipeName}", rev: ${parsedRevision}`
      );
    } catch (error: any) {
      console.error(`  ✗ Error updating ${recipe.Recipe}:`, error.message);
      errors++;
    }
  }

  console.log("\n--- First Pass Complete ---");
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);

  // Second pass: Link parent/child revisions
  console.log("\n=== Linking Revision Chains ===\n");

  // Group recipes by baseRecipeName
  const updatedRecipes = await prisma.recipe.findMany({
    where: {
      baseRecipeName: { not: null },
    },
    select: {
      id: true,
      Recipe: true,
      revision: true,
      baseRecipeName: true,
      parentRecipeId: true,
    },
    orderBy: [{ baseRecipeName: "asc" }, { revision: "asc" }],
  });

  // Group by baseRecipeName
  const recipeGroups = new Map<string, typeof updatedRecipes>();
  for (const recipe of updatedRecipes) {
    if (!recipe.baseRecipeName) continue;

    const group = recipeGroups.get(recipe.baseRecipeName) || [];
    group.push(recipe);
    recipeGroups.set(recipe.baseRecipeName, group);
  }

  let linked = 0;

  for (const [baseName, group] of recipeGroups) {
    if (group.length <= 1) continue; // No chain to link

    // Sort by revision
    group.sort((a, b) => (a.revision || 0) - (b.revision || 0));

    console.log(`  Processing "${baseName}" (${group.length} revisions)`);

    // Link each revision to its parent
    for (let i = 1; i < group.length; i++) {
      const current = group[i];
      const parent = group[i - 1];

      // Skip if already linked
      if (current.parentRecipeId === parent.id) continue;

      try {
        await prisma.recipe.update({
          where: { id: current.id },
          data: { parentRecipeId: parent.id },
        });
        linked++;
        console.log(
          `    ✓ Linked: R${current.revision} -> R${parent.revision}`
        );
      } catch (error: any) {
        console.error(`    ✗ Error linking ${current.Recipe}:`, error.message);
      }
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`  Total recipes processed: ${recipes.length}`);
  console.log(`  Base names set: ${updated}`);
  console.log(`  Revisions linked: ${linked}`);
  console.log(`  Errors: ${errors}`);

  // Verification
  const withBaseName = await prisma.recipe.count({
    where: { baseRecipeName: { not: null } },
  });
  const withParent = await prisma.recipe.count({
    where: { parentRecipeId: { not: null } },
  });

  console.log("\n  Verification:");
  console.log(`    Recipes with baseRecipeName: ${withBaseName}`);
  console.log(`    Recipes with parentRecipeId: ${withParent}`);
  console.log("");
}

async function main() {
  try {
    await backfillBaseRecipeNames();
  } catch (error) {
    console.error("Error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
