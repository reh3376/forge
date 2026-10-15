const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function executeCleanup() {
  try {
    console.log("\n🧹 STARTING DATA CLEANUP (SCRIPT 04)\n");
    console.log("=".repeat(70));

    // Start transaction
    await prisma.$executeRaw`BEGIN`;

    console.log("\n⏰ Started at:", new Date().toISOString());

    // 1. Fix TEMP_ ERP IDs in Bom
    console.log("\n📝 Step 1: Fixing TEMP_ ERP IDs in Bom...");

    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = '6' WHERE "erpId" = 'TEMP_18'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = '7' WHERE "erpId" = 'TEMP_19'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = '8' WHERE "erpId" = 'TEMP_21'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = '9' WHERE "erpId" = 'TEMP_25'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = '10' WHERE "erpId" = 'TEMP_26'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "erpId" = SUBSTRING("erpId", 6) WHERE "erpId" LIKE 'TEMP_%'`;

    const tempBomCount =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'`;
    console.log(
      `   ✓ Fixed Bom TEMP_ erpIds (${tempBomCount[0].count} remaining)`
    );

    // Fix Item TEMP_ erpIds
    await prisma.$executeRaw`UPDATE "Item" SET "erpId" = CAST((10000 + CAST(SUBSTRING("erpId", 6) AS INTEGER)) AS TEXT) WHERE "erpId" LIKE 'TEMP_%'`;
    const tempItemCount =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Item" WHERE "erpId" LIKE 'TEMP_%'`;
    console.log(
      `   ✓ Fixed Item TEMP_ erpIds (${tempItemCount[0].count} remaining)`
    );

    // Fix Vendor TEMP_ erpIds
    await prisma.$executeRaw`UPDATE "Vendor" SET "erpId" = SUBSTRING("erpId", 6) WHERE "erpId" LIKE 'TEMP_%'`;
    const tempVendorCount =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%'`;
    console.log(
      `   ✓ Fixed Vendor TEMP_ erpIds (${tempVendorCount[0].count} remaining)`
    );

    // 2. Fix RUN# prefixes in BOM revisions
    console.log("\n📝 Step 2: Fixing RUN# prefixes in BOM revisions...");

    const runBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'`;
    console.log(`   Before: ${runBefore[0].count} BOMs with RUN# prefixes`);

    await prisma.$executeRaw`UPDATE "Bom" SET "bomRevision" = REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g') WHERE "bomRevision" LIKE 'RUN%'`;

    const runAfter =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'`;
    console.log(`   ✓ Fixed (${runAfter[0].count} remaining)`);

    // 3. Fix DELETE/DEL markers in BOM revisions
    console.log("\n📝 Step 3: Fixing DELETE markers in BOM revisions...");

    await prisma.$executeRaw`UPDATE "Bom" SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DEL$', '', 'g') WHERE "bomRevision" LIKE '%-DEL'`;
    await prisma.$executeRaw`UPDATE "Bom" SET "bomRevision" = REGEXP_REPLACE("bomRevision", '-DELETE$', '', 'g') WHERE "bomRevision" LIKE '%-DELETE'`;

    const delCount =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE '%-DEL%'`;
    console.log(`   ✓ Fixed DELETE markers (${delCount[0].count} remaining)`);

    // 4. Fix negative BOM names
    console.log("\n📝 Step 4: Fixing negative BOM names...");

    const negBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomName" LIKE '-%'`;
    console.log(`   Before: ${negBefore[0].count} negative BOM names`);

    await prisma.$executeRaw`UPDATE "Bom" SET "bomName" = SUBSTRING("bomName", 2) WHERE "bomName" LIKE '-%'`;

    const negAfter =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Bom" WHERE "bomName" LIKE '-%'`;
    console.log(`   ✓ Fixed (${negAfter[0].count} remaining)`);

    // 5. Fix RUN# prefixes in Recipe names
    console.log("\n📝 Step 5: Fixing RUN# prefixes in Recipe names...");

    const recipeRunBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE 'RUN%'`;
    console.log(
      `   Before: ${recipeRunBefore[0].count} Recipes with RUN# prefixes`
    );

    await prisma.$executeRaw`UPDATE "Recipe" SET "recipeName" = REGEXP_REPLACE("recipeName", '^RUN[0-9]+-', '', 'g') WHERE "recipeName" LIKE 'RUN%'`;

    const recipeRunAfter =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE 'RUN%'`;
    console.log(`   ✓ Fixed (${recipeRunAfter[0].count} remaining)`);

    // 6. Fix DELETE markers in Recipe names
    console.log("\n📝 Step 6: Fixing DELETE markers in Recipe names...");

    await prisma.$executeRaw`UPDATE "Recipe" SET "recipeName" = REGEXP_REPLACE("recipeName", '-DEL$', '', 'g') WHERE "recipeName" LIKE '%-DEL'`;
    await prisma.$executeRaw`UPDATE "Recipe" SET "recipeName" = REGEXP_REPLACE("recipeName", '-DELETE$', '', 'g') WHERE "recipeName" LIKE '%-DELETE'`;

    const recipeDelCount =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE '%-DEL%'`;
    console.log(
      `   ✓ Fixed DELETE markers (${recipeDelCount[0].count} remaining)`
    );

    // 7. Fix empty item names
    console.log("\n📝 Step 7: Fixing empty item names...");

    const emptyItemsBefore =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' '`;
    console.log(`   Before: ${emptyItemsBefore[0].count} empty item names`);

    await prisma.$executeRaw`
      UPDATE "Item"
      SET "itemName" = CASE
          WHEN "itemNumber" IS NOT NULL AND "itemNumber" <> '' THEN "itemNumber"
          WHEN "erpId" IS NOT NULL AND "erpId" <> '' THEN CONCAT('Item_', "erpId")
          ELSE CONCAT('Unnamed_Item_', id)
      END
      WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' '
    `;

    const emptyItemsAfter =
      await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' '`;
    console.log(`   ✓ Fixed (${emptyItemsAfter[0].count} remaining)`);

    // FINAL VERIFICATION
    console.log("\n" + "=".repeat(70));
    console.log("🔍 FINAL VERIFICATION\n");

    const checks = [
      {
        name: "TEMP_ erpIds in Bom",
        query: `SELECT COUNT(*) as count FROM "Bom" WHERE "erpId" LIKE 'TEMP_%'`,
      },
      {
        name: "TEMP_ erpIds in Item",
        query: `SELECT COUNT(*) as count FROM "Item" WHERE "erpId" LIKE 'TEMP_%'`,
      },
      {
        name: "TEMP_ erpIds in Vendor",
        query: `SELECT COUNT(*) as count FROM "Vendor" WHERE "erpId" LIKE 'TEMP_%'`,
      },
      {
        name: "RUN# prefixes in BOM revisions",
        query: `SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'`,
      },
      {
        name: "RUN# prefixes in Recipe names",
        query: `SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE 'RUN%'`,
      },
      {
        name: "DELETE markers in BOM revisions",
        query: `SELECT COUNT(*) as count FROM "Bom" WHERE "bomRevision" LIKE '%-DEL%'`,
      },
      {
        name: "DELETE markers in Recipe names",
        query: `SELECT COUNT(*) as count FROM "Recipe" WHERE "recipeName" LIKE '%-DEL%'`,
      },
      {
        name: "Negative BOM names",
        query: `SELECT COUNT(*) as count FROM "Bom" WHERE "bomName" LIKE '-%'`,
      },
      {
        name: "Empty item names",
        query: `SELECT COUNT(*) as count FROM "Item" WHERE "itemName" IS NULL OR "itemName" = '' OR "itemName" = ' '`,
      },
    ];

    let allClean = true;
    for (const check of checks) {
      const result = await prisma.$queryRawUnsafe(check.query);
      const count = result[0].count;
      const status = count === 0 ? "✅" : "⚠️";
      console.log(`${status} ${check.name}: ${count}`);
      if (count > 0) allClean = false;
    }

    console.log("\n" + "=".repeat(70));

    if (allClean) {
      console.log("✅ ALL CHECKS PASSED - Data cleanup successful!");
      console.log("\n💾 COMMITTING TRANSACTION...");
      await prisma.$executeRaw`COMMIT`;
      console.log("✅ Transaction committed successfully!\n");
    } else {
      console.log("⚠️  Some issues remain - Review results above");
      console.log("\nYou can manually COMMIT or ROLLBACK");
      console.log("Rolling back for safety...");
      await prisma.$executeRaw`ROLLBACK`;
      console.log("🔄 Transaction rolled back\n");
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
  } finally {
    await prisma.$disconnect();
  }
}

executeCleanup();
