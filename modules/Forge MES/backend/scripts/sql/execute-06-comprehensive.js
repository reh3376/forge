const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function executeComprehensiveResolution() {
  try {
    console.log("\n🔧 COMPREHENSIVE DUPLICATE RESOLUTION (SCRIPT 06)\n");
    console.log("=".repeat(70));

    // Start transaction
    await prisma.$executeRaw`BEGIN`;
    console.log("⏰ Started at:", new Date().toISOString());
    console.log("✓ Transaction started\n");

    // ===== PART 0: Strip RUN# prefixes to reveal duplicates =====
    console.log("📝 PART 0: Stripping RUN# prefixes to reveal duplicates...\n");

    const bomRunBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'`;
    console.log(`   BOMs with RUN# prefixes: ${bomRunBefore[0].count}`);

    await prisma.$executeRaw`UPDATE "Bom" SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g') WHERE "bomRevision" LIKE 'RUN%'`;
    console.log("   ✓ Stripped RUN# prefixes from BOM revisions");

    const recipeRunBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE 'RUN%'`;
    console.log(`   Recipes with RUN# prefixes: ${recipeRunBefore[0].count}`);

    await prisma.$executeRaw`UPDATE "Recipe" SET "recipeName" = REGEXP_REPLACE("recipeName", '^RUN[0-9]+-', '', 'g') WHERE "recipeName" LIKE 'RUN%'`;
    console.log("   ✓ Stripped RUN# prefixes from Recipe names\n");

    // Check how many duplicates we now have
    const bomDupsCreated = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
      ) dup
    `;
    console.log(
      `   📊 Created ${bomDupsCreated[0].count} BOM duplicate groups\n`
    );

    // ===== PART 1: BOM DUPLICATE RESOLUTION =====
    console.log("📝 PART 1: Resolving BOM duplicates...\n");

    // Migrate BomItems to best BOMs
    const bomItemUpdate = await prisma.$executeRaw`
      UPDATE "BomItem"
      SET "bomId" = (
          WITH best_boms AS (
              SELECT DISTINCT
                  "bomRevision",
                  FIRST_VALUE(id) OVER (
                      PARTITION BY "bomRevision"
                      ORDER BY
                          CASE
                              WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                              WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                              ELSE 3
                          END,
                          (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                          (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                          b."createdAt"
                  ) as target_bom_id
              FROM "Bom" b
              WHERE "bomRevision" IN (
                  SELECT "bomRevision"
                  FROM "Bom"
                  GROUP BY "bomRevision"
                  HAVING COUNT(*) > 1
              )
          )
          SELECT bb.target_bom_id
          FROM best_boms bb
          JOIN "Bom" b ON b.id = "BomItem"."bomId"
          WHERE bb."bomRevision" = b."bomRevision"
      )
      WHERE "bomId" IN (
          SELECT b.id
          FROM "Bom" b
          WHERE b."bomRevision" IN (
              SELECT "bomRevision"
              FROM "Bom"
              GROUP BY "bomRevision"
              HAVING COUNT(*) > 1
          )
      )
    `;
    console.log(`   ✓ Migrated ${bomItemUpdate} BomItem records`);

    // Migrate ProductionOrders to best BOMs
    const poUpdate = await prisma.$executeRaw`
      UPDATE "ProductionOrder"
      SET "bomId" = (
          WITH best_boms AS (
              SELECT DISTINCT
                  "bomRevision",
                  FIRST_VALUE(id) OVER (
                      PARTITION BY "bomRevision"
                      ORDER BY
                          CASE
                              WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                              WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                              ELSE 3
                          END,
                          (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                          (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                          b."createdAt"
                  ) as target_bom_id
              FROM "Bom" b
              WHERE "bomRevision" IN (
                  SELECT "bomRevision"
                  FROM "Bom"
                  GROUP BY "bomRevision"
                  HAVING COUNT(*) > 1
              )
          )
          SELECT bb.target_bom_id
          FROM best_boms bb
          JOIN "Bom" b ON b.id = "ProductionOrder"."bomId"
          WHERE bb."bomRevision" = b."bomRevision"
      )
      WHERE "bomId" IN (
          SELECT b.id
          FROM "Bom" b
          WHERE b."bomRevision" IN (
              SELECT "bomRevision"
              FROM "Bom"
              GROUP BY "bomRevision"
              HAVING COUNT(*) > 1
          )
      )
    `;
    console.log(`   ✓ Migrated ${poUpdate} ProductionOrder records`);

    // Delete duplicate BOMs
    const bomDelete = await prisma.$executeRaw`
      DELETE FROM "Bom"
      WHERE id NOT IN (
          WITH best_boms AS (
              SELECT DISTINCT
                  "bomRevision",
                  FIRST_VALUE(id) OVER (
                      PARTITION BY "bomRevision"
                      ORDER BY
                          CASE
                              WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 1
                              WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 2
                              ELSE 3
                          END,
                          (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = b.id) DESC,
                          (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) DESC,
                          b."createdAt"
                  ) as target_bom_id
              FROM "Bom" b
              WHERE "bomRevision" IN (
                  SELECT "bomRevision"
                  FROM "Bom"
                  GROUP BY "bomRevision"
                  HAVING COUNT(*) > 1
              )
          )
          SELECT target_bom_id FROM best_boms
      )
      AND "bomRevision" IN (
          SELECT "bomRevision"
          FROM "Bom"
          GROUP BY "bomRevision"
          HAVING COUNT(*) > 1
      )
    `;
    console.log(`   ✓ Deleted ${bomDelete} duplicate BOM records\n`);

    // Clean up orphaned BOM items
    const orphanedItems = await prisma.$executeRaw`
      DELETE FROM "BomItem"
      WHERE NOT EXISTS (
          SELECT 1 FROM "Bom" b WHERE b.id = "BomItem"."bomId"
      )
    `;
    console.log(`   ✓ Cleaned up ${orphanedItems} orphaned BomItem records\n`);

    // ===== PART 2: RECIPE DUPLICATE RESOLUTION =====
    console.log("📝 PART 2: Resolving Recipe duplicates...\n");

    const recipeDupsBefore = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (
        SELECT "Recipe"
        FROM "Recipe"
        GROUP BY "Recipe"
        HAVING COUNT(*) > 1
      ) dup
    `;
    console.log(`   Recipe duplicate groups: ${recipeDupsBefore[0].count}`);

    if (recipeDupsBefore[0].count > 0) {
      // Update all tables referencing Recipe
      console.log("\n   Migrating Recipe references...");

      await prisma.$executeRaw`
        UPDATE "Batch"
        SET "recipeId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Batch"."recipeId")
            LIMIT 1
        )
        WHERE "recipeId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated Batch references");

      await prisma.$executeRaw`
        UPDATE "ProductionOrderRecipeInstance"
        SET "recipeId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ProductionOrderRecipeInstance"."recipeId")
            LIMIT 1
        )
        WHERE "recipeId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated ProductionOrderRecipeInstance references");

      await prisma.$executeRaw`
        UPDATE "ProductionOrder"
        SET "recipeId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ProductionOrder"."recipeId")
            LIMIT 1
        )
        WHERE "recipeId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated ProductionOrder references");

      await prisma.$executeRaw`
        UPDATE "Recipe"
        SET "classIdId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Recipe"."classIdId")
            LIMIT 1
        )
        WHERE "classIdId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated Recipe self-references");

      await prisma.$executeRaw`
        UPDATE "ScheduleOrder"
        SET "scheduleOrderRecipeId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "ScheduleOrder"."scheduleOrderRecipeId")
            LIMIT 1
        )
        WHERE "scheduleOrderRecipeId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated ScheduleOrder references");

      // Update many-to-many tables
      await prisma.$executeRaw`
        UPDATE "_RecipeToRecipeBom"
        SET "A" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToRecipeBom"."A")
            LIMIT 1
        )
        WHERE "A" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated _RecipeToRecipeBom join table");

      await prisma.$executeRaw`
        UPDATE "_RecipeToRecipeParameter"
        SET "A" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToRecipeParameter"."A")
            LIMIT 1
        )
        WHERE "A" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated _RecipeToRecipeParameter join table");

      await prisma.$executeRaw`
        UPDATE "_RecipeToUnitProcedure"
        SET "A" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "_RecipeToUnitProcedure"."A")
            LIMIT 1
        )
        WHERE "A" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated _RecipeToUnitProcedure join table");

      await prisma.$executeRaw`
        UPDATE "Comment"
        SET "recipeId" = (
            SELECT FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe" r2
            WHERE r2."Recipe" = (SELECT "Recipe" FROM "Recipe" r3 WHERE r3.id = "Comment"."recipeId")
            LIMIT 1
        )
        WHERE "recipeId" IN (
            SELECT r.id FROM "Recipe" r
            WHERE r."Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
      `;
      console.log("   ✓ Updated Comment references");

      // Delete duplicate Recipes
      const recipeDelete = await prisma.$executeRaw`
        DELETE FROM "Recipe"
        WHERE id NOT IN (
            SELECT DISTINCT
                FIRST_VALUE(id) OVER (PARTITION BY "Recipe" ORDER BY "createdAt" DESC)
            FROM "Recipe"
            WHERE "Recipe" IN (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1)
        )
        AND "Recipe" IN (
            SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1
        )
      `;
      console.log(`\n   ✓ Deleted ${recipeDelete} duplicate Recipe records\n`);
    } else {
      console.log("   ✓ No Recipe duplicates found, skipping...\n");
    }

    // ===== VERIFICATION =====
    console.log("=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\n");

    const bomDupsAfter = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (SELECT "bomRevision" FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1) d
    `;
    console.log(`✓ BOM duplicate groups: ${bomDupsAfter[0].count}`);

    const recipeDupsAfter = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (SELECT "Recipe" FROM "Recipe" GROUP BY "Recipe" HAVING COUNT(*) > 1) d
    `;
    console.log(`✓ Recipe duplicate groups: ${recipeDupsAfter[0].count}`);

    const orphaned = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "BomItem" bi
      WHERE NOT EXISTS (SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId")
    `;
    console.log(`✓ Orphaned BomItems: ${orphaned[0].count}`);

    const summary = await prisma.$queryRaw`
      SELECT
          (SELECT COUNT(*) FROM "Bom") as total_boms,
          (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
          (SELECT COUNT(*) FROM "Recipe") as total_recipes,
          (SELECT COUNT(DISTINCT "Recipe") FROM "Recipe") as unique_recipe_names,
          (SELECT COUNT(*) FROM "BomItem") as total_bom_items
    `;

    console.log("\n📊 Database Summary:");
    console.log(`   Total BOMs: ${summary[0].total_boms}`);
    console.log(`   Unique BOM revisions: ${summary[0].unique_bom_revisions}`);
    console.log(`   Total Recipes: ${summary[0].total_recipes}`);
    console.log(`   Unique Recipe names: ${summary[0].unique_recipe_names}`);
    console.log(`   Total BomItems: ${summary[0].total_bom_items}`);

    console.log("\n" + "=".repeat(70));

    const allClean =
      bomDupsAfter[0].count === 0 &&
      recipeDupsAfter[0].count === 0 &&
      orphaned[0].count === 0;

    if (allClean) {
      console.log(
        "✅ ALL CHECKS PASSED - Comprehensive resolution successful!"
      );
      console.log("\n💾 COMMITTING TRANSACTION...");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ Transaction committed successfully!\n");
      return true;
    } else {
      console.log("⚠️  Some issues remain - Rolling back for safety...");
      await prisma.$executeRaw`ROLLBACK`;
      console.log("🔄 Transaction rolled back\n");
      return false;
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
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

executeComprehensiveResolution().then((success) => {
  process.exit(success ? 0 : 1);
});
