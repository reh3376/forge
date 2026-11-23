#!/usr/bin/env ts-node

/**
 * Verify Mashing Protocol Backfill Results
 *
 * Checks database to verify the backfill script results.
 *
 * Usage:
 *   DB_URL=<connection-string> npx ts-node scripts/seed/verify-backfill-results.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyResults() {
  console.log("🔍 Verifying Backfill Results...\n");

  // Count mashing protocols created by backfill script
  const protocolsCreated = await prisma.mashingProtocol.count({
    where: {
      createdBy: "backfill-script",
    },
  });

  // Count steps created
  const stepsCreated = await prisma.mashingProtocolStep.count({
    where: {
      createdBy: "backfill-script",
    },
  });

  // Count recipes now linked to protocols
  const recipesLinked = await prisma.recipe.count({
    where: {
      mashingProtocolId: { not: null },
      updatedBy: "backfill-script",
    },
  });

  // Count recipes still without protocols
  const recipesWithoutProtocols = await prisma.recipe.count({
    where: {
      active: true,
      mashingProtocolId: null,
    },
  });

  console.log("📊 Verification Results:");
  console.log(`   ✅ Mashing Protocols Created: ${protocolsCreated}`);
  console.log(`   ✅ Mashing Protocol Steps Created: ${stepsCreated}`);
  console.log(`   ✅ Recipes Linked: ${recipesLinked}`);
  console.log(
    `   ⏭️  Active Recipes Still Without Protocols: ${recipesWithoutProtocols}`
  );
  console.log(
    `   📈 Average Steps per Protocol: ${(
      stepsCreated / protocolsCreated
    ).toFixed(1)}`
  );

  // Sample a few protocols to verify quality
  const sampleProtocols = await prisma.mashingProtocol.findMany({
    where: {
      createdBy: "backfill-script",
    },
    take: 3,
    include: {
      steps: {
        include: {
          recipeBomItem: {
            select: {
              id: true,
              item: {
                select: {
                  itemName: true,
                },
              },
            },
          },
        },
      },
      recipes: {
        select: {
          Recipe: true,
        },
      },
    },
  });

  console.log("\n📋 Sample Protocols:\n");
  for (const protocol of sampleProtocols) {
    console.log(`   Protocol: ${protocol.name}`);
    console.log(
      `      Recipe: ${protocol.recipes.map((r) => r.Recipe).join(", ")}`
    );
    console.log(`      Steps: ${protocol.steps.length}`);
    const stepsWithBom = protocol.steps.filter(
      (s) => s.recipeBomItem.length > 0
    );
    console.log(`      Steps with BOM items: ${stepsWithBom.length}`);
    console.log("");
  }
}

async function main() {
  try {
    await verifyResults();
    console.log("✅ Verification completed successfully!");
  } catch (error) {
    console.error("❌ Error during verification:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verifyResults };
