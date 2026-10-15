#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkStepTypes() {
  const recipe = await prisma.recipe.findFirst({
    where: {
      Recipe: { contains: "PVS-70-22-00-08" },
    },
    select: {
      Recipe: true,
      mashingProtocol: {
        select: {
          steps: {
            orderBy: { index: "asc" },
            select: {
              index: true,
              stepType: true,
              recipeBomItem: {
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
          },
        },
      },
    },
  });

  if (!recipe?.mashingProtocol) {
    console.log("Recipe or protocol not found");
    await prisma.$disconnect();
    return;
  }

  console.log(`Recipe: ${recipe.Recipe}\n`);
  console.log("Steps and their types:\n");

  recipe.mashingProtocol.steps.forEach((step) => {
    console.log(`Step ${step.index}: ${step.stepType}`);
    step.recipeBomItem.forEach((bomItem) => {
      if (bomItem.item) {
        console.log(
          `  └─ ${bomItem.item.itemNumber}: ${bomItem.item.itemName}`
        );
        console.log(`     Group: ${bomItem.item.itemGroup}`);
      }
    });
    console.log();
  });

  await prisma.$disconnect();
}

checkStepTypes();
