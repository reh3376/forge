const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testSeedData() {
  try {
    console.log("🧪 Testing Seed Data and Foreign Key Relationships\n");

    // Test 1: Check Mashing Protocols
    const mashingProtocols = await prisma.mashingProtocol.findMany({
      where: { master: true },
      include: {
        MashingProtocolStep: {
          orderBy: { index: "asc" },
          take: 3, // Just show first 3 steps
        },
      },
    });

    console.log("📋 MASHING PROTOCOLS:");
    mashingProtocols.forEach((protocol) => {
      console.log(
        `  • ${protocol.name} (${protocol.MashingProtocolStep.length} steps)`
      );
      protocol.MashingProtocolStep.forEach((step) => {
        console.log(
          `    - Step ${step.index}: ${step.stepType} at ${step.temperatureSetpoint}°F for ${step.stepTime}min`
        );
      });
    });

    // Test 2: Check Items
    const items = await prisma.item.findMany({
      where: { active: true },
      include: {
        Vendor: true,
      },
      take: 5,
    });

    console.log("\n📦 ITEMS:");
    items.forEach((item) => {
      console.log(
        `  • ${item.itemName} (${item.itemType}) - Vendor: ${
          item.Vendor?.name || "None"
        }`
      );
    });

    // Test 3: Check Recipe BOM Items with their steps
    const recipeBomItems = await prisma.recipeBomItem.findMany({
      include: {
        Item: true,
        RecipeBom: true,
        MashingProtocolStep: true,
      },
      take: 5,
    });

    console.log("\n🥃 RECIPE BOM ITEMS & MASHING STEP LINKS:");
    recipeBomItems.forEach((bomItem) => {
      console.log(
        `  • ${bomItem.Item?.itemName || "Unknown Item"} - ${
          bomItem.quantity
        } ${bomItem.units}`
      );
      console.log(`    Operation: ${bomItem.operation}`);
      if (bomItem.MashingProtocolStep.length > 0) {
        bomItem.MashingProtocolStep.forEach((step) => {
          console.log(`    → Linked to Step ${step.index}: ${step.stepType}`);
        });
      }
    });

    // Test 4: Check Production Orders and Schedule Orders
    const productionOrders = await prisma.productionOrder.findMany({
      include: {
        Customer: true,
        Item: true,
        Recipe: true,
        ScheduleOrder: true,
      },
      take: 3,
    });

    console.log("\n📅 PRODUCTION ORDERS:");
    productionOrders.forEach((po) => {
      console.log(`  • ${po.name}`);
      console.log(`    Customer: ${po.Customer?.name}`);
      console.log(`    Product: ${po.Item?.itemName}`);
      console.log(`    Recipe: ${po.Recipe?.Recipe || "None"}`);
      console.log(`    Schedule Order: ${po.ScheduleOrder?.name || "None"}`);
      console.log(`    Status: ${po.status}`);
    });

    // Test 5: Foreign Key Integrity Check
    console.log("\n🔗 FOREIGN KEY INTEGRITY CHECKS:");

    // Check Recipe-MashingProtocol links
    const recipesWithProtocols = await prisma.recipe.count({
      where: {
        mashingProtocolId: { not: null },
      },
    });
    console.log(
      `  ✓ Recipes linked to Mashing Protocols: ${recipesWithProtocols}`
    );

    // Check Item-Vendor links
    const itemsWithVendors = await prisma.item.count({
      where: {
        vendorId: { not: null },
      },
    });
    console.log(`  ✓ Items linked to Vendors: ${itemsWithVendors}`);

    // Check ProductionOrder-Customer links
    const poWithCustomers = await prisma.productionOrder.count({
      where: {
        customerId: { not: null },
      },
    });
    console.log(
      `  ✓ Production Orders linked to Customers: ${poWithCustomers}`
    );

    // Test 6: Count key entities
    console.log("\n📊 ENTITY COUNTS:");
    const counts = await Promise.all([
      prisma.mashingProtocol.count({ where: { master: true } }),
      prisma.mashingProtocolStep.count(),
      prisma.item.count({ where: { active: true } }),
      prisma.recipe.count({ where: { active: true } }),
      prisma.recipeBomItem.count(),
      prisma.vendor.count(),
      prisma.customer.count(),
      prisma.productionOrder.count(),
      prisma.scheduleOrder.count(),
    ]);

    const [
      mashingProtocolCount,
      mashingStepCount,
      itemCount,
      recipeCount,
      bomItemCount,
      vendorCount,
      customerCount,
      productionOrderCount,
      scheduleOrderCount,
    ] = counts;

    console.log(`  • Mashing Protocols: ${mashingProtocolCount}`);
    console.log(`  • Mashing Steps: ${mashingStepCount}`);
    console.log(`  • Items: ${itemCount}`);
    console.log(`  • Recipes: ${recipeCount}`);
    console.log(`  • Recipe BOM Items: ${bomItemCount}`);
    console.log(`  • Vendors: ${vendorCount}`);
    console.log(`  • Customers: ${customerCount}`);
    console.log(`  • Production Orders: ${productionOrderCount}`);
    console.log(`  • Schedule Orders: ${scheduleOrderCount}`);

    console.log("\n✅ Seed Data Test Completed Successfully!");
  } catch (error) {
    console.error("❌ Error testing seed data:", error);
    console.error("Details:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSeedData();
