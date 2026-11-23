#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProtocol() {
  // Find the mashing protocol directly
  const protocol = await prisma.mashingProtocol.findFirst({
    where: {
      name: {
        contains: "PVS-70-22-00-08-R01",
      },
    },
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
  });

  if (!protocol) {
    console.log("Mashing protocol not found");
    return;
  }

  console.log(`Mashing Protocol: ${protocol.name}`);
  console.log(`Total Steps: ${protocol.steps.length}\n`);

  for (const step of protocol.steps) {
    console.log(`Step ${step.index}: ${step.stepType}`);
    if (step.recipeBomItem && step.recipeBomItem.length > 0) {
      console.log(`  BOM Items (${step.recipeBomItem.length}):`);
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

checkProtocol();
