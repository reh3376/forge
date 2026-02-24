const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function deleteOrphanedRecipes() {
  try {
    console.log("\n🗑️  DELETE ORPHANED DUPLICATE RECIPES\n");
    console.log("=".repeat(70));

    await prisma.$executeRaw`BEGIN`;
    console.log("⏰ Started at:", new Date().toISOString());
    console.log("✓ Transaction started\n");

    // First, let's identify which Recipes to delete (the duplicates we migrated away from)
    console.log("📝 STEP 1: Identifying orphaned duplicate Recipes...\n");

    const duplicateGroups = await prisma.$queryRawUnsafe(`
      SELECT
        REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g') as target_name,
        ARRAY_AGG(id ORDER BY
          CASE
            WHEN "Recipe" NOT LIKE 'RUN%' THEN 1  -- Keep non-RUN recipes
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
      // Skip the first one (the target/keeper), add the rest to delete list
      for (let i = 1; i < group.recipe_ids.length; i++) {
        recipesToDelete.push({
          id: group.recipe_ids[i],
          name: group.recipe_names[i],
        });
      }
    });

    console.log(
      `   Found ${recipesToDelete.length} duplicate Recipes to delete`
    );
    console.log(`   (from ${duplicateGroups.length} groups)\n`);

    if (recipesToDelete.length === 0) {
      console.log("   ✓ No orphaned Recipes to delete!\n");
      await prisma.$executeRaw`COMMIT`;
      await prisma.$disconnect();
      return true;
    }

    // Show some examples
    console.log("   Examples of Recipes to delete:");
    recipesToDelete.slice(0, 10).forEach((r) => {
      console.log(`     ${r.name}`);
    });
    console.log("");

    // Check if any of these still have references (they shouldn't after our migration)
    console.log("📝 STEP 2: Verifying no remaining references...\n");

    const recipeIds = recipesToDelete.map((r) => r.id);

    const checks = [
      { table: "ProductionOrderRecipeInstance", field: "recipeId" },
      { table: "ProductionOrder", field: "recipeId" },
      { table: "ScheduleOrder", field: "scheduleOrderRecipeId" },
      { table: "Comment", field: "recipeId" },
      { table: "Recipe", field: "classIdId" },
    ];

    let hasReferences = false;
    for (const check of checks) {
      const count = await prisma.$queryRawUnsafe(
        `
        SELECT COUNT(*) as count
        FROM "${check.table}"
        WHERE "${check.field}" = ANY($1::text[])
      `,
        recipeIds
      );

      if (Number(count[0].count) > 0) {
        console.log(
          `   ⚠️  Found ${count[0].count} references in ${check.table}.${check.field}`
        );
        hasReferences = true;
      }
    }

    // Check many-to-many tables
    const m2mChecks = [
      "_RecipeToRecipeBom",
      "_RecipeToRecipeParameter",
      "_RecipeToUnitProcedure",
    ];

    for (const tableName of m2mChecks) {
      const count = await prisma.$queryRawUnsafe(
        `
        SELECT COUNT(*) as count
        FROM "${tableName}"
        WHERE "A" = ANY($1::text[])
      `,
        recipeIds
      );

      if (Number(count[0].count) > 0) {
        console.log(
          `   ⚠️  Found ${count[0].count} references in ${tableName}.A`
        );
        hasReferences = true;
      }
    }

    if (hasReferences) {
      console.log("\n   ❌ ERROR: Some Recipes still have references!");
      console.log("   This should not happen. Rolling back...\n");
      await prisma.$executeRaw`ROLLBACK`;
      await prisma.$disconnect();
      return false;
    }

    console.log("   ✓ No references found - safe to delete\n");

    // Delete the orphaned Recipes one by one to see which fails
    console.log("📝 STEP 3: Deleting orphaned Recipes...\n");

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

    // Final verification
    console.log("=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\n");

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

    console.log("\n📊 Database Summary:");
    console.log(`   Total Recipes: ${summary[0].total_recipes}`);
    console.log(`   Unique Recipe names: ${summary[0].unique_recipe_names}`);

    console.log("\n" + "=".repeat(70));

    if (deletedCount > 0) {
      console.log(
        `✅ DELETION SUCCESSFUL - Removed ${deletedCount} orphaned Recipes!`
      );
      if (failedCount > 0) {
        console.log(
          `ℹ️  Note: ${failedCount} Recipes could not be deleted (may need manual investigation)`
        );
      }
      console.log("\n💾 COMMITTING TRANSACTION...");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ Transaction committed successfully!\n");
      return true;
    } else {
      console.log("⚠️  No Recipes were deleted - Rolling back...");
      await prisma.$executeRaw`ROLLBACK`;
      console.log("🔄 Transaction rolled back\n");
      return false;
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
    console.log("\n🔄 Rolling back transaction...");
    try {
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

deleteOrphanedRecipes().then((success) => {
  process.exit(success ? 0 : 1);
});
