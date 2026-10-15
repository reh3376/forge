#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkBomLinkage() {
  // Check the recipe shown in screenshot: PVS-70-00-08-R01
  const recipe = await prisma.recipe.findFirst({
    where: {
      OR: [
        { Recipe: { contains: "PVS-70" } },
        { Recipe: { contains: "00-08" } },
      ],
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
              temperatureSetpoint: true,
              stepTime: true,
              recipeBomItem: {
                select: {
                  id: true,
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
  console.log(`Mashing Protocol: ${recipe.mashingProtocol?.name || "NONE"}`);
  console.log("\nSteps with BOM Items:\n");

  recipe.mashingProtocol?.steps.forEach((step) => {
    const bomCount = step.recipeBomItem.length;
    console.log(`Step ${step.index}: ${step.stepType} - ${bomCount} BOM items`);
    if (bomCount > 0) {
      step.recipeBomItem.forEach((bomItem) => {
        console.log(
          `  - ${bomItem.item?.itemNumber || "NO ITEM"}: ${
            bomItem.item?.itemName || "Unknown"
          }`
        );
      });
    }
  });

  await prisma.$disconnect();
}

checkBomLinkage();
