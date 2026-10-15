/**
 * Seed script for Grain Characters
 *
 * Populates the GrainCharacter table with standard grain abbreviations
 * as defined in TEC-282 Recipe String Format Specification.
 *
 * Run with: DB_URL=<connection> npx ts-node scripts/seed/seed-grain-characters.ts
 */

import { PrismaClient, EnumGrainType } from "@prisma/client";

const prisma = new PrismaClient();

interface GrainCharacterData {
  grainType: EnumGrainType;
  abbreviation: string;
  name: string;
  varietyCode: string | null;
  description: string;
}

const grainCharacters: GrainCharacterData[] = [
  // Base grain types - single character abbreviations only
  // Variety codes (1, 2, 3) are auto-assigned by UI when multiple of same grain used
  {
    grainType: EnumGrainType.CORN,
    abbreviation: "C",
    name: "Corn",
    varietyCode: null,
    description: "Standard yellow dent corn",
  },
  {
    grainType: EnumGrainType.RYE,
    abbreviation: "R",
    name: "Rye",
    varietyCode: null,
    description: "Standard rye grain",
  },
  {
    grainType: EnumGrainType.MALTED_RYE,
    abbreviation: "Y",
    name: "Malted Rye",
    varietyCode: null,
    description: "Malted rye grain",
  },
  {
    grainType: EnumGrainType.WHEAT,
    abbreviation: "W",
    name: "Wheat",
    varietyCode: null,
    description: "Standard wheat",
  },
  {
    grainType: EnumGrainType.MALT,
    abbreviation: "M",
    name: "Malt",
    varietyCode: null,
    description: "Malted barley",
  },
  {
    grainType: EnumGrainType.SPECIALTY,
    abbreviation: "S",
    name: "Sorghum",
    varietyCode: null,
    description: "Gluten-free grain alternative",
  },
  {
    grainType: EnumGrainType.BUCKWHEAT,
    abbreviation: "B",
    name: "Barley",
    varietyCode: null,
    description: "Unmalted barley",
  },
  {
    grainType: EnumGrainType.OATS,
    abbreviation: "O",
    name: "Oats",
    varietyCode: null,
    description: "Oat grain",
  },
  {
    grainType: EnumGrainType.SPECIALTY,
    abbreviation: "Z",
    name: "Specialty",
    varietyCode: null,
    description: "Specialty catch-all for unique grains",
  },
];

async function seedGrainCharacters() {
  console.log("\n=== Seeding Grain Characters ===\n");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const grain of grainCharacters) {
    try {
      // Check if exists first (since null varietyCode needs special handling)
      const existing = await prisma.grainCharacter.findFirst({
        where: {
          abbreviation: grain.abbreviation,
          varietyCode: grain.varietyCode,
        },
      });

      if (existing) {
        // Update existing
        await prisma.grainCharacter.update({
          where: { id: existing.id },
          data: {
            grainType: grain.grainType,
            name: grain.name,
            description: grain.description,
            active: true,
          },
        });
        updated++;
        console.log(
          `  ~ Updated: ${grain.abbreviation}${grain.varietyCode || ""} - ${
            grain.name
          }`
        );
      } else {
        // Create new
        await prisma.grainCharacter.create({
          data: {
            grainType: grain.grainType,
            abbreviation: grain.abbreviation,
            name: grain.name,
            varietyCode: grain.varietyCode,
            description: grain.description,
            active: true,
          },
        });
        created++;
        console.log(
          `  + Created: ${grain.abbreviation}${grain.varietyCode || ""} - ${
            grain.name
          }`
        );
      }
    } catch (error: any) {
      console.error(
        `  ! Error seeding ${grain.abbreviation}${grain.varietyCode || ""}:`,
        error.message
      );
      skipped++;
    }
  }

  console.log("\n=== Grain Characters Seed Complete ===");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${grainCharacters.length}`);

  // Verify the seeded data
  const count = await prisma.grainCharacter.count();
  console.log(`\n  Database total: ${count} grain characters\n`);
}

async function main() {
  try {
    await seedGrainCharacters();
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
