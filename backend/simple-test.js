const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testDatabase() {
  try {
    console.log("🧪 Testing Database Connection and Basic Data\n");

    // Test basic counts
    console.log("📊 CURRENT DATABASE STATE:");

    const mashingProtocolCount = await prisma.mashingProtocol.count();
    console.log(`  • Mashing Protocols: ${mashingProtocolCount}`);

    const mashingStepCount = await prisma.mashingProtocolStep.count();
    console.log(`  • Mashing Protocol Steps: ${mashingStepCount}`);

    const itemCount = await prisma.item.count();
    console.log(`  • Items: ${itemCount}`);

    const recipeCount = await prisma.recipe.count();
    console.log(`  • Recipes: ${recipeCount}`);

    const vendorCount = await prisma.vendor.count();
    console.log(`  • Vendors: ${vendorCount}`);

    const customerCount = await prisma.customer.count();
    console.log(`  • Customers: ${customerCount}`);

    // Test our seeded mashing protocols
    console.log("\n🥃 MASHING PROTOCOLS:");
    const protocols = await prisma.mashingProtocol.findMany({
      where: { master: true },
      take: 3,
    });

    protocols.forEach((protocol) => {
      console.log(`  • ${protocol.name} (Master: ${protocol.master})`);
    });

    // Test steps for one protocol
    if (protocols.length > 0) {
      const steps = await prisma.mashingProtocolStep.findMany({
        where: { mashingProtocolId: protocols[0].id },
        orderBy: { index: "asc" },
        take: 3,
      });

      console.log(`\n🔧 STEPS FOR ${protocols[0].name}:`);
      steps.forEach((step) => {
        console.log(
          `  • Step ${step.index}: ${step.stepType} at ${step.temperatureSetpoint}°F`
        );
      });
    }

    console.log("\n✅ Database test completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
