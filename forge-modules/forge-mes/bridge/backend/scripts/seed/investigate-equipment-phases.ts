#!/usr/bin/env ts-node

/**
 * Investigate Equipment Phases for High-Rye Recipe
 *
 * Checks what equipment phases exist for PVS-00-95-00-05-R01 to understand
 * why it only has 2 mashing steps.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function investigate() {
  console.log("🔍 Investigating Equipment Phases for PVS-00-95-00-05-R01...\n");

  // Get the recipe
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: "PVS-00-95-00-05-R01" },
  });

  if (!recipe) {
    console.log("Recipe not found!");
    return;
  }

  console.log(`Recipe: ${recipe.Recipe} (${recipe.id})`);

  // Get unit procedures for this recipe
  const unitProcedures = await prisma.unitProcedure.findMany({
    where: {
      recipe: {
        some: { id: recipe.id },
      },
    },
    include: {
      operations: {
        where: {
          name: "Cook",
        },
        include: {
          equipmentPhases: {
            where: {
              active: true,
            },
            orderBy: {
              operationSequenceIndex: "asc",
            },
          },
        },
      },
    },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
    take: 3,
  });

  console.log(`\nFound ${unitProcedures.length} UnitProcedures\n`);

  for (const up of unitProcedures) {
    console.log(`\n📦 UnitProcedure: ${up.name} (rev: ${up.revision})`);
    console.log(`   Cook Operations: ${up.operations.length}`);

    for (const op of up.operations) {
      console.log(`\n   🔸 Operation: ${op.name} (${op.id})`);
      console.log(`      Equipment Phases: ${op.equipmentPhases.length}`);

      // Show all phases, not just mashing-related
      for (const phase of op.equipmentPhases) {
        console.log(
          `         ${phase.operationSequenceIndex}: ${phase.name} - ${
            phase.description || "no description"
          }`
        );
      }
    }
  }

  // Also check what mashing-related phases were filtered
  console.log("\n\n🔍 Checking which phases are mashing-related...\n");

  const mashingPhaseNames = [
    "CornAdd",
    "RyeAdd",
    "WheatAdd",
    "MaltAdd",
    "Hold",
    "Steam",
    "Cooldown",
    "PhCapture",
    "Drop",
  ];

  const firstUp = unitProcedures[0];
  if (firstUp && firstUp.operations.length > 0) {
    const firstOp = firstUp.operations[0];
    const allPhases = firstOp.equipmentPhases;
    const mashingPhases = allPhases.filter((p) =>
      mashingPhaseNames.includes(p.name)
    );
    const otherPhases = allPhases.filter(
      (p) => !mashingPhaseNames.includes(p.name)
    );

    console.log(`Total phases: ${allPhases.length}`);
    console.log(`Mashing phases: ${mashingPhases.length}`);
    console.log(`Other phases: ${otherPhases.length}`);

    if (otherPhases.length > 0) {
      console.log("\nOther phase names (not included in mashing protocol):");
      const uniqueOtherNames = [...new Set(otherPhases.map((p) => p.name))];
      uniqueOtherNames.forEach((name) => console.log(`   - ${name}`));
    }
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
