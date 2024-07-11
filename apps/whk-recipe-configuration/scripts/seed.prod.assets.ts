import * as dotenv from "dotenv";
import { EnumAssetType, EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumTestParameterTestSetpointType, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, Recipe, RecipeGroup, SalesOrder } from "@prisma/client";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";

import { AssetCreateInput } from "../src/asset/base/AssetCreateInput";

async function seed() {


  console.info("Seeding database with custom seed for Mashing Recipe...");

  const client = new PrismaClient();

  const assets = [
    {
      // id: "clygzlkz2000308l94m140qt3",
      name: "WH",
      description: "Whiskey House",
      type: "ENT",
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH"
    },
    {
      // id: "clx60pmnc005p10wyhcqz2g48",
      name: "WHK01",
      description: "WHK01",
      type: "SITE",
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01"
    },
    {
      // id: "clx60pmni005q10wyy71x2154",
      name: "Distillery01",
      description: "Distillery01",
      type: "AREA",
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01"
    },
    {
      // id: "clx60pmnl005r10wy5dd6oojb",
      name: "Granary01",
      description: "Granary01",
      type: "CELL",
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01"
    },
    {
      // id: "clx60pmnp005s10wya5804n7y",
      name: "TruckScales",
      description: "TruckScales",
      type: "UNIT",
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/TruckScales"
    },
    // ... (remaining assets follow the same pattern)
  ];

  async function findParentAsset(client: PrismaClient, assetPath: string): Promise<string | null> {
    const parentPath = assetPath.split('/').slice(0, -1).join('/');
    if (parentPath === '') {
      return null;
    }
    const parentAsset = await client.asset.findFirst({
      where: { assetPath: parentPath },
      select: { id: true }
    });
    return parentAsset?.id || null;
  }

  // Modify the asset creation loop
  console.log("Seeding Assets...");
  for (const asset of assets) {
    const existingAsset = await client.asset.findFirst({
      where: { assetPath: asset.assetPath }
    });

    if (existingAsset) {
      console.log(`Asset ${asset.name} already exists. Skipping...`);
    } else {
      const parentId = await findParentAsset(client, asset.assetPath);
      console.log(`Seeding asset: ${asset.name} with parentId: ${parentId}`);
      await client.asset.create({
        data: {
          ...asset,
          schemaVersion: "0001-alpha",
          type: asset.type as EnumAssetType,
          ...(parentId ? { parent: { connect: { id: parentId } } } : {})
        }
      });
    }
  }
  console.log("Assets seeded successfully.");
}

seed();
