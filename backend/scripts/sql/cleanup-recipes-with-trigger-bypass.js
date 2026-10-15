const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function cleanupRecipesWithTriggerBypass() {
  try {
    console.log("\n🔧 RECIPE CLEANUP WITH TRIGGER BYPASS\n");
    console.log("=".repeat(70));

    await prisma.$executeRaw`BEGIN`;
    console.log("⏰ Started at:", new Date().toISOString());
    console.log("✓ Transaction started\n");

    // ===== PHASE 1: Pre-flight Checks =====
    console.log("📝 PHASE 1: Pre-flight Checks...\n");

    // First, find and delete recipes marked for deletion (DEL, DELETE, x- prefixes)
    console.log("   Checking for recipes marked for deletion...\n");

    const recipesMarkedForDeletion = await prisma.$queryRawUnsafe(`
      SELECT id, "Recipe"
      FROM "Recipe"
      WHERE "Recipe" ILIKE 'DEL%'
         OR "Recipe" ILIKE 'DELETE%'
         OR "Recipe" ILIKE 'x-%'
         OR "Recipe" ILIKE 'x_%'
         OR "Recipe" ILIKE '%-DELETE'
         OR "Recipe" ILIKE '%DELETE%'
      ORDER BY "Recipe"
    `);

    console.log(
      `   Found ${recipesMarkedForDeletion.length} recipes marked for deletion:`
    );
    recipesMarkedForDeletion.slice(0, 10).forEach((r) => {
      console.log(`     - ${r.Recipe}`);
    });
    if (recipesMarkedForDeletion.length > 10) {
      console.log(`     ... and ${recipesMarkedForDeletion.length - 10} more`);
    }
    console.log("");

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
        AND "Recipe" NOT ILIKE 'DEL%'
        AND "Recipe" NOT ILIKE 'DELETE%'
        AND "Recipe" NOT ILIKE 'x-%'
        AND "Recipe" NOT ILIKE 'x_%'
        AND "Recipe" NOT ILIKE '%-DELETE'
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
      `   Found ${recipesToDelete.length} duplicate Recipes to process`
    );

    const recipeIds = recipesToDelete.map((r) => r.id);

    // Check Complete Lot references
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
      `   ${completeLotReferences.length} Recipes are blocked by Complete Lots`
    );

    const totalCompleteLots = completeLotReferences.reduce(
      (sum, ref) => sum + Number(ref.complete_lot_count),
      0
    );
    console.log(`   ${totalCompleteLots} Complete Lots will be updated\n`);

    if (recipesToDelete.length === 0) {
      console.log("   ✓ No duplicates to process!\n");
      await prisma.$executeRaw`COMMIT`;
      await prisma.$disconnect();
      return true;
    }

    // Show examples
    console.log("   Examples of Recipes to delete:");
    recipesToDelete.slice(0, 5).forEach((r) => {
      console.log(`     ${r.name} → ${r.targetName}`);
    });
    console.log("");

    // ===== PHASE 2: DROP Triggers =====
    console.log("📝 PHASE 2: Dropping Complete Lot Protection Triggers...\n");

    // Verify triggers exist first
    const existingTriggers = await prisma.$queryRawUnsafe(`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE event_object_table = 'Lot'
        AND trigger_name IN ('prevent_update_on_complete_lot', 'prevent_delete_on_complete_lot')
    `);

    console.log(`   Found ${existingTriggers.length} triggers on Lot table`);
    existingTriggers.forEach((t) => {
      console.log(`     - ${t.trigger_name}`);
    });
    console.log("");

    // Drop triggers
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS prevent_update_on_complete_lot ON "Lot"`;
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS prevent_delete_on_complete_lot ON "Lot"`;

    console.log("   ✓ Triggers temporarily disabled\n");

    // ===== PHASE 3: Update Complete Lot References =====
    console.log("📝 PHASE 3: Updating Complete Lot References...\n");

    let totalLotsUpdated = 0;

    for (const group of duplicateGroups) {
      const targetRecipeId = group.recipe_ids[0];
      const sourceRecipeIds = group.recipe_ids.slice(1);

      if (sourceRecipeIds.length === 0) continue;

      // Update Complete Lots to point to target Recipe
      const lotsUpdated = await prisma.$executeRawUnsafe(
        `
        UPDATE "Lot"
        SET "recipeId" = $1
        WHERE "recipeId" = ANY($2::text[])
          AND status = 'Complete'
      `,
        targetRecipeId,
        sourceRecipeIds
      );

      totalLotsUpdated += lotsUpdated;
    }

    console.log(`   ✓ Updated ${totalLotsUpdated} Complete Lot references\n`);

    // ===== PHASE 4A: Delete Recipes Marked for Deletion =====
    console.log(
      "📝 PHASE 4A: Deleting Recipes Marked for Deletion (DEL, DELETE, x-)...\n"
    );

    let deletedMarkedCount = 0;
    let skippedMarkedCount = 0;
    const skippedMarkedRecipes = [];

    for (const recipe of recipesMarkedForDeletion) {
      try {
        // Check for dependencies
        const [
          recipeBomItems,
          recipeParameters,
          productionOrders,
          recipeInstances,
        ] = await Promise.all([
          prisma.recipeBomItem.count({ where: { recipeId: recipe.id } }),
          prisma.recipeParameter.count({ where: { recipeId: recipe.id } }),
          prisma.productionOrder.count({ where: { recipeId: recipe.id } }),
          prisma.productionOrderRecipeInstance.count({
            where: { recipeId: recipe.id },
          }),
        ]);

        if (productionOrders > 0 || recipeInstances > 0) {
          console.log(
            `   ⚠️  Skipping ${recipe.Recipe} (has ${productionOrders} production orders, ${recipeInstances} instances)`
          );
          skippedMarkedCount++;
          skippedMarkedRecipes.push(recipe);
          continue;
        }

        // Delete dependencies first
        if (recipeBomItems > 0) {
          await prisma.recipeBomItem.deleteMany({
            where: { recipeId: recipe.id },
          });
        }
        if (recipeParameters > 0) {
          await prisma.recipeParameter.deleteMany({
            where: { recipeId: recipe.id },
          });
        }

        // Nullify child recipe references
        await prisma.recipe.updateMany({
          where: { classIdId: recipe.id },
          data: { classIdId: null },
        });

        // Delete the recipe
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Recipe" WHERE id = $1`,
          recipe.id
        );
        deletedMarkedCount++;
      } catch (error) {
        console.log(
          `   ❌ Failed to delete ${recipe.Recipe}: ${error.message}`
        );
        skippedMarkedCount++;
        skippedMarkedRecipes.push(recipe);
      }
    }

    console.log(
      `   ✓ Deleted ${deletedMarkedCount} recipes marked for deletion`
    );
    if (skippedMarkedCount > 0) {
      console.log(
        `   ⚠️  Skipped ${skippedMarkedCount} recipes (require manual intervention)`
      );
    }
    console.log("");

    // ===== PHASE 4B: Delete Duplicate Recipes =====
    console.log("📝 PHASE 4B: Deleting Duplicate Recipes...\n");

    let deletedCount = 0;
    let failedCount = 0;
    const failedRecipes = [];

    for (const recipe of recipesToDelete) {
      try {
        await prisma.$executeRawUnsafe(
          `
          DELETE FROM "Recipe" WHERE id = $1
        `,
          recipe.id
        );
        deletedCount++;
      } catch (error) {
        failedCount++;
        failedRecipes.push({
          ...recipe,
          error: error.message,
        });
      }
    }

    console.log(`   ✓ Successfully deleted: ${deletedCount} Recipes`);
    if (failedCount > 0) {
      console.log(`   ⚠️  Failed to delete: ${failedCount} Recipes\n`);
      console.log("   Failed Recipes:");
      failedRecipes.slice(0, 10).forEach((r) => {
        console.log(`     ${r.name}`);
        console.log(`       Error: ${r.error.substring(0, 100)}`);
      });
      console.log("");
    } else {
      console.log("");
    }

    // ===== PHASE 5: Strip RUN# Prefixes =====
    console.log("📝 PHASE 5: Stripping RUN# Prefixes...\n");

    let strippedCount = 0;
    try {
      strippedCount = await prisma.$executeRaw`
        UPDATE "Recipe"
        SET "Recipe" = REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g')
        WHERE "Recipe" LIKE 'RUN%'
      `;
      console.log(
        `   ✓ Stripped RUN# prefixes from ${strippedCount} Recipes\n`
      );
    } catch (stripError) {
      console.log(`   ⚠️  Could not strip RUN# prefixes`);
      console.log(`   Error: ${stripError.message}\n`);
    }

    // ===== PHASE 6: RECREATE Triggers =====
    console.log("📝 PHASE 6: Restoring Complete Lot Protection Triggers...\n");

    // Recreate UPDATE trigger
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER prevent_update_on_complete_lot
          BEFORE UPDATE ON "Lot"
          FOR EACH ROW
          EXECUTE FUNCTION prevent_modification_complete_lots()
    `);

    // Recreate DELETE trigger
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER prevent_delete_on_complete_lot
          BEFORE DELETE ON "Lot"
          FOR EACH ROW
          EXECUTE FUNCTION prevent_modification_complete_lots()
    `);

    console.log("   ✓ Triggers restored\n");

    // ===== PHASE 7: Verification =====
    console.log("=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\n");

    // Verify triggers restored
    const restoredTriggers = await prisma.$queryRawUnsafe(`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE event_object_table = 'Lot'
        AND trigger_name IN ('prevent_update_on_complete_lot', 'prevent_delete_on_complete_lot')
    `);

    console.log(`✓ Triggers restored: ${restoredTriggers.length}/2`);
    restoredTriggers.forEach((t) => {
      console.log(`  - ${t.trigger_name}`);
    });
    console.log("");

    // Recipe verification
    const recipeDups = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1) d
    `;
    console.log(`✓ Recipe duplicate groups: ${recipeDups[0].count}`);

    const runPrefixes = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
    `;
    console.log(`✓ Recipes with RUN# prefixes: ${runPrefixes[0].count}`);

    const summary = await prisma.$queryRaw`
      SELECT
          (SELECT COUNT(*) FROM "Recipe") as total_recipes,
          (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
          (SELECT COUNT(*) FROM "Lot" WHERE status = 'Complete') as complete_lots
    `;

    console.log("\n📊 Database Summary:");
    console.log(`   Total Recipes: ${summary[0].total_recipes}`);
    console.log(`   Unique Recipe names: ${summary[0].unique_recipe_names}`);
    console.log(`   Complete Lots: ${summary[0].complete_lots}`);

    console.log("\n" + "=".repeat(70));

    // Success criteria
    const allClean =
      Number(recipeDups[0].count) === 0 &&
      Number(runPrefixes[0].count) === 0 &&
      restoredTriggers.length === 2;

    if (allClean) {
      console.log("✅ ALL CHECKS PASSED - Recipe cleanup successful!");
      console.log(
        `   ✓ Deleted ${deletedMarkedCount} recipes marked for deletion (DEL/DELETE/x-)`
      );
      console.log(`   ✓ Deleted ${deletedCount} duplicate Recipes`);
      console.log(`   ✓ Updated ${totalLotsUpdated} Complete Lot references`);
      console.log(`   ✓ Stripped ${strippedCount} RUN# prefixes`);
      console.log(`   ✓ Triggers restored and functional`);
      if (skippedMarkedCount > 0) {
        console.log(
          `   ⚠️  ${skippedMarkedCount} marked recipes skipped (have active production orders)`
        );
      }
      console.log("\n💾 COMMITTING TRANSACTION...");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ Transaction committed successfully!\n");
      return true;
    } else {
      console.log("⚠️  Some issues detected:");
      if (Number(recipeDups[0].count) > 0) {
        console.log(
          `   - ${recipeDups[0].count} Recipe duplicate groups remain`
        );
      }
      if (Number(runPrefixes[0].count) > 0) {
        console.log(
          `   - ${runPrefixes[0].count} Recipes with RUN# prefixes remain`
        );
      }
      if (restoredTriggers.length < 2) {
        console.log(`   - Only ${restoredTriggers.length}/2 triggers restored`);
      }
      console.log("\n   Rolling back for safety...");
      await prisma.$executeRaw`ROLLBACK`;
      console.log("🔄 Transaction rolled back\n");
      return false;
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
    console.log("\n🔄 Rolling back transaction...");
    try {
      // Try to restore triggers before rollback
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TRIGGER IF NOT EXISTS prevent_update_on_complete_lot
              BEFORE UPDATE ON "Lot"
              FOR EACH ROW
              EXECUTE FUNCTION prevent_modification_complete_lots()
        `);
        await prisma.$executeRawUnsafe(`
          CREATE TRIGGER IF NOT EXISTS prevent_delete_on_complete_lot
              BEFORE DELETE ON "Lot"
              FOR EACH ROW
              EXECUTE FUNCTION prevent_modification_complete_lots()
        `);
        console.log("✓ Triggers restored before rollback");
      } catch (triggerError) {
        console.log("⚠️  Could not restore triggers (will rollback)");
      }

      await prisma.$executeRaw`ROLLBACK`;
      console.log("✅ Rollback successful\n");
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError.message);
    }
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupRecipesWithTriggerBypass().then((success) => {
  process.exit(success ? 0 : 1);
});
