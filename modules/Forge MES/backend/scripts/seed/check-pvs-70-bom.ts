#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkBom() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  const recipeBom = await prisma.recipeBom.findFirst({
    where: {
      recipe: { some: { id: recipe.id } },
    },
  });

  if (!recipeBom) {
    console.log("No RecipeBom found");
    return;
  }

  const bomItems = await prisma.recipeBomItem.findMany({
    where: {
      recipeBomsId: recipeBom.id,
      itemId: { not: null },
    },
    select: {
      operation: true,
      item: {
        select: {
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
    },
  });

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Total BOM Items (non-null): ${bomItems.length}\n`);

  const byOperation = bomItems.reduce((acc, item) => {
    if (!acc[item.operation]) acc[item.operation] = [];
    acc[item.operation].push(item);
    return acc;
  }, {} as Record<string, typeof bomItems>);

  Object.entries(byOperation).forEach(([op, items]) => {
    console.log(`${op}: ${items.length} items`);
    items.forEach((item) => {
      if (item.item) {
        console.log(
          `  - ${item.item.itemNumber}: ${item.item.itemName} (${item.item.itemGroup})`
        );
      }
    });
    console.log();
  });

  await prisma.$disconnect();
}

checkBom();
