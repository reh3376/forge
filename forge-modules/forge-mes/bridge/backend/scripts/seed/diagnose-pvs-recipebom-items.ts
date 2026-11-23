#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnoseRecipeBomItems() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(`Recipe ID: ${recipe.id}\n`);

  // Get RecipeBom
  const recipeBom = await prisma.recipeBom.findFirst({
    where: {
      recipe: {
        some: { id: recipe.id },
      },
    },
    select: { id: true },
  });

  if (!recipeBom) {
    console.log("No RecipeBom found for this recipe");
    return;
  }

  console.log(`RecipeBom ID: ${recipeBom.id}\n`);

  // Get ALL RecipeBomItems (no operation filter)
  const allBomItems = await prisma.recipeBomItem.findMany({
    where: {
      recipeBomsId: recipeBom.id,
      itemId: { not: null },
    },
    include: {
      item: {
        select: {
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
    },
    orderBy: [{ operation: "asc" }, { item: { itemGroup: "asc" } }],
  });

  console.log(`Total RecipeBomItems (itemId != null): ${allBomItems.length}\n`);

  // Group by operation
  const byOperation = new Map<string, typeof allBomItems>();
  for (const item of allBomItems) {
    const op = item.operation || "NULL";
    const existing = byOperation.get(op) || [];
    existing.push(item);
    byOperation.set(op, existing);
  }

  console.log("=".repeat(80));
  console.log("RECIPE BOM ITEMS GROUPED BY OPERATION");
  console.log("=".repeat(80));

  for (const [operation, items] of byOperation.entries()) {
    console.log(`\n### Operation: ${operation} (${items.length} items)`);
    console.log("-".repeat(80));

    for (const item of items) {
      console.log(
        `  ${item.item?.itemNumber || "Unknown"} - ${
          item.item?.itemName || "Unknown"
        }`
      );
      console.log(`    ItemId: ${item.itemId}`);
      console.log(`    Quantity: ${item.quantity}`);
      console.log(`    Group: ${item.item?.itemGroup || "null"}`);
      console.log();
    }
  }

  // Specifically check for rye items
  console.log("\n" + "=".repeat(80));
  console.log("SEARCHING FOR RYE ITEMS");
  console.log("=".repeat(80));

  const ryeItems = allBomItems.filter(
    (item) =>
      item.item?.itemGroup?.includes("RYE") ||
      item.item?.itemNumber?.includes("RYE") ||
      item.item?.itemName?.toLowerCase().includes("rye")
  );

  if (ryeItems.length > 0) {
    console.log(`\nFound ${ryeItems.length} rye items:\n`);
    for (const item of ryeItems) {
      console.log(`  ${item.item?.itemNumber} - ${item.item?.itemName}`);
      console.log(`    ItemId: ${item.itemId}`);
      console.log(`    Operation: ${item.operation || "NULL"}`);
      console.log(`    Quantity: ${item.quantity}`);
      console.log();
    }
  } else {
    console.log("\n❌ NO RYE ITEMS FOUND IN RECIPEBOM!");
    console.log(
      "This means the rye grain is missing from the RecipeBom entirely."
    );
  }

  await prisma.$disconnect();
}

diagnoseRecipeBomItems();
