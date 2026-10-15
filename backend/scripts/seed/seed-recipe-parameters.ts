#!/usr/bin/env ts-node

/**
 * Recipe Parameters Seeder
 *
 * Seeds standard recipe parameters that are used across all recipes.
 * This script is idempotent and safe to run multiple times - it uses upsert
 * to update existing parameters or create new ones.
 *
 * Usage:
 *   npm run seed:recipe-parameters
 *   or
 *   DB_URL=<connection-string> npx ts-node scripts/seed/seed-recipe-parameters.ts
 */

import {
  PrismaClient,
  EnumRecipeParameterRecipeSetpointType,
} from "@prisma/client";

const prisma = new PrismaClient();

interface RecipeParameterSeedData {
  recipeParamName: string;
  className: string;
  recipeSetpointType: EnumRecipeParameterRecipeSetpointType;
  recipeNumericalSetpoint: number;
  recipeSetpointLowerLimit: number;
  recipeSetpointUpperLimit: number;
  recipeParamUnits: string;
  recipeParamDescription: string;
  description: string;
}

const RECIPE_PARAMETERS: RecipeParameterSeedData[] = [
  {
    recipeParamName: "BaseLoss",
    className: "Distillation/Metric",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 0.0,
    recipeSetpointLowerLimit: 0.0,
    recipeSetpointUpperLimit: 0.0,
    recipeParamUnits: "%ABV",
    recipeParamDescription: "",
    description: "",
  },
  {
    recipeParamName: "BeerFeedTray",
    className: "Distillation/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 15.0,
    recipeSetpointLowerLimit: 15.0,
    recipeSetpointUpperLimit: 15.0,
    recipeParamUnits: "Tray No.",
    recipeParamDescription: "Still Beer Feed Tray Number",
    description: "",
  },
  {
    recipeParamName: "LowWineProof",
    className: "Distillation/Actual",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 130.0,
    recipeSetpointLowerLimit: 130.0,
    recipeSetpointUpperLimit: 130.0,
    recipeParamUnits: "Proof",
    recipeParamDescription: "Low Wine Proof Actual",
    description: "",
  },
  {
    recipeParamName: "HighWineProof",
    className: "Distillation/Actual",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 140.0,
    recipeSetpointLowerLimit: 140.0,
    recipeSetpointUpperLimit: 140.0,
    recipeParamUnits: "Proof",
    recipeParamDescription: "High Wine Proof Actual",
    description: "",
  },
  {
    recipeParamName: "Age",
    className: "Fermentation/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 72.0,
    recipeSetpointLowerLimit: 72.0,
    recipeSetpointUpperLimit: 72.0,
    recipeParamUnits: "Hours",
    recipeParamDescription: "Fermentation Age",
    description: "",
  },
  {
    recipeParamName: "ControlTemp",
    className: "Fermentation/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 92.0,
    recipeSetpointLowerLimit: 92.0,
    recipeSetpointUpperLimit: 92.0,
    recipeParamUnits: "°F",
    recipeParamDescription: "Fermentation Control recipeSetpoint",
    description: "",
  },
  {
    recipeParamName: "SetTemp",
    className: "Fermentation/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 90.0,
    recipeSetpointLowerLimit: 90.0,
    recipeSetpointUpperLimit: 90.0,
    recipeParamUnits: "°F",
    recipeParamDescription: "Mash Cooler Into Ferm Temp °F",
    description: "",
  },
  {
    recipeParamName: "StarterSweetpH",
    className: "Fermentation/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 5.1,
    recipeSetpointLowerLimit: 5.1,
    recipeSetpointUpperLimit: 5.1,
    recipeParamUnits: "pH",
    recipeParamDescription: "Sweet Mash Only [pH]",
    description: "",
  },
  {
    recipeParamName: "RatioByFerm",
    className: "Fermentation/Metric",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 2.42,
    recipeSetpointLowerLimit: 2.42,
    recipeSetpointUpperLimit: 2.42,
    recipeParamUnits: "BGs",
    recipeParamDescription:
      "(Total Liquid + (Top Off Volume * Top Off Freq)) / (Total Grain Weight)",
    description: "",
  },
  {
    recipeParamName: "CooksPerFerm",
    className: "Mashing/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 3.0,
    recipeSetpointLowerLimit: 3.0,
    recipeSetpointUpperLimit: 3.0,
    recipeParamUnits: "Cooks/Ferm",
    recipeParamDescription: "Cooks Per Fermenter",
    description: "",
  },
  {
    recipeParamName: "LowTempInfusion",
    className: "Mashing/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 0.0,
    recipeSetpointLowerLimit: 0.0,
    recipeSetpointUpperLimit: 0.0,
    recipeParamUnits: "",
    recipeParamDescription: "Boolean for Low Temp Infusion Enable",
    description: "",
  },
  {
    recipeParamName: "MashRatio",
    className: "Mashing/Metric",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 2.46,
    recipeSetpointLowerLimit: 2.46,
    recipeSetpointUpperLimit: 2.46,
    recipeParamUnits: "gal / lbs",
    recipeParamDescription: "Total Liquid  / Total Grain Weight [gal / lbs]",
    description: "",
  },
  {
    recipeParamName: "TopOffFrequency",
    className: "Mashing/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 3.0,
    recipeSetpointLowerLimit: 3.0,
    recipeSetpointUpperLimit: 3.0,
    recipeParamUnits: "No. of Cooks",
    recipeParamDescription: "",
    description: "",
  },
  {
    recipeParamName: "TopOffVolume",
    className: "Mashing/Parameter",
    recipeSetpointType: "Numeric" as EnumRecipeParameterRecipeSetpointType,
    recipeNumericalSetpoint: 1000.0,
    recipeSetpointLowerLimit: 1000.0,
    recipeSetpointUpperLimit: 1000.0,
    recipeParamUnits: "gal",
    recipeParamDescription: "",
    description: "",
  },
];

