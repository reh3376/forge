const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function investigateRecipeLotConstraint() {
  try {
    console.log("\n🔍 INVESTIGATING RECIPE-LOT FOREIGN KEY CONSTRAINT\n");
    console.log("=".repeat(70));

    // Step 1: Check the FK constraint details from PostgreSQL catalog
    console.log("\n📝 STEP 1: Checking Foreign Key Constraint Details...\n");

    const fkConstraint = await prisma.$queryRawUnsafe(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'Lot'
        AND kcu.column_name = 'recipeId'
    `);

    if (fkConstraint.length > 0) {
      const fk = fkConstraint[0];
      console.log(`   Constraint Name: ${fk.constraint_name}`);
      console.log(
        `   Lot.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`
      );
      console.log(`   ON DELETE: ${fk.delete_rule}`);
      console.log(`   ON UPDATE: ${fk.update_rule}\n`);
    } else {
      console.log("   ⚠️  No FK constraint found (unexpected)\n");
    }

    // Step 2: Identify orphaned Recipes (the ones we tried to delete)
    console.log(
      "📝 STEP 2: Identifying Duplicate Recipes That Should Be Deleted...\n"
    );

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

    console.log(
      `   Found ${recipesToDelete.length} duplicate Recipes that should be deleted\n`
    );

    if (recipesToDelete.length === 0) {
      console.log("   ✓ No duplicates to investigate!\n");
      await prisma.$disconnect();
      return true;
    }

    const recipeIds = recipesToDelete.map((r) => r.id);

    // Step 3: Check which Recipes are referenced by Lots
    console.log("📝 STEP 3: Checking Lot References...\n");

    const lotReferences = await prisma.$queryRawUnsafe(
      `
      SELECT
        "recipeId",
        r."Recipe" as recipe_name,
        COUNT(*) as lot_count,
        COUNT(*) FILTER (WHERE status = 'Complete') as complete_lot_count,
        COUNT(*) FILTER (WHERE status = 'Started') as started_lot_count,
        COUNT(*) FILTER (WHERE status = 'PendingValidation') as pending_lot_count,
        COUNT(*) FILTER (WHERE status = 'Verified') as verified_lot_count,
        ARRAY_AGG(DISTINCT status) as statuses
      FROM "Lot"
      JOIN "Recipe" r ON r.id = "Lot"."recipeId"
      WHERE "recipeId" = ANY($1::text[])
      GROUP BY "recipeId", r."Recipe"
      ORDER BY complete_lot_count DESC, lot_count DESC
    `,
      recipeIds
    );

    console.log(
      `   ${lotReferences.length} of ${recipesToDelete.length} duplicate Recipes are referenced by Lots\n`
    );

    if (lotReferences.length > 0) {
      console.log("   Recipes Referenced by Lots:\n");
      lotReferences.forEach((ref) => {
        console.log(`   ${ref.recipe_name} (${ref.recipeId})`);
        console.log(`     Total Lots: ${ref.lot_count}`);
        console.log(
          `     Complete: ${ref.complete_lot_count}, Verified: ${ref.verified_lot_count}, ` +
            `Pending: ${ref.pending_lot_count}, Started: ${ref.started_lot_count}`
        );
        console.log(`     Statuses: ${ref.statuses.join(", ")}\n`);
      });
    }

    // Step 4: Check if Recipes NOT referenced by Lots can be deleted
    console.log("📝 STEP 4: Identifying Recipes Without Lot References...\n");

    const referencedRecipeIds = lotReferences.map((r) => r.recipeId);
    const notReferencedByLots = recipesToDelete.filter(
      (r) => !referencedRecipeIds.includes(r.id)
    );

    console.log(
      `   ${notReferencedByLots.length} duplicate Recipes are NOT referenced by any Lots\n`
    );

    if (notReferencedByLots.length > 0) {
      console.log("   Examples:");
      notReferencedByLots.slice(0, 5).forEach((r) => {
        console.log(`     ${r.name}`);
      });
      console.log("");
    }

    // Step 5: Test deletion of one non-Lot-referenced Recipe
    if (notReferencedByLots.length > 0) {
      console.log(
        "📝 STEP 5: Testing Deletion of Recipe WITHOUT Lot Reference...\n"
      );

      const testRecipe = notReferencedByLots[0];
      console.log(`   Attempting to delete: ${testRecipe.name}\n`);

      try {
        await prisma.$executeRaw`BEGIN`;
        await prisma.$executeRawUnsafe(
          `
          DELETE FROM "Recipe" WHERE id = $1
        `,
          testRecipe.id
        );
        console.log(
          `   ✓ Successfully deleted ${testRecipe.name} (no Lot references)`
        );
        await prisma.$executeRaw`ROLLBACK`;
        console.log("   ℹ️  Rolled back (test only)\n");
      } catch (error) {
        await prisma.$executeRaw`ROLLBACK`;
        console.log(`   ❌ Deletion failed even without Lot reference!`);
        console.log(`   Error: ${error.message}\n`);
      }
    }

    // Step 6: Summary and recommendations
    console.log("=".repeat(70));
    console.log("📊 SUMMARY\n");

    const recipesBlockedByCompleteLots = lotReferences.filter(
      (r) => Number(r.complete_lot_count) > 0
    ).length;
    const recipesBlockedByOtherLots = lotReferences.filter(
      (r) => Number(r.complete_lot_count) === 0
    ).length;

    console.log(`Total duplicate Recipes to delete: ${recipesToDelete.length}`);
    console.log(`  Blocked by Complete Lots: ${recipesBlockedByCompleteLots}`);
    console.log(`  Blocked by Other Lots: ${recipesBlockedByOtherLots}`);
    console.log(`  No Lot references: ${notReferencedByLots.length}\n`);

    if (fkConstraint.length > 0 && fkConstraint[0].delete_rule === "RESTRICT") {
      console.log("⚠️  FK Constraint: ON DELETE RESTRICT");
      console.log("   → Recipes cannot be deleted while Lots reference them\n");
    }

    console.log("🎯 RECOMMENDATIONS:\n");

    if (recipesBlockedByCompleteLots > 0) {
      console.log(
        `1. ${recipesBlockedByCompleteLots} Recipes are protected by Complete Lots`
      );
      console.log(
        "   → These CANNOT be deleted (data integrity for completed production)\n"
      );
    }

    if (recipesBlockedByOtherLots > 0) {
      console.log(
        `2. ${recipesBlockedByOtherLots} Recipes are referenced by non-Complete Lots`
      );
      console.log(
        "   → Consider if these Lots can have recipeId updated to target Recipe\n"
      );
    }

    if (notReferencedByLots.length > 0) {
      console.log(
        `3. ${notReferencedByLots.length} Recipes have NO Lot references`
      );
      console.log("   → Check for other FK constraints blocking deletion\n");
    }

    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

investigateRecipeLotConstraint().then(() => {
  process.exit(0);
});
