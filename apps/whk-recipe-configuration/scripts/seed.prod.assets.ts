import * as dotenv from "dotenv";
import { EnumAssetAssetType, EnumEquipmentPhaseName, EnumEquipmentPhaseStepType, EnumOperationName, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumProductionOrderStatus, EnumScheduleOrderStatus, EnumTestParameterTestSetpointType, EnumUnitProcedureName, Item, Operation, PhaseParameter, PrismaClient, Procedure, Recipe, RecipeGroup, SalesOrder } from "@prisma/client";
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
      assetType: EnumAssetAssetType.ENT,
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH",
    },
    {
      // id: "clx60pmnc005p10wyhcqz2g48",
      name: "WHK01",
      description: "WHK01",
      assetType: EnumAssetAssetType.SITE,
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
      assetType: EnumAssetAssetType.AREA,
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
      assetType: EnumAssetAssetType.CELL,
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
      assetType: EnumAssetAssetType.UNIT,
      revision: 1,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/TruckScales"
    },
    // ... (remaining assets follow the same pattern)
    {
      name: "SamplingRobot",
      description: "SamplingRobot",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SamplingRobot"
    },
    {
      name: "DumpPit",
      description: "DumpPit",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/DumpPit"
    },
    {
      name: "BucketElevator",
      description: "BucketElevator",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/BucketElevator"
    },
    {
      name: "GrainDistributionHead",
      description: "GrainDistributionHead",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/GrainDistributionHead"
    },
    {
      name: "SIL-025",
      description: "SIL-025",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-025"
    },
    {
      name: "SIL-030",
      description: "SIL-030",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-030"
    },
    {
      name: "SIL-035",
      description: "SIL-035",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-035"
    },
    {
      name: "SIL-040",
      description: "SIL-040",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-040"
    },
    {
      name: "SIL-045",
      description: "SIL-045",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-045"
    },
    {
      name: "SIL-050",
      description: "SIL-050",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-050"
    },
    {
      name: "CNV-050",
      description: "CNV-050",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-050"
    },
    {
      name: "CNV-055",
      description: "CNV-055",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-055"
    },
    {
      name: "SIL-060",
      description: "SIL-060",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-060"
    },
    {
      name: "Magnet",
      description: "Magnet",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/Magnet"
    },
    {
      name: "MIL-070",
      description: "MIL-070",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/MIL-070"
    },
    {
      name: "DC-075",
      description: "DC-075",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/DC-075"
    },
    {
      name: "CNV-105",
      description: "CNV-105",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-105"
    },
    {
      name: "SIL-110",
      description: "SIL-110",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-110"
    },
    {
      name: "SIL-125",
      description: "SIL-125",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-125"
    },
    {
      name: "CNV-130",
      description: "CNV-130",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-130"
    },
    {
      name: "SIL-115",
      description: "SIL-115",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-115"
    },
    {
      name: "SIL-135",
      description: "SIL-135",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-135"
    },
    {
      name: "CNV-140",
      description: "CNV-140",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-140"
    },
    {
      name: "SIL-120",
      description: "SIL-120",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-120"
    },
    {
      name: "SIL-145",
      description: "SIL-145",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/SIL-145"
    },
    {
      name: "CNV-150",
      description: "CNV-150",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-150"
    },
    {
      name: "CNV-155",
      description: "CNV-155",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Granary01/CNV-155"
    },
    {
      name: "Mashing01",
      description: "Mashing01",
      assetType: EnumAssetAssetType.CELL,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Mashing01"
    },
    {
      name: "T-200",
      description: "T-200",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Mashing01/T-200"
    },
    {
      name: "T-201",
      description: "T-201",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Mashing01/T-201"
    },
    {
      name: "T-202",
      description: "T-202",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Mashing01/T-202"
    },
    {
      name: "T-204",
      description: "T-204",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Mashing01/T-204"
    },
    {
      name: "Fermentation01",
      description: "Fermentation01",
      assetType: EnumAssetAssetType.CELL,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01"
    },
    {
      name: "HEX-2040A",
      description: "HEX-2040A",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/HEX-2040A"
    },
    {
      name: "HEX-2040B",
      description: "HEX-2040B",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/HEX-2040B"
    },
    {
      name: "HEX-2040C",
      description: "HEX-2040C",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/HEX-2040C"
    },
    {
      name: "HEX-2040D",
      description: "HEX-2040D",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/HEX-2040D"
    },
    {
      name: "T-301",
      description: "T-301",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-301"
    },
    {
      name: "T-302",
      description: "T-302",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-302"
    },
    {
      name: "T-303",
      description: "T-303",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-303"
    },
    {
      name: "T-304",
      description: "T-304",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-304"
    },
    {
      name: "T-305",
      description: "T-305",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-305"
    },
    {
      name: "T-306",
      description: "T-306",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-306"
    },
    {
      name: "T-307",
      description: "T-307",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-307"
    },
    {
      name: "T-308",
      description: "T-308",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-308"
    },
    {
      name: "T-309",
      description: "T-309",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-309"
    },
    {
      name: "T-310",
      description: "T-310",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-310"
    },
    {
      name: "T-311",
      description: "T-311",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-311"
    },
    {
      name: "T-312",
      description: "T-312",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-312"
    },
    {
      name: "T-313",
      description: "T-313",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-313"
    },
    {
      name: "T-314",
      description: "T-314",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Fermentation01/T-314"
    },
    {
      name: "Distillation01",
      description: "Distillation01",
      assetType: EnumAssetAssetType.CELL,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01"
    },
    {
      name: "T-4002",
      description: "T-4002",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-4002"
    },
    {
      name: "PMP-4000A",
      description: "PMP-4000A",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-4000A"
    },
    {
      name: "PMP-4000B",
      description: "PMP-4000B",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-4000B"
    },
    {
      name: "C-401",
      description: "C-401",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/C-401"
    },
    {
      name: "T-4057",
      description: "T-4057",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-4057"
    },
    {
      name: "C-410",
      description: "C-410",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/C-410"
    },
    {
      name: "T-414",
      description: "T-414",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-414"
    },
    {
      name: "T-413",
      description: "T-413",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-413"
    },
    {
      name: "T-421",
      description: "T-421",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-421"
    },
    {
      name: "T-422",
      description: "T-422",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-422"
    },
    {
      name: "T-430",
      description: "T-430",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-430"
    },
    {
      name: "S-430",
      description: "S-430",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/S-430"
    },
    {
      name: "T-435",
      description: "T-435",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-435"
    },
    {
      name: "T-431",
      description: "T-431",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-431"
    },
    {
      name: "T-432",
      description: "T-432",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-432"
    },
    {
      name: "T-433",
      description: "T-433",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-433"
    },
    {
      name: "T-434",
      description: "T-434",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-434"
    },
    {
      name: "StillageLoadout",
      description: "StillageLoadout",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/StillageLoadout"
    },
    {
      name: "T-602",
      description: "T-602",
      assetType: EnumAssetAssetType.UNIT,
      revision: 0,
      createdAt: new Date("2024-07-11T03:07:00.000Z"),
      createdBy: "pmannion@whiskeyhouse.com",
      updatedAt: new Date("2024-07-11T03:08:00.000Z"),
      updatedBy: "pmannion@whiskeyhouse.com",
      assetPath: "WH/WHK01/Distillery01/Distillation01/T-602"
    }
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
          assetType: asset.assetType as EnumAssetAssetType,
          ...(parentId ? { parent: { connect: { id: parentId } } } : {})
        }
      });
    }
  }
  console.log("Assets seeded successfully.");
}

seed();
