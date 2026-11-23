#!/usr/bin/env ts-node

/**
 * Complete Mashing Protocol Verification
 *
 * Verifies all mashing protocols across all recipes.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyAll() {
  console.log("🔍 Complete Mashing Protocol Verification...\n");

  const totalProtocols = await prisma.mashingProtocol.count();
  const totalSteps = await prisma.mashingProtocolStep.count();

  const recipesWithProtocols = await prisma.recipe.count({
    where: {
      active: true,
      mashingProtocolId: { not: null },
    },
  });

  const recipesWithoutProtocols = await prisma.recipe.count({
    where: {
      active: true,
      mashingProtocolId: null,
    },
  });

  const totalActiveRecipes = recipesWithProtocols + recipesWithoutProtocols;

  console.log("📊 Overall Results:");
  console.log(`   Total Active Recipes: ${totalActiveRecipes}`);
  console.log(
    `   ✅ Recipes WITH Mashing Protocols: ${recipesWithProtocols} (${(
      (recipesWithProtocols / totalActiveRecipes) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `   ❌ Recipes WITHOUT Mashing Protocols: ${recipesWithoutProtocols}`
  );
  console.log(`   📦 Total Mashing Protocols: ${totalProtocols}`);
  console.log(`   🔢 Total Mashing Steps: ${totalSteps}`);
  console.log(
    `   📈 Average Steps per Protocol: ${(totalSteps / totalProtocols).toFixed(
      1
    )}`
  );

  // Break down by creation method
  const fromBackfill = await prisma.mashingProtocol.count({
    where: { createdBy: "backfill-script" },
  });
  const fromCopy = await prisma.mashingProtocol.count({
    where: { createdBy: "copy-by-mashbill-script" },
  });

  console.log("\n📊 Protocols by Creation Method:");
  console.log(`   From Equipment Phase Backfill: ${fromBackfill}`);
  console.log(`   From Mash Bill Copy: ${fromCopy}`);

  if (recipesWithoutProtocols > 0) {
    console.log("\n❌ Recipes still missing protocols:");
    const missing = await prisma.recipe.findMany({
      where: {
        active: true,
        mashingProtocolId: null,
      },
      select: {
        Recipe: true,
        id: true,
      },
    });
    missing.forEach((r) => console.log(`   - ${r.Recipe} (${r.id})`));
  }

  await prisma.$disconnect();
}

async function main() {
  try {
    await verifyAll();
    console.log("\n✅ Verification completed successfully!");
  } catch (error) {
    console.error("❌ Error during verification:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { verifyAll };
