#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnoseUnitProcedures() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  // Get ALL unit procedures for this recipe
  const unitProcedures = await prisma.unitProcedure.findMany({
    where: {
      recipe: {
        some: { id: recipe.id },
      },
    },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      revision: true,
      createdAt: true,
      operations: {
        where: {
          name: "Cook",
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      },
    },
  });

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Total Unit Procedures: ${unitProcedures.length}\n`);

  for (const up of unitProcedures) {
    console.log(`Unit Procedure: ${up.name}`);
    console.log(`  ID: ${up.id}`);
    console.log(`  Revision: ${up.revision}`);
    console.log(`  Created: ${up.createdAt}`);
    console.log(`  Cook Operations: ${up.operations.length}`);
    if (up.operations.length > 0) {
      console.log(`  Operation ID: ${up.operations[0].id}`);
      console.log(`  Operation Created: ${up.operations[0].createdAt}`);
    }
    console.log();
  }

  // Get the most recent one
  const mostRecentUp = unitProcedures.find((up) => up.operations.length > 0);
  if (mostRecentUp) {
    console.log("===== MOST RECENT WITH COOK OPERATIONS =====");
    console.log(
      `Using: ${mostRecentUp.name} (rev: ${mostRecentUp.revision}, id: ${mostRecentUp.id})`
    );
    console.log(`Operation ID: ${mostRecentUp.operations[0].id}\n`);

    // Check what equipment phases exist for this specific operation
    const phaseCount = await prisma.equipmentPhase.count({
      where: {
        operationId: mostRecentUp.operations[0].id,
        active: true,
      },
    });
    console.log(`Active Equipment Phases for this operation: ${phaseCount}`);
  }

  await prisma.$disconnect();
}

diagnoseUnitProcedures();
