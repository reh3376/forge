#!/usr/bin/env ts-node

/**
 * Verify Specific Recipe Protocol
 *
 * Checks if BHK-00-95-00-05-R01 has a mashing protocol.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyRecipeProtocol() {
  console.log("🔍 Verifying BHK-00-95-00-05-R01 Mashing Protocol...\n");

  const recipe = await prisma.recipe.findFirst({
    where: {
      Recipe: "BHK-00-95-00-05-R01",
    },
    include: {
      mashingProtocol: {
        include: {
          steps: {
            orderBy: {
              index: "asc",
            },
          },
        },
      },
    },
  });

  if (!recipe) {
    console.log("❌ Recipe not found!");
    return;
  }

  console.log(`✅ Recipe found: ${recipe.Recipe} (${recipe.id})`);
  console.log(`   Active: ${recipe.active}`);
  console.log(`   Mashing Protocol ID: ${recipe.mashingProtocolId || "NULL"}`);

  if (!recipe.mashingProtocol) {
    console.log("\n❌ NO MASHING PROTOCOL LINKED!");

    // Check if protocol exists but isn't linked
    const orphanedProtocol = await prisma.mashingProtocol.findFirst({
      where: {
        name: "BHK-00-95-00-05-R01-Mashing-Protocol",
      },
      include: {
        steps: true,
      },
    });

    if (orphanedProtocol) {
      console.log("\n⚠️  Found orphaned protocol:");
      console.log(`   Protocol ID: ${orphanedProtocol.id}`);
      console.log(`   Steps: ${orphanedProtocol.steps.length}`);
      console.log(`   Created by: ${orphanedProtocol.createdBy}`);
    }
  } else {
    console.log(`\n✅ Mashing Protocol: ${recipe.mashingProtocol.name}`);
    console.log(`   Protocol ID: ${recipe.mashingProtocol.id}`);
    console.log(`   Steps: ${recipe.mashingProtocol.steps.length}`);
    console.log(`   Created by: ${recipe.mashingProtocol.createdBy}`);
    console.log(`   Created at: ${recipe.mashingProtocol.createdAt}`);

    console.log("\n📋 Steps:");
    recipe.mashingProtocol.steps.forEach((step) => {
      console.log(
        `   ${step.index}. ${step.stepType} (${step.holdType}) - ${step.temperatureSetpoint}°F, ${step.stepTime}min`
      );
    });
  }

  await prisma.$disconnect();
}

async function main() {
  try {
    await verifyRecipeProtocol();
    console.log("\n✅ Verification completed!");
  } catch (error) {
    console.error("❌ Error during verification:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { verifyRecipeProtocol };
