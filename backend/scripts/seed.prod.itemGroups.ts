import { PrismaClient } from "@prisma/client";

export async function seedItemGroups(client?: PrismaClient) {
  const prisma = client || new PrismaClient();
  const shouldDisconnect = !client; // Only disconnect if we created a new client

  try {
    console.log("Starting to seed item groups...");

    // Define the item groups we need (based on actual usage in Items table)
    const requiredItemGroups = [
      // Grain item groups
      {
        name: "RM-GR-COR",
        description: "Corn - Raw Material Grain",
      },
      {
        name: "RM-GR-RYE",
        description: "Rye - Raw Material Grain",
      },
      {
        name: "RM-GR-BRY",
        description: "Barley - Raw Material Grain",
      },
      {
        name: "RM-GR-WHT",
        description: "Wheat - Raw Material Grain",
      },

      // Raw Material item groups
      {
        name: "RM-ENZ",
        description: "Enzymes - Raw Material",
      },
      {
        name: "RM-YEA",
        description: "Yeast - Raw Material",
      },
      {
        name: "RM-BBL",
        description: "Barrels - Raw Material",
      },

      // Component item groups
      {
        name: "CP-BBL",
        description: "Component Barrels",
      },

      // Finished Goods item groups
      {
        name: "FG-BBL",
        description: "Filled Barrels - Finished Goods",
      },
      {
        name: "FG-SST",
        description: "Filled Stainless Steel Totes - Finished Goods",
      },
      {
        name: "FG-IBC",
        description: "Filled IBC Containers - Finished Goods",
      },
      {
        name: "FG-DRM",
        description: "Filled Drums - Finished Goods",
      },
    ];

    // Check which ones already exist
    const existingItemGroups = await prisma.itemGroup.findMany({
      where: {
        name: {
          in: requiredItemGroups.map((ig) => ig.name),
        },
      },
    });

    console.log(`Found ${existingItemGroups.length} existing item groups`);

    // Create missing item groups
    for (const itemGroup of requiredItemGroups) {
      const exists = existingItemGroups.some(
        (eg) => eg.name === itemGroup.name
      );

      if (!exists) {
        await prisma.itemGroup.create({
          data: itemGroup,
        });
        console.log(`Created item group: ${itemGroup.name}`);
      } else {
        // Update existing item group if the description is different
        const existing = existingItemGroups.find(
          (eg) => eg.name === itemGroup.name
        );
        if (existing && existing.description !== itemGroup.description) {
          await prisma.itemGroup.update({
            where: { id: existing.id },
            data: { description: itemGroup.description },
          });
          console.log(`Updated item group description: ${itemGroup.name}`);
        } else {
          console.log(`Item group ${itemGroup.name} already exists, skipping.`);
        }
      }
    }

    console.log("Item groups seeding completed successfully");
  } catch (error) {
    console.error("Error seeding item groups:", error);
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

// This allows the script to be run directly
if (require.main === module) {
  seedItemGroups()
    .then(() => {
      console.log("Seed script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed script failed:", error);
      process.exit(1);
    });
}
