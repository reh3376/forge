import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// TTB definitions (official federal categories)
const ttbDefinitions = [
  {
    code: "ASM",
    name: "American Single Malt",
    description: "Single malt whiskey produced in the United States",
    category: "Single Malt",
    isTTBDefinition: true,
  },
  {
    code: "BW",
    name: "Bourbon Whiskey",
    description:
      "Whiskey produced in the United States at not exceeding 160° proof from a fermented mash of not less than 51 percent corn and stored at not more than 125° proof in charred new oak containers",
    category: "Bourbon",
    isTTBDefinition: true,
  },
  {
    code: "CW",
    name: "Corn Whiskey",
    description: "Whiskey made from at least 80% corn mash",
    category: "Corn",
    isTTBDefinition: true,
  },
  {
    code: "RW",
    name: "Rye Whiskey",
    description: "Whiskey made from at least 51% rye mash",
    category: "Rye",
    isTTBDefinition: true,
  },
  {
    code: "WW",
    name: "Wheat Whiskey",
    description: "Whiskey made from at least 51% wheat mash",
    category: "Wheat",
    isTTBDefinition: true,
  },
  {
    code: "MW",
    name: "Malt Whiskey",
    description: "Whiskey made primarily from malted barley",
    category: "Malt",
    isTTBDefinition: true,
  },
  {
    code: "FGW",
    name: "Four Grain Whiskey",
    description: "Whiskey made with four grain varieties",
    category: "Four Grain",
    isTTBDefinition: true,
  },
];

// Derived types (subcategories that reference TTB parents)
const derivedTypes = [
  {
    code: "CB",
    name: "Corn Bourbon",
    description: "Bourbon whiskey with at least 51% corn mash",
    category: "Bourbon",
    isTTBDefinition: false,
    ttbParentCode: "BW",
  },
  {
    code: "RB",
    name: "Rye Bourbon",
    description: "Bourbon whiskey with significant rye content",
    category: "Bourbon",
    isTTBDefinition: false,
    ttbParentCode: "BW",
  },
  {
    code: "WB",
    name: "Wheated Bourbon",
    description: "Bourbon whiskey with wheat as secondary grain",
    category: "Bourbon",
    isTTBDefinition: false,
    ttbParentCode: "BW",
  },
  {
    code: "TW",
    name: "Tennessee Whiskey",
    description:
      "Bourbon whiskey produced in Tennessee with additional charcoal filtering (Lincoln County Process)",
    category: "Bourbon",
    isTTBDefinition: false,
    ttbParentCode: "BW",
  },
  {
    code: "FGB",
    name: "Four Grain Bourbon",
    description: "Bourbon whiskey made with four grain varieties",
    category: "Bourbon",
    isTTBDefinition: false,
    ttbParentCode: "BW",
  },
];

