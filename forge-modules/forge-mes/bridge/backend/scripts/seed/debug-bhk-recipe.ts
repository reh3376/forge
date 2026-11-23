#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugBHK() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: "BHK-00-95-00-05-R01" },
    include: {
      unitProcedure: {
        include: {
          operations: {
            where: { name: "Cook" },
          },
        },
      },
    },
  });

  if (!recipe) {
    console.log("❌ Recipe not found");
    return;
  }

  console.log(`✅ Recipe found: ${recipe.Recipe} (${recipe.id})`);
  console.log(`   Active: ${recipe.active}`);
  console.log(`   Unit Procedures: ${recipe.unitProcedure.length}`);

  if (recipe.unitProcedure.length === 0) {
    console.log("\n❌ No unit procedures linked to this recipe");

    // Check if any unit procedures exist with this recipe name pattern
    const unitProcs = await prisma.unitProcedure.findMany({
      where: {
        name: { contains: "BHK" },
      },
      include: {
        recipe: true,
        operations: {
          where: { name: "Cook" },
          include: {
            equipmentPhases: {
              where: { active: true },
              take: 3,
            },
          },
        },
      },
      take: 5,
    });

    console.log(`\nFound ${unitProcs.length} BHK-related unit procedures:`);
    unitProcs.forEach((up) => {
      console.log(`\n- ${up.name} (rev: ${up.revision})`);
      console.log(
        `  Linked recipes: ${
          up.recipe.map((r) => r.Recipe).join(", ") || "none"
        }`
      );
      console.log(`  Cook operations: ${up.operations.length}`);
      up.operations.forEach((op) => {
        console.log(
          `    Operation: ${op.name} - ${op.equipmentPhases.length} phases`
        );
      });
    });
  } else {
    recipe.unitProcedure.forEach((up) => {
      console.log(`\n- UnitProcedure: ${up.name} (rev: ${up.revision})`);
      console.log(`  Cook operations: ${up.operations.length}`);
    });
  }

  await prisma.$disconnect();
}

debugBHK();
