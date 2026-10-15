/**
 * Backfill ItemGroup table from unique Item.itemGroup values
 *
 * This script:
 * 1. Gets all unique itemGroup values from the Item table
 * 2. Creates ItemGroup records for each unique value
 * 3. Optionally auto-links to GrainCharacters by matching names
 *
 * Run with: npx ts-node scripts/migrate/backfill-item-groups.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || process.env.DB_URL,
    },
  },
});

// Mapping of itemGroup patterns to grain character abbreviations
const GRAIN_CHARACTER_MAPPINGS: Record<string, string> = {
  corn: "C",
  rye: "R",
  wheat: "W",
  barley: "B",
  malt: "M",
  oat: "O",
  sorghum: "S",
};

async function backfillItemGroups() {
  console.log("Starting ItemGroup backfill...\n");

  // Get all unique itemGroup values from Items
  const uniqueGroups = await prisma.item.findMany({
    where: {
      itemGroup: {
        not: null,
      },
    },
    select: {
      itemGroup: true,
    },
    distinct: ["itemGroup"],
  });

  const groupNames = uniqueGroups
    .map((item) => item.itemGroup)
    .filter((name): name is string => name !== null);

  console.log(`Found ${groupNames.length} unique item groups in Item table:\n`);
  groupNames.forEach((name) => console.log(`  - ${name}`));
  console.log("");

  // Get existing ItemGroups
  const existingItemGroups = await prisma.itemGroup.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existingItemGroups.map((ig) => ig.name));

  // Get all grain characters for linking
  const grainCharacters = await prisma.grainCharacter.findMany({
    select: { id: true, abbreviation: true, name: true },
  });

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const groupName of groupNames) {
    if (existingNames.has(groupName)) {
      console.log(`⏭️  Skipping "${groupName}" - already exists`);
      skipped++;
      continue;
    }

    // Try to find matching grain character
    let grainCharacterId: string | null = null;
    const lowerName = groupName.toLowerCase();

    for (const [pattern, abbreviation] of Object.entries(
      GRAIN_CHARACTER_MAPPINGS
    )) {
      if (lowerName.includes(pattern)) {
        const grainChar = grainCharacters.find(
          (gc) => gc.abbreviation === abbreviation
        );
        if (grainChar) {
          grainCharacterId = grainChar.id;
          console.log(
            `🔗 Linking "${groupName}" to grain character "${grainChar.name}" (${abbreviation})`
          );
          linked++;
          break;
        }
      }
    }

    // Create the ItemGroup
    await prisma.itemGroup.create({
      data: {
        name: groupName,
        description: `Auto-created from Item.itemGroup field`,
        grainCharacterId,
      },
    });

    console.log(
      `✅ Created ItemGroup: "${groupName}"${
        grainCharacterId ? " (linked)" : ""
      }`
    );
    created++;
  }

  console.log("\n--- Summary ---");
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Auto-linked to grain characters: ${linked}`);
  console.log("\nBackfill complete!");
}

async function main() {
  try {
    await backfillItemGroups();
  } catch (error) {
    console.error("Error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
