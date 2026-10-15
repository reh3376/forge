import { PrismaClient } from "@prisma/client";

async function checkMillingBinConfigurations() {
  const prisma = new PrismaClient();

  try {
    // Get the milling bin configurations with related item groups and assets
    const configurations = await prisma.millingBinConfiguration.findMany({
      include: {
        itemGroup: true,
        bin: true,
      },
    });

    console.log(`Found ${configurations.length} milling bin configurations:`);

    // Format the output for better readability
    for (const config of configurations) {
      console.log(
        `- Item Group: ${config.itemGroup.name} (${config.itemGroup.description}) → Bin: ${config.bin.name}`
      );
    }
  } catch (error) {
    console.error("Error checking milling bin configurations:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMillingBinConfigurations()
  .then(() => {
    console.log("Check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
  });
