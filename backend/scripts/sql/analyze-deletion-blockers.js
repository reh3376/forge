const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function analyzeDeletionBlockers() {
  try {
    console.log("\n🔍 ANALYZING RECIPE DELETION BLOCKERS\n");
    console.log("=".repeat(70));

    // Step 1: Identify all duplicate Recipes
    const duplicateGroups = await prisma.$queryRawUnsafe(`
      SELECT
        REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g') as target_name,
        ARRAY_AGG(id ORDER BY
          CASE
            WHEN "Recipe" NOT LIKE 'RUN%' THEN 1
            ELSE 2
          END,
          "createdAt" DESC
        ) as recipe_ids,
        ARRAY_AGG("Recipe" ORDER BY
          CASE
            WHEN "Recipe" NOT LIKE 'RUN%' THEN 1
            ELSE 2
          END,
          "createdAt" DESC
        ) as recipe_names
      FROM "Recipe"
      WHERE "Recipe" LIKE '%-%'
      GROUP BY target_name
      HAVING COUNT(*) > 1
    `);

    const recipesToDelete = [];
    duplicateGroups.forEach((group) => {
      for (let i = 1; i < group.recipe_ids.length; i++) {
        recipesToDelete.push({
          id: group.recipe_ids[i],
          name: group.recipe_names[i],
          targetId: group.recipe_ids[0],
          targetName: group.recipe_names[0],
        });
      }
    });

    console.log(
      `\n📝 Total duplicate Recipes to analyze: ${recipesToDelete.length}\n`
    );

    const recipeIds = recipesToDelete.map((r) => r.id);

    // Step 2: Check RESTRICT constraint - ProductionOrderRecipeInstance
    console.log(
      "📝 Checking ProductionOrderRecipeInstance (ON DELETE RESTRICT)...\n"
    );

    const poriReferences = await prisma.$queryRawUnsafe(
      `
      SELECT
        "recipeId",
        r."Recipe" as recipe_name,
        COUNT(*) as instance_count
      FROM "ProductionOrderRecipeInstance"
      JOIN "Recipe" r ON r.id = "ProductionOrderRecipeInstance"."recipeId"
      WHERE "recipeId" = ANY($1::text[])
      GROUP BY "recipeId", r."Recipe"
      ORDER BY instance_count DESC
    `,
      recipeIds
    );

    console.log(
      `   ${poriReferences.length} Recipes are BLOCKED by ProductionOrderRecipeInstance\n`
    );

    if (poriReferences.length > 0) {
      console.log("   Top 10 most referenced:");
      poriReferences.slice(0, 10).forEach((ref) => {
        console.log(`     ${ref.recipe_name}: ${ref.instance_count} instances`);
      });
      console.log("");
    }

    // Step 3: Check Complete Lot blocker
    console.log("📝 Checking Complete Lots (trigger blocks SET NULL)...\n");

    const completeLotReferences = await prisma.$queryRawUnsafe(
      `
      SELECT
        "recipeId",
        r."Recipe" as recipe_name,
        COUNT(*) as complete_lot_count
      FROM "Lot"
      JOIN "Recipe" r ON r.id = "Lot"."recipeId"
      WHERE "recipeId" = ANY($1::text[])
        AND status = 'Complete'
      GROUP BY "recipeId", r."Recipe"
      ORDER BY complete_lot_count DESC
    `,
      recipeIds
    );

    console.log(
      `   ${completeLotReferences.length} Recipes are BLOCKED by Complete Lots\n`
    );

    if (completeLotReferences.length > 0) {
      console.log("   Top 10 most referenced:");
      completeLotReferences.slice(0, 10).forEach((ref) => {
        console.log(
          `     ${ref.recipe_name}: ${ref.complete_lot_count} complete lots`
        );
      });
      console.log("");
    }

    // Step 4: Identify Recipes that CAN be deleted
    const poriBlockedIds = poriReferences.map((r) => r.recipeId);
    const completeLotBlockedIds = completeLotReferences.map((r) => r.recipeId);
    const allBlockedIds = new Set([
      ...poriBlockedIds,
      ...completeLotBlockedIds,
    ]);

    const deletableRecipes = recipesToDelete.filter(
      (r) => !allBlockedIds.has(r.id)
    );

    console.log("=".repeat(70));
    console.log("📊 SUMMARY\n");

    console.log(`Total duplicate Recipes: ${recipesToDelete.length}`);
    console.log(
      `  Blocked by ProductionOrderRecipeInstance: ${poriBlockedIds.length}`
    );
    console.log(`  Blocked by Complete Lots: ${completeLotBlockedIds.length}`);
    console.log(
      `  Both blockers: ${
        poriBlockedIds.filter((id) => completeLotBlockedIds.includes(id)).length
      }`
    );
    console.log(`  CAN BE DELETED: ${deletableRecipes.length}\n`);

    if (deletableRecipes.length > 0) {
      console.log("✅ Recipes that CAN be safely deleted:\n");
      deletableRecipes.forEach((r) => {
        console.log(`   ${r.name} → ${r.targetName}`);
      });
      console.log("");
    }

    // Step 5: Recommendations
    console.log("=".repeat(70));
    console.log("🎯 RECOMMENDATIONS\n");

    if (poriBlockedIds.length > 0) {
      console.log(
        `1. ProductionOrderRecipeInstance Blocker (${poriBlockedIds.length} Recipes)`
      );
      console.log("   ✅ ALREADY MIGRATED in recipe consolidation script!");
      console.log("   → All references should now point to target Recipes");
      console.log("   → These should be deletable after migration\n");
    }

    if (completeLotBlockedIds.length > 0) {
      console.log(
        `2. Complete Lot Blocker (${completeLotBlockedIds.length} Recipes)`
      );
      console.log("   ❌ CANNOT DELETE - protected by data integrity trigger");
      console.log(
        "   → Complete Lots must retain their original Recipe reference"
      );
      console.log("   → These Recipes should keep their RUN# prefixes\n");
    }

    if (deletableRecipes.length > 0) {
      console.log(`3. Deletable Recipes (${deletableRecipes.length} Recipes)`);
      console.log("   ✅ Safe to delete - no blocking references");
      console.log("   → Delete these now\n");
    }

    console.log("=".repeat(70));
    console.log("\n💡 NEXT STEPS:\n");
    console.log(
      "1. Verify ProductionOrderRecipeInstance migration completed successfully"
    );
    console.log("2. Delete the safe-to-delete Recipes (no blockers)");
    console.log(
      "3. Try to delete ProductionOrderRecipeInstance-blocked Recipes"
    );
    console.log(
      "4. Accept that Complete-Lot-blocked Recipes cannot be deleted\n"
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDeletionBlockers().then(() => {
  process.exit(0);
});
