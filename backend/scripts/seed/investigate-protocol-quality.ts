#!/usr/bin/env ts-node

/**
 * Investigate Protocol Quality
 *
 * Checks if protocols have appropriate step counts and identifies outliers.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function investigate() {
  console.log("🔍 Investigating Protocol Quality...\n");

  // Get step count distribution
  const protocols = await prisma.mashingProtocol.findMany({
    include: {
      steps: true,
      recipes: {
        select: {
          Recipe: true,
        },
      },
    },
  });

  const stepCounts = protocols.map((p) => ({
    name: p.name,
    recipe: p.recipes.map((r) => r.Recipe).join(", "),
    steps: p.steps.length,
    createdBy: p.createdBy,
  }));

  // Sort by step count
  stepCounts.sort((a, b) => a.steps - b.steps);

  console.log("Protocols with FEWEST steps:");
  stepCounts.slice(0, 10).forEach((p) => {
    console.log(`  ${p.recipe}: ${p.steps} steps (${p.createdBy})`);
  });

  console.log("\n\nProtocols with MOST steps:");
  stepCounts.slice(-10).forEach((p) => {
    console.log(`  ${p.recipe}: ${p.steps} steps (${p.createdBy})`);
  });

  // Check average by creation method
  const backfillProtocols = stepCounts.filter(
    (p) => p.createdBy === "backfill-script"
  );
  const copyProtocols = stepCounts.filter(
    (p) => p.createdBy === "copy-by-mashbill-script"
  );

  const avgBackfill =
    backfillProtocols.reduce((sum, p) => sum + p.steps, 0) /
    backfillProtocols.length;
  const avgCopy =
    copyProtocols.reduce((sum, p) => sum + p.steps, 0) / copyProtocols.length;

  console.log("\n\nAverage Steps by Creation Method:");
  console.log(
    `  Backfill from Equipment Phases: ${avgBackfill.toFixed(1)} steps`
  );
  console.log(`  Copy from Mash Bill: ${avgCopy.toFixed(1)} steps`);

  // Investigate specific recipe
  console.log("\n\nDetailed look at PVS-00-95-00-05-R01 (donor for BHK):");
  const pvs = await prisma.recipe.findFirst({
    where: { Recipe: "PVS-00-95-00-05-R01" },
    include: {
      mashingProtocol: {
        include: {
          steps: {
            orderBy: { index: "asc" },
          },
        },
      },
    },
  });

  if (pvs && pvs.mashingProtocol) {
    console.log(`  Protocol: ${pvs.mashingProtocol.name}`);
    console.log(`  Created by: ${pvs.mashingProtocol.createdBy}`);
    console.log(`  Steps: ${pvs.mashingProtocol.steps.length}`);
    pvs.mashingProtocol.steps.forEach((s) => {
      console.log(
        `    Step ${s.index}: ${s.stepType} (${s.holdType}) - ${s.temperatureSetpoint}°F, ${s.stepTime}min`
      );
    });
  }

  await prisma.$disconnect();
}

async function main() {
  try {
    await investigate();
    console.log("\n✅ Investigation completed!");
  } catch (error) {
    console.error("❌ Error during investigation:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { investigate };
