#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnosePhases() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  // Get unit procedure with Cook operations
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
      operations: {
        where: {
          name: "Cook",
        },
        select: {
          id: true,
          name: true,
        },
        take: 1,
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  const unitProcedure = unitProcedures.find((up) => up.operations.length > 0);

  if (!unitProcedure) {
    console.log("No unit procedure with Cook operations found");
    return;
  }

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(
    `Unit Procedure: ${unitProcedure.name} (rev: ${unitProcedure.revision})`
  );
  console.log(`Operation ID: ${unitProcedure.operations[0].id}\n`);

  // Get equipment phases
  const equipmentPhases = await prisma.equipmentPhase.findMany({
    where: {
      operationId: unitProcedure.operations[0].id,
      name: {
        in: ["LiquidAdd", "GrainAdd", "AdditiveAdd", "Hold", "Prompt"],
      },
      active: true,
    },
    include: {
      bomItem: {
        select: {
          id: true,
          itemId: true,
          quantity: true,
          item: {
            select: {
              itemNumber: true,
              itemName: true,
              itemGroup: true,
            },
          },
        },
      },
    },
    orderBy: {
      operationSequenceIndex: "asc",
    },
  });

  console.log(`Equipment Phases (${equipmentPhases.length}):\n`);

  for (const phase of equipmentPhases) {
    console.log(`Phase ${phase.operationSequenceIndex}: ${phase.name}`);
    console.log(`  Description: ${phase.description || "None"}`);
    console.log(`  Message: ${phase.message || "None"}`);
    if (phase.bomItem && phase.bomItem.length > 0) {
      console.log(`  BOM Items (${phase.bomItem.length}):`);
      for (const bomItem of phase.bomItem) {
        console.log(
          `    - ${bomItem.item?.itemNumber || "Unknown"} - ${
            bomItem.item?.itemName || "Unknown"
          }`
        );
        console.log(`      ItemId: ${bomItem.itemId}`);
        console.log(`      Quantity: ${bomItem.quantity}`);
        console.log(`      Group: ${bomItem.item?.itemGroup || "null"}`);
      }
    } else {
      console.log("  No BOM items linked");
    }
    console.log();
  }

  await prisma.$disconnect();
}

diagnosePhases();
