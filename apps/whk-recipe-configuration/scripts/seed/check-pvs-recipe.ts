#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPVSRecipe() {
  const recipe = await prisma.recipe.findFirst({
    where: {
      Recipe: "PVS-00-95-00-05-R01",
    },
    select: {
      id: true,
      Recipe: true,
      mashingProtocol: {
        select: {
          id: true,
          name: true,
          steps: {
            orderBy: { index: "asc" },
            select: {
              index: true,
              stepType: true,
              holdType: true,
              temperatureSetpoint: true,
              stepTime: true,
              recipeBomItem: {
                select: {
                  id: true,
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
          },
        },
      },
    },
  });

  if (!recipe) {
    console.log("Recipe not found");
    await prisma.$disconnect();
    return;
  }

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Protocol: ${recipe.mashingProtocol?.name || "NONE"}`);
  console.log("\nSteps:\n");

  recipe.mashingProtocol?.steps.forEach((step) => {
    console.log(
      `Step ${step.index}: ${step.stepType} (${step.holdType}) - Temp: ${step.temperatureSetpoint}, Time: ${step.stepTime}min`
    );
    console.log(`  BOM Items: ${step.recipeBomItem.length}`);
    step.recipeBomItem.forEach((bomItem) => {
      const itemInfo = bomItem.item
        ? `${bomItem.item.itemNumber}: ${bomItem.item.itemName} (${bomItem.item.itemGroup})`
        : `NO ITEM (itemId: ${bomItem.itemId})`;
      console.log(`    - ${itemInfo}`);
    });
    console.log();
  });

  await prisma.$disconnect();
}

checkPVSRecipe();
