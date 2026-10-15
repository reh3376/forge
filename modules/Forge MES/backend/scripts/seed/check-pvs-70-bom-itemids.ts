#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkBomItemIds() {
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
    console.log("RecipeBom not found");
    return;
  }

  const bomItems = await prisma.recipeBomItem.findMany({
    where: {
      recipeBomsId: recipeBom.id,
      operation: "Mashing01",
      itemId: { not: null },
    },
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
  });

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`RecipeBom ID: ${recipeBom.id}`);
  console.log(`Mashing01 BOM Items: ${bomItems.length}\n`);

  console.log("Equipment Phase ItemIds we need to match:");
  console.log("  - clyd1ofw0009ufd45hlzpnqa9 (Malt)");
  console.log("  - clyd1ofw1009wfd45oghso7y5 (Corn)");
  console.log("  - clyd1ofy600d9fd45p99px0c0 (Rye)\n");

  console.log("RecipeBomItem ItemIds:\n");
  bomItems.forEach((bom) => {
    const match = [
      "clyd1ofw0009ufd45hlzpnqa9",
      "clyd1ofw1009wfd45oghso7y5",
      "clyd1ofy600d9fd45p99px0c0",
    ].includes(bom.itemId || "");
    const marker = match ? "✓ MATCH" : "  ";
    console.log(`${marker} itemId: ${bom.itemId}`);
    if (bom.item) {
      console.log(`     ${bom.item.itemNumber}: ${bom.item.itemName}`);
      console.log(`     Group: ${bom.item.itemGroup}`);
    }
    console.log();
  });

  await prisma.$disconnect();
}

checkBomItemIds();
