const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function deleteSafeRecipes() {
  try {
    console.log("\n🗑️  DELETE SAFE DUPLICATE RECIPES\n");
    console.log("=".repeat(70));

    await prisma.$executeRaw`BEGIN`;
    console.log("⏰ Started at:", new Date().toISOString());
    console.log("✓ Transaction started\n");

    // Step 1: Identify all duplicate Recipes
    console.log("📝 STEP 1: Identifying duplicate Recipes...\n");

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
        });
      }
    });

    console.log(`   Found ${recipesToDelete.length} duplicate Recipes\n`);

    const recipeIds = recipesToDelete.map((r) => r.id);

    // Step 2: Filter out Recipes blocked by Complete Lots
    console.log("📝 STEP 2: Filtering out Complete Lot blockers...\n");

    const completeLotBlockers = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT "recipeId"
      FROM "Lot"
      WHERE "recipeId" = ANY($1::text[])
        AND status = 'Complete'
    `,
      recipeIds
    );

    const blockedIds = completeLotBlockers.map((r) => r.recipeId);
    const safeToDelete = recipesToDelete.filter(
      (r) => !blockedIds.includes(r.id)
    );

    console.log(`   Blocked by Complete Lots: ${blockedIds.length}`);
    console.log(`   Safe to delete: ${safeToDelete.length}\n`);

    if (safeToDelete.length === 0) {
      console.log("   ✓ No safe Recipes to delete!\n");
      await prisma.$executeRaw`COMMIT`;
      await prisma.$disconnect();
      return true;
    }

    // Step 3: Show examples of what will be deleted
    console.log("   Examples of Recipes to delete:");
    safeToDelete.slice(0, 10).forEach((r) => {
      console.log(`     ${r.name}`);
    });
    console.log("");

    // Step 4: Delete safe Recipes
    console.log("📝 STEP 3: Deleting safe duplicate Recipes...\n");

    const safeIds = safeToDelete.map((r) => r.id);
    let deletedCount = 0;
    let failedCount = 0;
    const failedRecipes = [];

    for (const recipe of safeToDelete) {
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
      console.log(`   ⚠️  Failed to delete: ${failedCount} Recipes\\n`);
      console.log("   Failed Recipes:");
      failedRecipes.slice(0, 10).forEach((r) => {
        console.log(`     ${r.name}`);
        console.log(`       Error: ${r.error.substring(0, 100)}`);
      });
      console.log("");
    } else {
      console.log("");
    }

    // Step 5: Try to strip RUN# prefixes from remaining Recipes
    console.log("📝 STEP 4: Attempting to strip RUN# prefixes...\\n");

    let strippedCount = 0;
    try {
      await prisma.$executeRaw`SAVEPOINT before_strip`;
      strippedCount = await prisma.$executeRaw`
        UPDATE "Recipe"
        SET "Recipe" = REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g')
        WHERE "Recipe" LIKE 'RUN%'
      `;
      await prisma.$executeRaw`RELEASE SAVEPOINT before_strip`;
      console.log(
        `   ✓ Stripped RUN# prefixes from ${strippedCount} Recipes\\n`
      );
    } catch (stripError) {
      await prisma.$executeRaw`ROLLBACK TO SAVEPOINT before_strip`;
      console.log(
        `   ⚠️  Could not strip RUN# prefixes (would create duplicates)`
      );
      console.log(`   ℹ️  This is expected for Recipes with Complete Lots\\n`);
    }

    // Final verification
    console.log("=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\\n");

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
          (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names
    `;

    console.log("\\n📊 Database Summary:");
    console.log(`   Total Recipes: ${summary[0].total_recipes}`);
    console.log(`   Unique Recipe names: ${summary[0].unique_recipe_names}`);

    console.log("\\n" + "=".repeat(70));

    if (deletedCount > 0) {
      console.log(
        `✅ DELETION SUCCESSFUL - Removed ${deletedCount} duplicate Recipes!`
      );
      if (failedCount > 0) {
        console.log(
          `⚠️  Note: ${failedCount} Recipes could not be deleted (may be protected)`
        );
      }
      if (Number(runPrefixes[0].count) > 0) {
        console.log(
          `ℹ️  Note: ${runPrefixes[0].count} Recipes retain RUN# prefixes (Complete Lot protection)`
        );
      }
      console.log("\\n💾 COMMITTING TRANSACTION...");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ Transaction committed successfully!\\n");
      return true;
    } else {
      console.log("⚠️  No Recipes were deleted - Rolling back...");
      await prisma.$executeRaw`ROLLBACK`;
      console.log("🔄 Transaction rolled back\\n");
      return false;
    }
  } catch (error) {
    console.error("\\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
    console.log("\\n🔄 Rolling back transaction...");
    try {
      await prisma.$executeRaw`ROLLBACK`;
      console.log("✅ Rollback successful\\n");
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError.message);
    }
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

deleteSafeRecipes().then((success) => {
  process.exit(success ? 0 : 1);
});
