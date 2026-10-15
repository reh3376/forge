const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function smartDuplicateResolution() {
  try {
    console.log("\n🔧 SMART COMPREHENSIVE DUPLICATE RESOLUTION\n");
    console.log("=".repeat(70));

    await prisma.$executeRaw`BEGIN`;
    console.log("⏰ Started at:", new Date().toISOString());
    console.log("✓ Transaction started\n");

    // ===== PART 1: Identify duplicate groups (with and without RUN# prefix) =====
    console.log("📝 PART 1: Identifying duplicate groups...\n");

    // Find all BOMs that will become duplicates after stripping RUN#
    const duplicateGroups = await prisma.$queryRawUnsafe(`
      SELECT
        REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g') as target_revision,
        ARRAY_AGG(id ORDER BY
          CASE
            WHEN "bomRevision" NOT LIKE 'RUN%' THEN 1  -- Prefer existing non-RUN BOMs
            WHEN "erpId" IS NOT NULL AND "erpId" ~ '^[0-9]+$' THEN 2
            WHEN "erpId" IS NOT NULL AND "erpId" LIKE '-%' THEN 3
            ELSE 4
          END,
          (SELECT COUNT(*) FROM "BomItem" WHERE "bomId" = "Bom".id) DESC,
          "createdAt"
        ) as bom_ids
      FROM "Bom"
      WHERE "bomRevision" LIKE '%BOM-%'  -- Only consider actual BOMs
      GROUP BY target_revision
      HAVING COUNT(*) > 1 OR (COUNT(*) = 1 AND MIN("bomRevision") LIKE 'RUN%')
    `);

    console.log(
      `   Found ${duplicateGroups.length} BOM groups to consolidate\n`
    );

    if (duplicateGroups.length === 0) {
      console.log("   ✓ No duplicate groups found, skipping consolidation\n");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ No changes needed\n");
      await prisma.$disconnect();
      return true;
    }

    // Show some examples
    console.log("   Examples:");
    duplicateGroups.slice(0, 5).forEach((g) => {
      console.log(
        `     ${g.target_revision}: ${g.bom_ids.length} BOMs to consolidate`
      );
    });
    console.log("");

    // ===== PART 2: Migrate BomItems and ProductionOrders to the best BOM in each group =====
    console.log("📝 PART 2: Migrating BomItems and ProductionOrders...\n");

    let totalBomItemsMigrated = 0;
    let totalProductionOrdersMigrated = 0;

    for (const group of duplicateGroups) {
      const targetBomId = group.bom_ids[0]; // First ID is the "best" one
      const sourceBomIds = group.bom_ids.slice(1); // Rest are duplicates to merge

      if (sourceBomIds.length === 0) {
        // Only one BOM, just need to strip RUN# prefix if needed
        continue;
      }

      // Migrate BomItems
      const bomItemResult = await prisma.$executeRawUnsafe(
        `
        UPDATE "BomItem"
        SET "bomId" = $1
        WHERE "bomId" = ANY($2::text[])
      `,
        targetBomId,
        sourceBomIds
      );
      totalBomItemsMigrated += bomItemResult;

      // Migrate ProductionOrders
      const poResult = await prisma.$executeRawUnsafe(
        `
        UPDATE "ProductionOrder"
        SET "bomId" = $1
        WHERE "bomId" = ANY($2::text[])
      `,
        targetBomId,
        sourceBomIds
      );
      totalProductionOrdersMigrated += poResult;
    }

    console.log(`   ✓ Migrated ${totalBomItemsMigrated} BomItem records`);
    console.log(
      `   ✓ Migrated ${totalProductionOrdersMigrated} ProductionOrder records\n`
    );

    // ===== PART 3: Delete duplicate BOMs =====
    console.log("📝 PART 3: Deleting duplicate BOMs...\n");

    const allTargetIds = duplicateGroups.map((g) => g.bom_ids[0]);
    const allSourceIds = duplicateGroups.flatMap((g) => g.bom_ids.slice(1));

    let deletedCount = 0;
    if (allSourceIds.length > 0) {
      deletedCount = await prisma.$executeRawUnsafe(
        `
        DELETE FROM "Bom"
        WHERE id = ANY($1::text[])
      `,
        allSourceIds
      );
    }

    console.log(`   ✓ Deleted ${deletedCount} duplicate BOM records\n`);

    // ===== PART 4: Strip RUN# prefixes from the remaining BOMs =====
    console.log(
      "📝 PART 4: Stripping RUN# prefixes from consolidated BOMs...\n"
    );

    const runPrefixStripped = await prisma.$executeRaw`
      UPDATE "Bom"
      SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g')
      WHERE "bomRevision" LIKE 'RUN%'
    `;

    console.log(`   ✓ Stripped RUN# prefixes from ${runPrefixStripped} BOMs\n`);

    // ===== PART 5: Clean up negative BOM names and other data quality issues =====
    console.log("📝 PART 5: Cleaning up data quality issues...\n");

    await prisma.$executeRaw`
      UPDATE "Bom"
      SET "bomName" = SUBSTRING("bomName", 2)
      WHERE "bomName" LIKE '-%'
    `;
    console.log("   ✓ Fixed negative BOM names");

    // Clean up orphaned BomItems
    const orphanedCleanup = await prisma.$executeRaw`
      DELETE FROM "BomItem"
      WHERE NOT EXISTS (SELECT 1 FROM "Bom" b WHERE b.id = "BomItem"."bomId")
    `;
    console.log(`   ✓ Cleaned up ${orphanedCleanup} orphaned BomItems`);

    // Note: Skipping Recipe RUN# stripping for now - would need same consolidation logic
    // await prisma.$executeRaw`
    //   UPDATE "Recipe"
    //   SET "Recipe" = REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g')
    //   WHERE "Recipe" LIKE 'RUN%'
    // `;
    console.log(
      "   ⏭️  Skipping Recipe RUN# stripping (would need consolidation)\n"
    );

    // ===== VERIFICATION =====
    console.log("=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\n");

    const bomDups = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (SELECT "bomRevision" FROM "Bom" GROUP BY "bomRevision" HAVING COUNT(*) > 1) d
    `;
    console.log(`✓ BOM duplicate groups: ${bomDups[0].count}`);

    const runPrefixes = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
    `;
    console.log(`✓ BOMs with RUN# prefixes: ${runPrefixes[0].count}`);

    const negNames = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Bom" WHERE "bomName" LIKE '-%'
    `;
    console.log(`✓ Negative BOM names: ${negNames[0].count}`);

    const orphaned = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "BomItem" bi
      WHERE NOT EXISTS (SELECT 1 FROM "Bom" b WHERE b.id = bi."bomId")
    `;
    console.log(`✓ Orphaned BomItems: ${orphaned[0].count}`);

    const summary = await prisma.$queryRaw`
      SELECT
          (SELECT COUNT(*) FROM "Bom") as total_boms,
          (SELECT COUNT(DISTINCT "bomRevision") FROM "Bom") as unique_bom_revisions,
          (SELECT COUNT(*) FROM "BomItem") as total_bom_items
    `;

    console.log("\n📊 Database Summary:");
    console.log(`   Total BOMs: ${summary[0].total_boms}`);
    console.log(`   Unique BOM revisions: ${summary[0].unique_bom_revisions}`);
    console.log(`   Total BomItems: ${summary[0].total_bom_items}`);

    console.log("\n" + "=".repeat(70));

    const allClean =
      Number(bomDups[0].count) === 0 &&
      Number(runPrefixes[0].count) === 0 &&
      Number(negNames[0].count) === 0 &&
      Number(orphaned[0].count) === 0;

    if (allClean) {
      console.log("✅ ALL CHECKS PASSED - Smart resolution successful!");
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

smartDuplicateResolution().then((success) => {
  process.exit(success ? 0 : 1);
});
