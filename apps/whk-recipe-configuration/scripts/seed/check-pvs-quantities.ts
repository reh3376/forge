#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkQuantities() {
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
    include: {
      item: {
        select: {
          id: true,
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
    },
    orderBy: {
      quantity: "desc",
    },
  });

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`RecipeBom ID: ${recipeBom.id}`);
  console.log(`Mashing01 BOM Items: ${bomItems.length}\n`);

  console.log("RecipeBomItems with Quantities:\n");
  bomItems.forEach((bom) => {
    const isGrain = bom.item?.itemGroup?.match(/RM-GR-(BRY|CRN|RYE|WHT)/);
    const marker = isGrain ? "🌾" : "  ";
    console.log(`${marker} ${bom.item?.itemNumber || "Unknown"}`);
    console.log(`   ${bom.item?.itemName || "Unknown"}`);
    console.log(`   Group: ${bom.item?.itemGroup || "null"}`);
    console.log(`   Quantity: ${bom.quantity}`);
    console.log(`   CreatedBy: ${bom.createdBy}`);
    console.log();
  });

  await prisma.$disconnect();
}

checkQuantities();
