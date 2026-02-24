#!/usr/bin/env ts-node

/**
 * Cleanup Incorrect Mashing Protocols
 *
 * Removes mashing protocols and steps created by the incorrect backfill script
 * that pulled equipment phases from all operations instead of just Cook operations.
 *
 * Usage:
 *   DB_URL=<connection-string> npx ts-node scripts/seed/cleanup-incorrect-mashing-protocols.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupIncorrectProtocols() {
  console.log("🧹 Starting Cleanup of Incorrect Mashing Protocols...\n");

  // Find all mashing protocols created by backfill or copy scripts
  const protocolsToDelete = await prisma.mashingProtocol.findMany({
    where: {
      OR: [
        { createdBy: "backfill-script" },
        { createdBy: "copy-by-mashbill-script" },
      ],
    },
    include: {
      recipes: {
        select: {
          id: true,
          Recipe: true,
        },
      },
    },
  });

  console.log(`📊 Found ${protocolsToDelete.length} protocols to delete`);

  let totalStepsDeleted = 0;
  let totalProtocolsDeleted = 0;
  let recipesUnlinked = 0;

  for (const protocol of protocolsToDelete) {
    // Count steps for this protocol
    const stepCount = await prisma.mashingProtocolStep.count({
      where: {
        mashingProtocolId: protocol.id,
      },
    });

    const recipeCount = protocol.recipes.length;

    console.log(`\n🗑️  Deleting protocol: ${protocol.name}`);
    console.log(`   Steps: ${stepCount}`);
    console.log(`   Linked recipes: ${recipeCount}`);

    try {
      // First, delete all steps for this protocol
      const deletedSteps = await prisma.mashingProtocolStep.deleteMany({
        where: {
          mashingProtocolId: protocol.id,
        },
      });

      console.log(`   ✅ Deleted ${deletedSteps.count} steps`);
      totalStepsDeleted += deletedSteps.count;

      // Unlink recipes from this protocol
      if (recipeCount > 0) {
        await prisma.recipe.updateMany({
          where: {
            mashingProtocolId: protocol.id,
          },
          data: {
            mashingProtocolId: null,
            updatedBy: "cleanup-script",
            updatedAt: new Date(),
          },
        });

        console.log(`   ✅ Unlinked ${recipeCount} recipes`);
        recipesUnlinked += recipeCount;
      }

      // Finally, delete the protocol
      await prisma.mashingProtocol.delete({
        where: {
          id: protocol.id,
        },
      });

      console.log(`   ✅ Deleted protocol`);
      totalProtocolsDeleted++;
    } catch (error) {
      console.error(`   ❌ Error deleting protocol ${protocol.name}:`, error);
    }
  }

  console.log("\n📈 Cleanup Summary:");
  console.log(`   🗑️  Mashing Protocol Steps Deleted: ${totalStepsDeleted}`);
  console.log(`   🗑️  Mashing Protocols Deleted: ${totalProtocolsDeleted}`);
  console.log(`   🔗 Recipes Unlinked: ${recipesUnlinked}`);
}

async function main() {
  try {
    await cleanupIncorrectProtocols();
    console.log("\n✅ Cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { cleanupIncorrectProtocols };
