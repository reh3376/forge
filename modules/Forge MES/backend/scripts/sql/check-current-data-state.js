const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkDataState() {
  try {
    console.log("\n📊 DATABASE STATE CHECK\n");
    console.log("=".repeat(70));

    // Check for duplicate BOM revisions
    console.log("\n🔍 CHECKING FOR BOM DUPLICATES...");
    const bomDuplicates = await prisma.$queryRawUnsafe(`
      SELECT "bomRevision", COUNT(*) as count,
             ARRAY_AGG(id) as bom_ids,
             ARRAY_AGG("bomName") as bom_names,
             ARRAY_AGG("erpId") as erp_ids
      FROM "Bom"
      GROUP BY "bomRevision"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    if (bomDuplicates.length > 0) {
      console.log(
        `\n⚠️  Found ${bomDuplicates.length} duplicate BOM revision groups:\n`
      );
      bomDuplicates.forEach((dup, idx) => {
        console.log(
          `${idx + 1}. bomRevision: "${dup.bomRevision}" (${
            dup.count
          } duplicates)`
        );
        console.log(`   IDs: ${dup.bom_ids.join(", ")}`);
        console.log(`   Names: ${dup.bom_names.join(", ")}`);
        console.log(`   ERP IDs: ${dup.erp_ids.join(", ")}`);
        console.log("");
      });
    } else {
      console.log("✅ No duplicate BOM revisions found");
    }

    // Check for duplicate Recipe names
    console.log("\n🔍 CHECKING FOR RECIPE DUPLICATES...");
    const recipeDuplicates = await prisma.$queryRawUnsafe(`
      SELECT "Recipe" as recipe_name, COUNT(*) as count,
             ARRAY_AGG(id) as recipe_ids
      FROM "Recipe"
      GROUP BY "Recipe"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    if (recipeDuplicates.length > 0) {
      console.log(
        `\n⚠️  Found ${recipeDuplicates.length} duplicate Recipe name groups:\n`
      );
      recipeDuplicates.forEach((dup, idx) => {
        console.log(
          `${idx + 1}. Recipe: "${dup.recipe_name}" (${dup.count} duplicates)`
        );
        console.log(`   IDs: ${dup.recipe_ids.join(", ")}`);
        console.log("");
      });
    } else {
      console.log("✅ No duplicate Recipe names found");
    }

    // Check for data quality issues
    console.log("\n🔍 CHECKING FOR DATA QUALITY ISSUES...");

    const tempPrefixBoms = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "Bom"
      WHERE "bomName" LIKE 'TEMP_%' OR "erpId" LIKE 'TEMP_%'
    `);
    console.log(`   TEMP_ prefixes: ${tempPrefixBoms[0].count} BOMs`);

    const runPrefixBoms = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "Bom"
      WHERE "bomRevision" LIKE 'RUN%-%'
    `);
    console.log(`   RUN# prefixes: ${runPrefixBoms[0].count} BOMs`);

    const deleteMarkerBoms = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "Bom"
      WHERE "bomName" LIKE '%-DELETE%' OR "bomName" LIKE '%-DEL%'
    `);
    console.log(`   DELETE markers: ${deleteMarkerBoms[0].count} BOMs`);

    const negativeBomNames = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "Bom"
      WHERE "bomName" ~ '^-[0-9]+$'
    `);
    console.log(
      `   Negative names (e.g., -9, -8): ${negativeBomNames[0].count} BOMs`
    );

    // Check ProductionOrder and ScheduleOrder naming
    console.log("\n🔍 CHECKING ORDER NAMES...");

    const productionOrdersNoName = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "ProductionOrder"
      WHERE "name" IS NULL OR "name" = ''
    `);
    console.log(
      `   ProductionOrders without names: ${productionOrdersNoName[0].count}`
    );

    const scheduleOrdersNoName = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM "ScheduleOrder"
      WHERE "name" IS NULL OR "name" = ''
    `);
    console.log(
      `   ScheduleOrders without names: ${scheduleOrdersNoName[0].count}`
    );

    // Total counts
    console.log("\n📈 TOTAL RECORD COUNTS:");
    const bomCount = await prisma.bom.count();
    console.log(`   Bom: ${bomCount}`);

    const bomItemCount = await prisma.bomItem.count();
    console.log(`   BomItem: ${bomItemCount}`);

    const recipeCount = await prisma.recipe.count();
    console.log(`   Recipe: ${recipeCount}`);

    const productionOrderCount = await prisma.productionOrder.count();
    console.log(`   ProductionOrder: ${productionOrderCount}`);

    const scheduleOrderCount = await prisma.scheduleOrder.count();
    console.log(`   ScheduleOrder: ${scheduleOrderCount}`);

    console.log("\n" + "=".repeat(70));
    console.log("✅ Data state check complete\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDataState();
