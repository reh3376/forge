#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPVS() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: "PVS-00-95-00-05-R01" },
    select: {
      mashingProtocol: {
        select: {
          steps: {
            orderBy: { index: "asc" },
            select: {
              index: true,
              stepType: true,
              temperatureSetpoint: true,
              stepTime: true,
            },
          },
        },
      },
    },
  });

  if (!recipe?.mashingProtocol) {
    console.log("No protocol found");
    return;
  }

  console.log("PVS-00-95-00-05-R01 Steps:\n");
  recipe.mashingProtocol.steps.forEach((step) => {
    const temp = step.temperatureSetpoint
      ? `${step.temperatureSetpoint}°F`
      : "null";
    const time = step.stepTime ? `${step.stepTime}min` : "null";
    console.log(
      `${step.index}. ${(step.stepType || "unknown").padEnd(
        12
      )} - Temp: ${temp.padEnd(8)} Time: ${time}`
    );
  });

  await prisma.$disconnect();
}

checkPVS();
