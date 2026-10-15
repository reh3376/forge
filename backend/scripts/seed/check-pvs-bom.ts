#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPVSBom() {
  const recipe = await prisma.recipe.findFirst({
    where: {
      Recipe: "PVS-00-95-00-05-R01",
    },
    select: {
      id: true,
      Recipe: true,
    },
  });

  if (!recipe) {
    console.log("Recipe not found");
    await prisma.$disconnect();
    return;
  }

  console.log(`Recipe: ${recipe.Recipe} (${recipe.id})\n`);

  // Find RecipeBom
  const recipeBom = await prisma.recipeBom.findFirst({
    where: {
      recipe: {
        some: {
          id: recipe.id,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!recipeBom) {
    console.log("❌ No RecipeBom found for this recipe!");
    await prisma.$disconnect();
    return;
  }

  console.log(`RecipeBom ID: ${recipeBom.id}\n`);

  // Get all BOM items
  const allBomItems = await prisma.recipeBomItem.findMany({
    where: {
      recipeBomsId: recipeBom.id,
    },
    select: {
      id: true,
      operation: true,
      itemId: true,
      item: {
        select: {
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
    },
  });

  console.log(`Total BOM Items: ${allBomItems.length}`);

  const mashingItems = allBomItems.filter(
    (item) => item.operation === "Mashing01"
  );
  console.log(`Mashing01 BOM Items: ${mashingItems.length}`);

  console.log("\nAll BOM Items by Operation:");
  const byOperation = allBomItems.reduce((acc, item) => {
    if (!acc[item.operation]) acc[item.operation] = [];
    acc[item.operation].push(item);
    return acc;
  }, {} as Record<string, typeof allBomItems>);

  Object.entries(byOperation).forEach(([op, items]) => {
    console.log(`\n${op}: ${items.length} items`);
    items.forEach((item) => {
      const itemInfo = item.item
        ? `${item.item.itemNumber}: ${item.item.itemName}`
        : `NULL (itemId: ${item.itemId})`;
      console.log(`  - ${itemInfo}`);
    });
  });

  await prisma.$disconnect();
}

checkPVSBom();
