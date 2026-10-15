import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedBinConfigurations() {
  console.log("🌱 Starting Bin Configuration seeding...");

  try {
    // Get the asset IDs for the silos
    const silos = await prisma.asset.findMany({
      where: {
        name: {
          in: ["SIL-110", "SIL-115", "SIL-120"],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    console.log(
      `📦 Found ${silos.length} silos:`,
      silos.map((s) => s.name).join(", ")
    );

    // Get the item group IDs for the grain types
    const grainTypes = await prisma.itemGroup.findMany({
      where: {
        name: {
          in: ["RM-GR-COR", "RM-GR-WHT", "RM-GR-RYE", "RM-GR-BRY"],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    console.log(
      `🌾 Found ${grainTypes.length} grain types:`,
      grainTypes.map((g) => g.name).join(", ")
    );

    // Create bin configurations for each silo-grain combination
    const results: any[] = [];

    for (const silo of silos) {
      for (const grain of grainTypes) {
        try {
          // Check if configuration already exists
          const existing = await prisma.millingBinConfiguration.findFirst({
            where: {
              binId: silo.id,
              itemGroupId: grain.id,
            },
          });

          if (existing) {
            console.log(
              `⚠️  Configuration already exists: ${silo.name} -> ${grain.name}`
            );
            results.push(existing);
          } else {
            // Create new configuration
            const result = await prisma.millingBinConfiguration.create({
              data: {
                binId: silo.id,
                itemGroupId: grain.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            results.push(result);
            console.log(`✅ Created: ${silo.name} -> ${grain.name}`);
          }
        } catch (error) {
          console.error(
            `❌ Failed to create configuration for ${silo.name} -> ${grain.name}:`,
            error
          );
        }
      }
    }

    console.log(
      `🎉 Successfully processed ${results.length} bin configurations!`
    );

    // Verify the results
    const totalConfigurations = await prisma.millingBinConfiguration.count();
    console.log(
      `📊 Total bin configurations in database: ${totalConfigurations}`
    );

    // Show summary by silo
    const summary = await prisma.millingBinConfiguration.findMany({
      include: {
        bin: {
          select: {
            name: true,
          },
        },
        itemGroup: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ bin: { name: "asc" } }, { itemGroup: { name: "asc" } }],
    });

    console.log("\n📋 Configuration Summary:");
    const groupedBySilo = summary.reduce((acc, config) => {
      const siloName = config.bin.name;
      if (!acc[siloName]) acc[siloName] = [];
      acc[siloName].push(config.itemGroup.name);
      return acc;
    }, {} as Record<string, string[]>);

    Object.entries(groupedBySilo).forEach(([silo, grains]) => {
      console.log(`  ${silo}: ${grains.join(", ")}`);
    });
  } catch (error) {
    console.error("❌ Error seeding bin configurations:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding function
if (require.main === module) {
  seedBinConfigurations()
    .then(() => {
      console.log("✅ Bin configuration seeding completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Bin configuration seeding failed:", error);
      process.exit(1);
    });
}

export default seedBinConfigurations;
