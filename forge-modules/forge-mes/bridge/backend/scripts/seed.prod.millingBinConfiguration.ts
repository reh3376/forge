import { PrismaClient } from "@prisma/client";

export async function seedMillingBinConfiguration(client?: PrismaClient) {
  const prisma = client || new PrismaClient();
  const shouldDisconnect = !client; // Only disconnect if we created a new client

  try {
    console.log("Starting to seed milling bin configurations...");

    // Item groups for main grain types
    const itemGroups = [
      "RM-GR-COR", // Corn
      "RM-GR-RYE", // Rye
      "RM-GR-BRY", // Barley
      "RM-GR-WHT", // Wheat
    ];

    // Get the actual item groups from the database
    const existingItemGroups = await prisma.itemGroup.findMany({
      where: {
        name: {
          in: itemGroups,
        },
      },
    });

    console.log(`Found ${existingItemGroups.length} item groups`);

    // If we don't have all the required item groups, log an error
    if (existingItemGroups.length < itemGroups.length) {
      console.error("Not all required item groups found in the database");
      console.log(
        "Found item groups:",
        existingItemGroups.map((ig) => ig.name)
      );
      console.log(
        "Missing item groups:",
        itemGroups.filter(
          (ig) => !existingItemGroups.find((eig) => eig.name === ig)
        )
      );
    }

    // Get the specific silo assets
    const siloNames = ["SIL-110", "SIL-115", "SIL-120"];
    const siloAssets = await prisma.asset.findMany({
      where: {
        name: {
          in: siloNames,
        },
      },
    });

    console.log(`Found ${siloAssets.length} silo assets`);

    if (siloAssets.length === 0) {
      console.error("No silo assets found in the database");
      return;
    }

    if (siloAssets.length < siloNames.length) {
      console.warn(
        `Only found ${siloAssets.length} of ${siloNames.length} silo assets`
      );
      console.log(
        "Found silos:",
        siloAssets.map((silo) => silo.name)
      );
      console.log(
        "Missing silos:",
        siloNames.filter(
          (name) => !siloAssets.find((silo) => silo.name === name)
        )
      );
    }

    // Clear existing configurations
    await prisma.millingBinConfiguration.deleteMany({});

    // Create configurations matching item groups with silos
    // Specific mapping of item groups to silo assets
    const configurations: Array<{ itemGroupId: string; binId: string }> = [];

    // First attempt a specific matching if all required assets are available
    if (siloAssets.length >= 3 && existingItemGroups.length >= 3) {
      // Get references to specific silos
      const silo110 = siloAssets.find((silo) => silo.name === "SIL-110");
      const silo115 = siloAssets.find((silo) => silo.name === "SIL-115");
      const silo120 = siloAssets.find((silo) => silo.name === "SIL-120");

      // Get references to specific item groups
      const cornGroup = existingItemGroups.find(
        (ig) => ig.name === "RM-GR-COR"
      );
      const ryeGroup = existingItemGroups.find((ig) => ig.name === "RM-GR-RYE");
      const barleyGroup = existingItemGroups.find(
        (ig) => ig.name === "RM-GR-BRY"
      );
      const wheatGroup = existingItemGroups.find(
        (ig) => ig.name === "RM-GR-WHT"
      );

      // Add specific configurations
      if (cornGroup && silo110) {
        configurations.push({
          itemGroupId: cornGroup.id,
          binId: silo110.id,
        });
      }

      if (ryeGroup && silo115) {
        configurations.push({
          itemGroupId: ryeGroup.id,
          binId: silo115.id,
        });
      }

      if (wheatGroup && silo120) {
        configurations.push({
          itemGroupId: wheatGroup.id,
          binId: silo120.id,
        });
      }

      // If we have barley and any remaining silo, use it
      if (barleyGroup) {
        const unusedSilo = siloAssets.find(
          (silo) => !configurations.some((config) => config.binId === silo.id)
        );

        if (unusedSilo) {
          configurations.push({
            itemGroupId: barleyGroup.id,
            binId: unusedSilo.id,
          });
        } else if (siloAssets.length > 0) {
          // If all silos are used, just use the first one for barley too
          configurations.push({
            itemGroupId: barleyGroup.id,
            binId: siloAssets[0].id,
          });
        }
      }
    }

    // Fallback: if specific mapping didn't fully work, do a generic mapping for any remaining item groups
    if (configurations.length < existingItemGroups.length) {
      const configuredGroupIds = configurations.map((c) => c.itemGroupId);
      const unconfiguredGroups = existingItemGroups.filter(
        (ig) => !configuredGroupIds.includes(ig.id)
      );

      for (const group of unconfiguredGroups) {
        // Find a silo that's not fully utilized yet
        const siloUsageCounts: Record<string, number> = {};
        configurations.forEach((c) => {
          siloUsageCounts[c.binId] = (siloUsageCounts[c.binId] || 0) + 1;
        });

        // Find the least used silo
        let leastUsedSilo = siloAssets[0];
        let lowestUsage = Number.MAX_SAFE_INTEGER;

        for (const silo of siloAssets) {
          const usage = siloUsageCounts[silo.id] || 0;
          if (usage < lowestUsage) {
            lowestUsage = usage;
            leastUsedSilo = silo;
          }
        }

        if (leastUsedSilo) {
          configurations.push({
            itemGroupId: group.id,
            binId: leastUsedSilo.id,
          });
        }
      }
    }

    // Create the configurations in the database
    for (const config of configurations) {
      await prisma.millingBinConfiguration.create({
        data: config,
      });

      const itemGroup = existingItemGroups.find(
        (ig) => ig.id === config.itemGroupId
      );
      const silo = siloAssets.find((s) => s.id === config.binId);

      console.log(
        `Created configuration for item group ${itemGroup?.name} with silo ${silo?.name}`
      );
    }

    console.log("Milling bin configuration seeding completed successfully");
  } catch (error) {
    console.error("Error seeding milling bin configurations:", error);
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

// This allows the script to be run directly
if (require.main === module) {
  seedMillingBinConfiguration()
    .then(() => {
      console.log("Seed script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed script failed:", error);
      process.exit(1);
    });
}
