#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPhaseItems() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  const unitProcedure = await prisma.unitProcedure.findFirst({
    where: {
      recipe: { some: { id: recipe.id } },
    },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
  });

  if (!unitProcedure) {
    console.log("Unit procedure not found");
    return;
  }

  const operation = await prisma.operation.findFirst({
    where: {
      name: "Cook",
      unitProcedureId: unitProcedure.id,
    },
  });

  if (!operation) {
    console.log("Cook operation not found");
    return;
  }

  const phases = await prisma.equipmentPhase.findMany({
    where: {
      operationId: operation.id,
      active: true,
      name: "GrainAdd",
    },
    include: {
      bomItem: {
        select: {
          itemId: true,
          item: {
            select: {
              id: true,
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

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Found ${phases.length} GrainAdd phases\n`);

  phases.forEach((phase, i) => {
    console.log(`Phase ${phase.operationSequenceIndex}: ${phase.name}`);
    console.log(`  BOM Items: ${phase.bomItem.length}`);
    phase.bomItem.forEach((bom) => {
      if (bom.item) {
        console.log(`    - itemId: ${bom.itemId}`);
        console.log(`      ${bom.item.itemNumber}: ${bom.item.itemName}`);
        console.log(`      Group: ${bom.item.itemGroup}`);
      }
    });
    console.log();
  });

  await prisma.$disconnect();
}

checkPhaseItems();
