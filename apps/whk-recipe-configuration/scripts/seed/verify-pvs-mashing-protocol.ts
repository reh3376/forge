#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyProtocol() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
    include: {
      mashingProtocol: {
        include: {
          steps: {
            include: {
              recipeBomItem: {
                include: {
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
              index: "asc",
            },
          },
        },
      },
    },
  });

  if (!recipe || !recipe.mashingProtocol) {
    console.log("Recipe or mashing protocol not found");
    return;
  }

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Mashing Protocol: ${recipe.mashingProtocol.name}`);
  console.log(`\nMashing Protocol Steps:\n`);

  for (const step of recipe.mashingProtocol.steps) {
    console.log(`Step ${step.index}: ${step.stepType}`);
    if (step.recipeBomItem && step.recipeBomItem.length > 0) {
      console.log(`  Linked BOM Items (${step.recipeBomItem.length}):`);
      for (const bomItem of step.recipeBomItem) {
        console.log(
          `    - ${bomItem.item?.itemNumber || "Unknown"} - ${
            bomItem.item?.itemName || "Unknown"
          }`
        );
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

verifyProtocol();
