#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkParams() {
  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: "PVS-00-95-00-05-R01" },
  });

  if (!recipe) {
    console.log("Recipe not found");
    return;
  }

  const unitProcedure = await prisma.unitProcedure.findFirst({
    where: {
      recipe: { some: { id: recipe.id } },
    },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
  });

  if (!unitProcedure) {
    console.log("Unit procedure not found");
    return;
  }

  const operation = await prisma.operation.findFirst({
    where: {
      name: "Cook",
      unitProcedureId: unitProcedure.id,
    },
  });

  if (!operation) {
    console.log("Cook operation not found");
    return;
  }

  const phases = await prisma.equipmentPhase.findMany({
    where: {
      operationId: operation.id,
      active: true,
    },
    include: {
      phaseParameters: {
        // Remove active filter to see all parameters
        select: {
          name: true,
          staticName: true,
          setpointNumericalValue: true,
          setpointBooleanValue: true,
          setpointType: true,
          active: true,
        },
      },
    },
    orderBy: {
      operationSequenceIndex: "asc",
    },
    take: 10,
  });

  console.log("First 3 Equipment Phases for PVS:\n");
  phases.forEach((phase, i) => {
    console.log(
      `\nPhase ${i + 1}: ${phase.name} (${
        phase.description || "no description"
      })`
    );
    console.log(`Parameters (${phase.phaseParameters.length}):`);
    phase.phaseParameters.forEach((param) => {
      console.log(
        `  - ${param.name} (static: ${param.staticName || "null"}, active: ${
          param.active
        }) = ${
          param.setpointNumericalValue ?? param.setpointBooleanValue ?? "null"
        } [${param.setpointType}]`
      );
    });
  });

  await prisma.$disconnect();
}

checkParams();
