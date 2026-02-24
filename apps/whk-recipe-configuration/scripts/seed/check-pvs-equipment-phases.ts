#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkEquipmentPhases() {
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
    },
    include: {
      bomItem: {
        select: {
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

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Found ${phases.length} equipment phases\n`);

  phases.forEach((phase, i) => {
    console.log(`Phase ${i + 1}: ${phase.name}`);
    console.log(`  Description: ${phase.description || "none"}`);
    console.log(`  BOM Items: ${phase.bomItem.length}`);
    phase.bomItem.forEach((bom) => {
      if (bom.item) {
        console.log(`    - ${bom.item.itemNumber}: ${bom.item.itemName}`);
        console.log(`      Group: ${bom.item.itemGroup}`);
      }
    });
    console.log();
  });

  await prisma.$disconnect();
}

checkEquipmentPhases();