async function seedRecipeParameters() {
  console.log("🌱 Starting Recipe Parameters Seeding...");
  console.log(`📊 Found ${RECIPE_PARAMETERS.length} recipe parameters to seed`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const param of RECIPE_PARAMETERS) {
    try {
      // Check if parameter already exists (by className + recipeParamName)
      const existing = await prisma.recipeParameter.findFirst({
        where: {
          className: param.className,
          recipeParamName: param.recipeParamName,
          isClassDefinition: true,
        },
      });

      // Find matching units if param.recipeParamUnits is provided
      let unitsId: string | undefined;
      if (param.recipeParamUnits) {
        const units = await prisma.units.findFirst({
          where: {
            OR: [
              { abbreviation: param.recipeParamUnits },
              { name: param.recipeParamUnits },
            ],
          },
        });
        unitsId = units?.id;
      }

      if (existing) {
        // Update existing parameter
        await prisma.recipeParameter.update({
          where: { id: existing.id },
          data: {
            recipeSetpointType: param.recipeSetpointType,
            recipeNumericalSetpoint: param.recipeNumericalSetpoint,
            recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
            recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
            unitsId: unitsId,
            recipeParamDescription: param.recipeParamDescription,
            description: param.description,
            active: true,
            updatedAt: new Date(),
            updatedBy: "seed-script",
          },
        });
        console.log(`✏️  Updated: ${param.className}/${param.recipeParamName}`);
        updated++;
      } else {
        // Create new parameter
        await prisma.recipeParameter.create({
          data: {
            recipeParamName: param.recipeParamName,
            className: param.className,
            recipeSetpointType: param.recipeSetpointType,
            recipeNumericalSetpoint: param.recipeNumericalSetpoint,
            recipeSetpointLowerLimit: param.recipeSetpointLowerLimit,
            recipeSetpointUpperLimit: param.recipeSetpointUpperLimit,
            unitsId: unitsId,
            recipeParamDescription: param.recipeParamDescription,
            description: param.description,
            active: true,
            isClassDefinition: true,
            revision: 0,
            schemaVersion: "0001-alpha",
            createdBy: "seed-script",
            updatedBy: "seed-script",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        console.log(`✅ Created: ${param.className}/${param.recipeParamName}`);
        created++;
      }
    } catch (error) {
      console.error(
        `❌ Error processing ${param.className}/${param.recipeParamName}:`,
        error
      );
      skipped++;
    }
  }

  console.log("\n📈 Seeding Summary:");
  console.log(`   ✅ Created: ${created}`);
  console.log(`   ✏️  Updated: ${updated}`);
  console.log(`   ❌ Skipped: ${skipped}`);
  console.log(`   📊 Total: ${RECIPE_PARAMETERS.length}`);
}

async function cleanupDuplicates() {
  console.log("\n🧹 Cleaning up duplicate recipe parameters...");

  // Find duplicates (same className + recipeParamName)
  const allParams = await prisma.recipeParameter.findMany({
    where: {
      isClassDefinition: true,
    },
    orderBy: {
      createdAt: "asc", // Keep the oldest one
    },
  });

  const seen = new Map<string, string>(); // key -> id to keep
  const toDelete: string[] = [];

  for (const param of allParams) {
    const key = `${param.className}:${param.recipeParamName}`;

    if (seen.has(key)) {
      toDelete.push(param.id);
    } else {
      seen.set(key, param.id);
    }
  }

  if (toDelete.length > 0) {
    console.log(`   Found ${toDelete.length} duplicates to remove`);

    // Delete duplicates
    const result = await prisma.recipeParameter.deleteMany({
      where: {
        id: {
          in: toDelete,
        },
      },
    });

    console.log(`   ✅ Removed ${result.count} duplicate parameters`);
  } else {
    console.log("   ✅ No duplicates found");
  }
}

async function main() {
  try {
    // First, clean up any existing duplicates
    await cleanupDuplicates();

    // Then seed the parameters
    await seedRecipeParameters();

    console.log("\n✅ Recipe Parameters seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { seedRecipeParameters, cleanupDuplicates };
