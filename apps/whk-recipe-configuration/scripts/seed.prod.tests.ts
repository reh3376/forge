import * as dotenv from "dotenv";
import {
  EnumEquipmentPhaseName,
  EnumEquipmentPhaseStepType,
  EnumOperationName,
  EnumPhaseParameterSetpointType,
  EnumPhaseParameterStaticName,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumTestParameterTestSetpointType,
  EnumUnitProcedureName,
  Item,
  Operation,
  PhaseParameter,
  PrismaClient,
  Procedure,
  Recipe,
  RecipeGroup,
  SalesOrder,
} from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

async function seed() {
  console.info("Seeding database with custom seed for Mashing Recipe...");

  const client = new PrismaClient();

  const testParameters = [
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:50:39.211Z"),
      createdBy: "pmannion",
      name: "Prarie Protein Test",
      description: "Prarie Protein Test",
      testParamUnits: "%",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 100,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:51:35.351Z"),
      createdBy: "pmannion",
      name: "Neogen Alfatoxin Test",
      description: "Neogen Alfatoxin Test",
      testParamUnits: "ppb",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 15,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:53:54.296Z"),
      createdBy: "pmannion",
      name: "Prarie Moisture Test",
      description: "Prarie Moisture Test",
      testParamUnits: "%",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 100,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:54:27.673Z"),
      createdBy: "pmannion",
      name: "Prarie Starch Test",
      description: "Prarie Starch Test",
      testParamUnits: "%",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 100,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:55:46.599Z"),
      createdBy: "pmannion",
      name: "Prarie Specific Weight Test",
      description: "Prarie Specific Weight Test",
      testParamUnits: "lbs/bshl",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 200,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:57:52.153Z"),
      createdBy: "pmannion",
      name: "Leco Nitrogen Test",
      description: "Leco Nitrogen Test",
      testParamUnits: "N/A",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 1000,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T16:58:41.208Z"),
      createdBy: "pmannion",
      name: "Sensory Odor Test",
      description: "Sensory Odor Test",
      testParamUnits: "Pass/Fail",
      testSetpointType: EnumTestParameterTestSetpointType.Boolean,
      testParamRevision: null,
    },
    {
      active: true,
      isClassDef: true,
      createdAt: new Date("2024-06-21T17:21:47.205Z"),
      createdBy: "pmannion",
      name: "Foreign Material",
      description: "Foreign Material",
      testParamUnits: "%",
      testSetpointType: EnumTestParameterTestSetpointType.Numerical,
      testSetpointUpperLimit: 50,
      testSetpointLowerLimit: 0,
      testParamRevision: "0",
    },
  ];

  console.log("Seeding TestParameters...");
  for (const param of testParameters) {
    await client.testParameter.create({
      data: param,
    });
  }
  console.log("TestParameter classes seeded successfully.");
}

seed();
