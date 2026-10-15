#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function getEnzymeItemNumbers() {
  console.log("🔍 Getting actual enzyme item numbers...\n");

  try {
    const enzymeConfigs = await prisma.enzymeConfiguration.findMany({
      include: {
        item: {
          select: {
            itemNumber: true,
            itemName: true,
          },
        },
      },
      orderBy: {
        item: {
          itemName: "asc",
        },
      },
    });

    console.log("📦 Enzyme Item Numbers:\n");

    for (const config of enzymeConfigs) {
      console.log(`${config.item.itemName}`);
      console.log(`   Item Number: "${config.item.itemNumber}"`);
      console.log(`   Category: ${config.category}`);
      console.log("");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

getEnzymeItemNumbers();
