#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAllBomItems() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: { contains: "PVS-70-22-00-08" } },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  // Get all BOM items from equipment phases (before deduplication)
  const equipmentPhaseBomItems = await prisma.bomItem.findMany({
    where: {
      equipmentPhases: {
        some: {
          operation: {
            unitProcedure: {
              recipe: { some: { id: recipe.id } },
            },
            name: "Cook",
          },
          active: true,
        },
      },
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
      equipmentPhases: {
        where: {
          operation: {
            unitProcedure: {
              recipe: { some: { id: recipe.id } },
            },
            name: "Cook",
          },
          active: true,
        },
        select: {
          name: true,
          operationSequenceIndex: true,
        },
      },
    },
  });

  console.log(`Recipe: ${recipe.Recipe}`);
  console.log(
    `Total Equipment Phase BOM Items: ${equipmentPhaseBomItems.length}\n`
  );

  console.log("All BOM Items (before deduplication):\n");
  equipmentPhaseBomItems.forEach((bomItem, index) => {
    console.log(
      `${index + 1}. ${bomItem.item?.itemNumber || "Unknown"} - ${
        bomItem.item?.itemName || "Unknown"
      }`
    );
    console.log(`   ItemId: ${bomItem.itemId}`);
    console.log(`   Quantity: ${bomItem.quantity}`);
    console.log(`   Group: ${bomItem.item?.itemGroup || "null"}`);
    console.log(
      `   Used in phases: ${bomItem.equipmentPhases
        .map((p) => `${p.name} (${p.operationSequenceIndex})`)
        .join(", ")}`
    );
    console.log();
  });

  // Show what happens after deduplication
  const uniqueEquipmentItems = Array.from(
    new Map(equipmentPhaseBomItems.map((b) => [b.itemId, b])).values()
  );

  console.log("\n" + "=".repeat(80));
  console.log(
    `After Deduplication by itemId: ${uniqueEquipmentItems.length} unique items`
  );
  console.log("=".repeat(80) + "\n");

  uniqueEquipmentItems.forEach((bomItem, index) => {
    console.log(
      `${index + 1}. ${bomItem.item?.itemNumber || "Unknown"} - ${
        bomItem.item?.itemName || "Unknown"
      }`
    );
    console.log(`   ItemId: ${bomItem.itemId}`);
    console.log(`   Quantity: ${bomItem.quantity}`);
    console.log();
  });

  await prisma.$disconnect();
}

checkAllBomItems();