async function seedWhiskeyTypes() {
  console.log("Starting WhiskeyType seeding...\n");

  try {
    // Phase 1: Seed TTB definitions (parent categories)
    console.log("=== Phase 1: Seeding TTB Definitions ===");
    for (const whiskeyType of ttbDefinitions) {
      const existing = await prisma.whiskeyType.findUnique({
        where: { code: whiskeyType.code },
      });

      if (existing) {
        console.log(
          `  ✓ WhiskeyType ${whiskeyType.code} already exists, updating...`
        );
        await prisma.whiskeyType.update({
          where: { code: whiskeyType.code },
          data: {
            name: whiskeyType.name,
            description: whiskeyType.description,
            category: whiskeyType.category,
            active: true,
            isTTBDefinition: whiskeyType.isTTBDefinition,
          },
        });
      } else {
        console.log(`  + Creating WhiskeyType ${whiskeyType.code}...`);
        await prisma.whiskeyType.create({
          data: {
            code: whiskeyType.code,
            name: whiskeyType.name,
            description: whiskeyType.description,
            category: whiskeyType.category,
            active: true,
            isTTBDefinition: whiskeyType.isTTBDefinition,
          },
        });
      }
    }
    console.log("Phase 1 completed!\n");

    // Phase 2: Seed derived types (subcategories with TTB parent references)
    console.log("=== Phase 2: Seeding Derived Types ===");
    for (const derivedType of derivedTypes) {
      const existing = await prisma.whiskeyType.findUnique({
        where: { code: derivedType.code },
      });

      // Find the parent TTB whiskey type
      const ttbParent = await prisma.whiskeyType.findUnique({
        where: { code: derivedType.ttbParentCode },
      });

      if (!ttbParent) {
        console.warn(
          `  ⚠️  Parent TTB whiskey type ${derivedType.ttbParentCode} not found for ${derivedType.code}, skipping...`
        );
        continue;
      }

      if (existing) {
        console.log(
          `  ✓ WhiskeyType ${derivedType.code} already exists, updating...`
        );
        await prisma.whiskeyType.update({
          where: { code: derivedType.code },
          data: {
            name: derivedType.name,
            description: derivedType.description,
            category: derivedType.category,
            active: true,
            isTTBDefinition: derivedType.isTTBDefinition,
            ttbWhiskeyTypeId: ttbParent.id,
          },
        });
      } else {
        console.log(`  + Creating WhiskeyType ${derivedType.code}...`);
        await prisma.whiskeyType.create({
          data: {
            code: derivedType.code,
            name: derivedType.name,
            description: derivedType.description,
            category: derivedType.category,
            active: true,
            isTTBDefinition: derivedType.isTTBDefinition,
            ttbWhiskeyTypeId: ttbParent.id,
          },
        });
      }
    }
    console.log("Phase 2 completed!\n");

    console.log("=== WhiskeyType Seeding Summary ===");
    const totalCount = await prisma.whiskeyType.count();
    const ttbCount = await prisma.whiskeyType.count({
      where: { isTTBDefinition: true },
    });
    const derivedCount = await prisma.whiskeyType.count({
      where: { isTTBDefinition: false },
    });
    console.log(`  📊 Total whiskey types: ${totalCount}`);
    console.log(`  📚 TTB definitions: ${ttbCount}`);
    console.log(`  🔗 Derived types: ${derivedCount}`);

    // Phase 3: Migrate existing Lot enum values to WhiskeyType references
    console.log("\n=== Phase 3: Migrating Existing Lot Whiskey Types ===");

    // Try to query existing lots with enum values
    // Note: This may fail if the enum column has already been dropped
    try {
      const lotsWithWhiskeyType = (await prisma.$queryRaw`
        SELECT id, "whiskeyType" FROM "Lot" WHERE "whiskeyType" IS NOT NULL AND "whiskeyTypeId" IS NULL
      `) as Array<{ id: string; whiskeyType: string }>;

      const enumMapping: Record<string, string> = {
        AmericanSingleMalt: "ASM",
        CornBourbon: "CB",
        CornWhiskey: "CW",
        RyeBourbon: "RB",
        RyeWhiskey: "RW",
        WheatedBourbon: "WB",
        WheatWhiskey: "WW",
      };

      console.log(
        `  Found ${lotsWithWhiskeyType.length} lots with whiskey type enum values to migrate`
      );

      let updated = 0;
      let skipped = 0;
      const failures: Array<{
        lotId: string;
        enumValue: string;
        whiskeyTypeCode: string;
        reason: string;
      }> = [];

      for (const lot of lotsWithWhiskeyType) {
        if (lot.whiskeyType && enumMapping[lot.whiskeyType]) {
          const whiskeyTypeCode = enumMapping[lot.whiskeyType];
          const whiskeyType = await prisma.whiskeyType.findUnique({
            where: { code: whiskeyTypeCode },
          });

          if (whiskeyType) {
            try {
              await prisma.lot.update({
                where: { id: lot.id },
                data: { whiskeyTypeId: whiskeyType.id },
              });
              updated++;
              if (updated % 10 === 0) {
                console.log(
                  `  ✅ Updated ${updated}/${lotsWithWhiskeyType.length} lots...`
                );
              }
            } catch (error) {
              skipped++;
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.warn(
                `  ⚠️  Lot ${lot.id}: Failed to update (enum: ${lot.whiskeyType}, code: ${whiskeyTypeCode}) - ${errorMessage}`
              );
              failures.push({
                lotId: lot.id,
                enumValue: lot.whiskeyType,
                whiskeyTypeCode,
                reason: errorMessage,
              });
            }
          } else {
            skipped++;
            console.warn(
              `  ⚠️  Lot ${lot.id}: WhiskeyType not found in database (enum: ${lot.whiskeyType}, code: ${whiskeyTypeCode})`
            );
            failures.push({
              lotId: lot.id,
              enumValue: lot.whiskeyType,
              whiskeyTypeCode,
              reason: "WhiskeyType not found in database",
            });
          }
        } else if (lot.whiskeyType) {
          // Handle unmapped enum values
          skipped++;
          console.warn(
            `  ⚠️  Lot ${lot.id}: No mapping defined for enum value "${lot.whiskeyType}"`
          );
          failures.push({
            lotId: lot.id,
            enumValue: lot.whiskeyType,
            whiskeyTypeCode: "N/A",
            reason: "No mapping defined for enum value",
          });
        }
      }

      console.log(`\n  📊 Migration Summary:`);
      console.log(`  ✅ Updated: ${updated}`);
      console.log(`  ⚠️  Skipped: ${skipped}`);
      console.log(`  📦 Total processed: ${lotsWithWhiskeyType.length}`);

      if (failures.length > 0) {
        console.warn(`\n  ⚠️  ${failures.length} lot(s) failed to migrate:`);
        failures.forEach(({ lotId, enumValue, whiskeyTypeCode, reason }) => {
          console.warn(
            `     - Lot ${lotId} (enum: ${enumValue} -> code: ${whiskeyTypeCode}): ${reason}`
          );
        });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('column "whiskeyType" does not exist')
      ) {
        console.log(
          "  ℹ️  Enum column already dropped or does not exist, skipping migration."
        );
      } else {
        console.warn("  ⚠️  Error during lot migration:", error);
      }
    }

    // Phase 4: Migrate existing Recipe enum values to WhiskeyType references
    console.log("\n=== Phase 4: Migrating Existing Recipe Whiskey Types ===");

    // Try to query existing recipes with enum values
    // Note: This may fail if the enum column has already been dropped
    try {
      const recipesWithWhiskeyType = (await prisma.$queryRaw`
        SELECT id, "whiskeyType" FROM "Recipe" WHERE "whiskeyType" IS NOT NULL AND "whiskeyTypeId" IS NULL
      `) as Array<{ id: string; whiskeyType: string }>;

      const enumMapping: Record<string, string> = {
        RyeBourbon: "RB",
        WheatedBourbon: "WB",
        FourGrainBourbon: "FGB",
        RyeWhiskey: "RW",
        WheatWhiskey: "WW",
        MaltWhiskey: "MW",
        FourGrainWhiskey: "FGW",
      };

      console.log(
        `  Found ${recipesWithWhiskeyType.length} recipes with whiskey type enum values to migrate`
      );

      let updated = 0;
      let skipped = 0;
      const failures: Array<{
        recipeId: string;
        enumValue: string;
        whiskeyTypeCode: string;
        reason: string;
      }> = [];

      for (const recipe of recipesWithWhiskeyType) {
        if (recipe.whiskeyType && enumMapping[recipe.whiskeyType]) {
          const whiskeyTypeCode = enumMapping[recipe.whiskeyType];
          const whiskeyType = await prisma.whiskeyType.findUnique({
            where: { code: whiskeyTypeCode },
          });

          if (whiskeyType) {
            try {
              await prisma.recipe.update({
                where: { id: recipe.id },
                data: { whiskeyTypeId: whiskeyType.id },
              });
              updated++;
              if (updated % 10 === 0) {
                console.log(
                  `  ✅ Updated ${updated}/${recipesWithWhiskeyType.length} recipes...`
                );
              }
            } catch (error) {
              skipped++;
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.warn(
                `  ⚠️  Recipe ${recipe.id}: Failed to update (enum: ${recipe.whiskeyType}, code: ${whiskeyTypeCode}) - ${errorMessage}`
              );
              failures.push({
                recipeId: recipe.id,
                enumValue: recipe.whiskeyType,
                whiskeyTypeCode,
                reason: errorMessage,
              });
            }
          } else {
            skipped++;
            console.warn(
              `  ⚠️  Recipe ${recipe.id}: WhiskeyType not found in database (enum: ${recipe.whiskeyType}, code: ${whiskeyTypeCode})`
            );
            failures.push({
              recipeId: recipe.id,
              enumValue: recipe.whiskeyType,
              whiskeyTypeCode,
              reason: "WhiskeyType not found in database",
            });
          }
        } else if (recipe.whiskeyType) {
          // Handle unmapped enum values
          skipped++;
          console.warn(
            `  ⚠️  Recipe ${recipe.id}: No mapping defined for enum value "${recipe.whiskeyType}"`
          );
          failures.push({
            recipeId: recipe.id,
            enumValue: recipe.whiskeyType,
            whiskeyTypeCode: "N/A",
            reason: "No mapping defined for enum value",
          });
        }
      }

      console.log(`\n  📊 Migration Summary:`);
      console.log(`  ✅ Updated: ${updated}`);
      console.log(`  ⚠️  Skipped: ${skipped}`);
      console.log(`  📦 Total processed: ${recipesWithWhiskeyType.length}`);

      if (failures.length > 0) {
        console.warn(`\n  ⚠️  ${failures.length} recipe(s) failed to migrate:`);
        failures.forEach(({ recipeId, enumValue, whiskeyTypeCode, reason }) => {
          console.warn(
            `     - Recipe ${recipeId} (enum: ${enumValue} -> code: ${whiskeyTypeCode}): ${reason}`
          );
        });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('column "whiskeyType" does not exist')
      ) {
        console.log(
          "  ℹ️  Enum column already dropped or does not exist, skipping migration."
        );
      } else {
        console.warn("  ⚠️  Error during recipe migration:", error);
      }
    }

    console.log("\n✅ WhiskeyType seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding WhiskeyTypes:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedWhiskeyTypes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedWhiskeyTypes };
