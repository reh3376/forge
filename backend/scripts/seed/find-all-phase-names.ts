#!/usr/bin/env ts-node

/**
 * Find All Equipment Phase Names
 *
 * Discovers all unique equipment phase names in Cook operations.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function findAllPhaseNames() {
  console.log(
    "🔍 Finding all unique equipment phase names in Cook operations...\n"
  );

  const phases = await prisma.equipmentPhase.findMany({
    where: {
      operation: {
        name: "Cook",
      },
      active: true,
    },
    select: {
      name: true,
    },
    distinct: ["name"],
  });

  const phaseNames = phases.map((p) => p.name).sort();

  console.log(`Found ${phaseNames.length} unique phase names:\n`);
  phaseNames.forEach((name) => console.log(`   - ${name}`));

  await prisma.$disconnect();
}

async function main() {
  try {
    await findAllPhaseNames();
    console.log("\n✅ Phase name discovery completed!");
  } catch (error) {
    console.error("❌ Error during discovery:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { findAllPhaseNames };
