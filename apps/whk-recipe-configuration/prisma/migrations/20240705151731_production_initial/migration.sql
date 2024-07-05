-- CreateEnum
CREATE TYPE "EnumPhaseParameterSetpointType" AS ENUM ('Boolean', 'Numeric');

-- CreateEnum
CREATE TYPE "EnumPhaseParameterStaticName" AS ENUM ('Temperature', 'Time', 'Quantity', 'Speed', 'FlowRate', 'SprayballTime', 'Level');

-- CreateEnum
CREATE TYPE "EnumTestParameterTestSetpointType" AS ENUM ('Boolean', 'Numerical');

-- CreateEnum
CREATE TYPE "EnumRecipeParameterRecipeParamUnits" AS ENUM ('Lbs', 'Gal', 'Percentage', 'PassFail', 'Seconds', 'Minutes', 'DateTime', 'Feet', 'Bushels');

-- CreateEnum
CREATE TYPE "EnumRecipeParameterRecipeSetpointType" AS ENUM ('Boolean', 'Numeric');

-- CreateEnum
CREATE TYPE "EnumEquipmentPhaseName" AS ENUM ('Steam', 'Hold', 'BacksetAdd', 'WaterAdd', 'AdditiveAdd', 'CornAdd', 'MaltAdd', 'RyeAdd', 'WheatAdd', 'Drop', 'PhCapture', 'Cooldown', 'Rinse', 'HotFlush', 'Cip', 'Fill', 'Run', 'FermenterSteam', 'CoolerSteam', 'DropTubSteam', 'DropLineSteam', 'DropToMashCooler', 'StillStartup', 'StillShutdown', 'Cut', 'Gauge', 'GrainAdd', 'LiquidAdd', 'Prompt');

-- CreateEnum
CREATE TYPE "EnumEquipmentPhaseStepType" AS ENUM ('Water', 'Backset', 'Corn', 'Rye', 'Wheat', 'Malt', 'Premalt', 'Speciality', 'Enzyme', 'Nutrient', 'Yeast', 'Citric', 'Hold', 'Cool', 'NotRequired', 'Heat', 'Vessel', 'Pipe');

-- CreateEnum
CREATE TYPE "EnumOperationName" AS ENUM ('Cook', 'FermenterSet', 'Fermenter', 'Clean', 'StillRun', 'BlendingTank', 'CisternTank', 'Barreling');

-- CreateEnum
CREATE TYPE "EnumProcedureName" AS ENUM ('Line1');

-- CreateEnum
CREATE TYPE "EnumUnitProcedureName" AS ENUM ('Mashing01', 'Fermentation01', 'Distillation01', 'Processing01', 'Granary01');

-- CreateEnum
CREATE TYPE "EnumProductionOrderStatus" AS ENUM ('Planned', 'Committed', 'Initiated', 'InProgress', 'Complete');

-- CreateEnum
CREATE TYPE "EnumScheduleOrderStatus" AS ENUM ('Created', 'Scheduled', 'InProgress', 'Complete');

-- CreateEnum
CREATE TYPE "EnumPurchaseOrderReceiptStatus" AS ENUM ('NotReceived', 'ReceiptInProgress', 'ReceiptComplete', 'PurchaseOrderComplete', 'InitializedNotReceived', 'ReceivedTested');

-- CreateEnum
CREATE TYPE "EnumAssetType" AS ENUM ('ENT', 'SITE', 'AREA', 'LINE', 'CELL', 'EQUIPMOD', 'EQUIPPHASE', 'CONTROLMOD');

-- CreateEnum
CREATE TYPE "EnumItemReceiptStatus" AS ENUM ('InProgress', 'Complete', 'Rejected', 'Hold');

-- CreateEnum
CREATE TYPE "EnumProductionOrderUnitProcedureAbbreviation" AS ENUM ('MAS', 'FER', 'DIS', 'DPR', 'MIL', 'GLD');

-- CreateEnum
CREATE TYPE "EnumProductionOrderUnitProcedureStatus" AS ENUM ('Initialized', 'Planned', 'Scheduled', 'InProgress', 'Complete', 'Abandoned');

-- CreateEnum
CREATE TYPE "EnumFermentationDayDatumDay" AS ENUM ('First', 'Second', 'Third', 'Final');

-- CreateTable
CREATE TABLE "User" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT,
    "id" TEXT NOT NULL,
    "lastName" TEXT,
    "password" TEXT NOT NULL,
    "roles" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseParameter" (
    "active" BOOLEAN DEFAULT false,
    "classIdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "editedBy" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDef" BOOLEAN NOT NULL DEFAULT false,
    "isStaticParameter" BOOLEAN DEFAULT false,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "recipeId" TEXT,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "setpointBooleanValue" BOOLEAN,
    "setpointLowerLimit" DOUBLE PRECISION,
    "setpointNumericalValue" DOUBLE PRECISION,
    "setpointType" "EnumPhaseParameterSetpointType" NOT NULL,
    "setpointUpperLimit" DOUBLE PRECISION,
    "staticName" "EnumPhaseParameterStaticName",
    "units" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestParameter" (
    "active" BOOLEAN NOT NULL DEFAULT true,
    "classIdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDef" BOOLEAN DEFAULT false,
    "itemReceiptId" TEXT,
    "name" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "testDetails" TEXT,
    "testedAt" TIMESTAMP(3),
    "testedBy" TEXT,
    "testParamRevision" TEXT,
    "testParamUnits" TEXT NOT NULL,
    "testPass" BOOLEAN,
    "testResult" JSONB,
    "testSetpointBooleanValue" BOOLEAN DEFAULT true,
    "testSetpointLowerLimit" DOUBLE PRECISION,
    "testSetpointType" "EnumTestParameterTestSetpointType",
    "testSetpointUpperLimit" DOUBLE PRECISION,
    "testSetpointValue" DOUBLE PRECISION,
    "tooltip" TEXT,
    "updatedAt" TIMESTAMP(3),
    "updatedBy" TEXT,

    CONSTRAINT "TestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeParameter" (
    "active" BOOLEAN NOT NULL DEFAULT true,
    "batch" TEXT,
    "classIdId" TEXT,
    "className" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDefinition" BOOLEAN DEFAULT false,
    "itemId" TEXT NOT NULL,
    "recipeParamDescription" TEXT,
    "recipeParamName" TEXT NOT NULL,
    "recipeParamUnits" "EnumRecipeParameterRecipeParamUnits",
    "recipeSetpointBooleanValue" BOOLEAN DEFAULT true,
    "recipeSetpointLowerLimit" DOUBLE PRECISION,
    "recipeSetpointType" "EnumRecipeParameterRecipeSetpointType" NOT NULL,
    "recipeSetpointUpperLimit" DOUBLE PRECISION,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "sequencerParameters" JSONB,

    CONSTRAINT "RecipeParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instruction" (
    "active" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "editedBy" TEXT,
    "filePath" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentPhase" (
    "active" BOOLEAN DEFAULT true,
    "classIdId" TEXT,
    "className" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDefinition" BOOLEAN DEFAULT false,
    "message" TEXT,
    "name" "EnumEquipmentPhaseName" NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationSequenceIndex" INTEGER,
    "path" TEXT,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "stepType" "EnumEquipmentPhaseStepType" NOT NULL DEFAULT 'NotRequired',

    CONSTRAINT "EquipmentPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "abbreviation" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "auxiliaryPhases" JSONB,
    "classIdId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "editedBy" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDefinition" BOOLEAN DEFAULT false,
    "lotId" TEXT,
    "name" "EnumOperationName" NOT NULL,
    "path" TEXT,
    "procedureSequenceIndex" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "unitProcedureId" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "active" BOOLEAN DEFAULT true,
    "classIdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDefinition" BOOLEAN,
    "name" "EnumProcedureName",
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "itemDescription" TEXT,
    "itemId" TEXT NOT NULL,
    "Recipe" TEXT NOT NULL,
    "recipeGroupId" TEXT,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "bomName" TEXT NOT NULL,
    "bomRevision" TEXT NOT NULL,
    "bomType" TEXT,
    "className" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "editedBy" TEXT,
    "effectiveEndDate" TIMESTAMP(3),
    "effectiveStartDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "erpId" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "inactive" BOOLEAN DEFAULT false,
    "itemId" TEXT NOT NULL,
    "notes" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-alpha',

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOrderQueue" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "nextUnitProcedureId" TEXT NOT NULL,
    "nextUnitProcedureName" TEXT NOT NULL,
    "queueIndex" INTEGER,
    "scheduleOrderId" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ScheduleOrderQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitProcedure" (
    "active" BOOLEAN DEFAULT true,
    "bomsId" TEXT,
    "classIdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDef" BOOLEAN DEFAULT false,
    "name" "EnumUnitProcedureName" NOT NULL,
    "path" TEXT,
    "primaryBomId" TEXT,
    "procedureId" TEXT NOT NULL,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "UnitProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeGroup" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "recipe" TEXT NOT NULL,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "RecipeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "bomsId" TEXT NOT NULL,
    "className" TEXT,
    "complete" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerCode" TEXT,
    "endDate" TIMESTAMP(3),
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "inProcess" BOOLEAN DEFAULT false,
    "fgItemId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeGroupId" TEXT,
    "salesOrderId" TEXT NOT NULL,
    "scheduled" BOOLEAN DEFAULT false,
    "scheduleOrderId" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "startDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "status" "EnumProductionOrderStatus" DEFAULT 'Initiated',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TIMESTAMP(3),

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOrder" (
    "actualEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "customers" JSONB,
    "duration" DECIMAL(65,30),
    "durationUnits" TEXT DEFAULT 'Hours',
    "estimatedDistillationTime" INTEGER,
    "estimatedEnd" TIMESTAMP(3),
    "estimatedFermentationTime" INTEGER,
    "estimatedMashingTime" INTEGER,
    "estimatedProcessing" INTEGER,
    "estimatedStart" TIMESTAMP(3),
    "estimatedTotalProductionTime" INTEGER,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "productionOrderAllocation" JSONB NOT NULL,
    "recipeGroupId" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "scheduleOrderRecipeId" TEXT,
    "status" "EnumScheduleOrderStatus" DEFAULT 'Created',
    "totalBarrels" INTEGER,
    "totalProofGallons" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ScheduleOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "erpId" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "itemClass" TEXT,
    "itemDescription" TEXT,
    "itemGroup" TEXT,
    "itemName" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "itemRevision" INTEGER DEFAULT 0,
    "itemType" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "vendorId" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemGroup" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "customerCode" TEXT,
    "description" TEXT,
    "editedBy" TEXT,
    "email" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "assetId" TEXT,
    "className" TEXT,
    "complete" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "erpId" TEXT NOT NULL,
    "globalId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "lineItems" JSONB,
    "name" TEXT NOT NULL,
    "purchaseOrderReceiptDate" TIMESTAMP(3),
    "purchaseOrderReceived" BOOLEAN DEFAULT false,
    "purchaseOrderRejectedLotsId" TEXT,
    "receiptStatus" "EnumPurchaseOrderReceiptStatus" DEFAULT 'InitializedNotReceived',
    "receivedQuantity" INTEGER,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT,
    "totalOrderQuantity" INTEGER,
    "transactionGroup" TEXT,
    "updatedAt" TIMESTAMP(3),
    "updatedBy" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "customerId" TEXT,
    "customerCode" TEXT,
    "erpId" TEXT,
    "globalId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "lineItems" JSONB,
    "orderType" TEXT,
    "quantity" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" TEXT DEFAULT '0001-alpha',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isClassDefinition" BOOLEAN DEFAULT false,
    "schemaVersion" TEXT,
    "testDescription" TEXT,
    "testName" TEXT NOT NULL,
    "testRevision" INTEGER DEFAULT 0,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "assetPath" TEXT NOT NULL,
    "children" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER DEFAULT 0,
    "schemaVersion" TEXT NOT NULL DEFAULT '0001-alpha',
    "type" "EnumAssetType" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemReceipt" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "loadId" SERIAL,
    "purchaseOrderId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "status" "EnumItemReceiptStatus" DEFAULT 'InProgress',
    "supplierLot" TEXT,
    "testsPassed" BOOLEAN DEFAULT false,
    "units" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "weighIn" DECIMAL(65,30),
    "weighOut" DECIMAL(65,30),

    CONSTRAINT "ItemReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "externalId" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "isRawMaterial" BOOLEAN DEFAULT false,
    "itemId" TEXT,
    "lotNumber" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "purchaseOrderAcceptedLotsId" TEXT,
    "recipeId" TEXT,
    "schemaVersion" TEXT DEFAULT '0001-b',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "bomId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "quantityActual" DECIMAL(65,30),
    "units" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "active" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "unitType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderUnitProcedure" (
    "abbreviation" "EnumProductionOrderUnitProcedureAbbreviation" NOT NULL,
    "bom" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer" TEXT NOT NULL,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "recipeId" TEXT,
    "status" "EnumProductionOrderUnitProcedureStatus",
    "unitProcedureId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT,

    CONSTRAINT "ProductionOrderUnitProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FermentationChemistry" (
    "approved" BOOLEAN DEFAULT false,
    "approvedBy" TEXT,
    "assetId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "lotId" TEXT,
    "operationId" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "settingDataId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FermentationChemistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MashDatum" (
    "assetId" TEXT,
    "backSetPH" DECIMAL(65,30) NOT NULL,
    "backsetVolume" DECIMAL(65,30),
    "balling" DECIMAL(65,30) NOT NULL,
    "cornLbs" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fermentationChemistryId" TEXT,
    "fermenterNumber" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "loggedBy" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "maltLbs" DECIMAL(65,30),
    "pH" DECIMAL(65,30) NOT NULL,
    "ryeLbs" DECIMAL(65,30),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "waterVolume" DECIMAL(65,30) NOT NULL,
    "wheatLbs" DECIMAL(65,30),

    CONSTRAINT "MashDatum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FermentationSettingDatum" (
    "acid" DECIMAL(65,30),
    "balling" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dryInches" DECIMAL(65,30),
    "fermenterNumber" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "loggedBy" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "operationId" TEXT,
    "pH" DECIMAL(65,30),
    "setTime" TIMESTAMP(3) NOT NULL,
    "temperature" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "yeastPitchTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FermentationSettingDatum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FermentationDayDatum" (
    "acid" DECIMAL(65,30) NOT NULL,
    "assetId" TEXT,
    "balling" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" "EnumFermentationDayDatumDay" DEFAULT 'First',
    "dryInches" DECIMAL(65,30),
    "fermentationChemistryId" TEXT,
    "fermenterNumber" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "loggedBy" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "pH" DECIMAL(65,30) NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "temperature" DECIMAL(65,30) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FermentationDayDatum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "batchData" JSONB,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customers" JSONB,
    "id" TEXT NOT NULL,
    "lotId" TEXT,
    "parentId" TEXT,
    "quantity" INTEGER,
    "revision" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "active" BOOLEAN DEFAULT true,
    "additionalDetails" JSONB,
    "contactInformation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "erpId" TEXT,
    "globalId" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EquipmentPhaseToInstruction" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_EquipmentPhaseToPhaseParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_EquipmentPhaseToTestParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_RecipeToUnitProcedure" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ItemToPurchaseOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ItemToSalesOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PurchaseOrderToTestParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_BomItemToEquipmentPhase" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseParameter_globalId_key" ON "PhaseParameter"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseParameter_name_revision_isClassDef_key" ON "PhaseParameter"("name", "revision", "isClassDef");

-- CreateIndex
CREATE UNIQUE INDEX "Instruction_globalId_key" ON "Instruction"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Instruction_name_revision_key" ON "Instruction"("name", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentPhase_globalId_key" ON "EquipmentPhase"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentPhase_name_revision_active_isClassDefinition_key" ON "EquipmentPhase"("name", "revision", "active", "isClassDefinition");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_lotId_key" ON "Operation"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_globalId_key" ON "Procedure"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_name_revision_active_isClassDefinition_key" ON "Procedure"("name", "revision", "active", "isClassDefinition");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_globalId_key" ON "Recipe"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_itemId_customerId_key" ON "Recipe"("itemId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_erpId_key" ON "Bom"("erpId");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_globalId_key" ON "Bom"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrderQueue_globalId_key" ON "ScheduleOrderQueue"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrderQueue_nextUnitProcedureId_key" ON "ScheduleOrderQueue"("nextUnitProcedureId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrderQueue_queueIndex_nextUnitProcedureId_key" ON "ScheduleOrderQueue"("queueIndex", "nextUnitProcedureId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitProcedure_globalId_key" ON "UnitProcedure"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitProcedure_name_revision_active_key" ON "UnitProcedure"("name", "revision", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGroup_globalId_key" ON "RecipeGroup"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGroup_recipe_revision_key" ON "RecipeGroup"("recipe", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_salesOrderId_key" ON "ProductionOrder"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOrder_globalId_key" ON "ScheduleOrder"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_erpId_key" ON "Item"("erpId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_globalId_key" ON "Item"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemGroup_globalId_key" ON "ItemGroup"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_globalId_key" ON "Customer"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_revision_name_key" ON "Customer"("revision", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_erpId_key" ON "PurchaseOrder"("erpId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_globalId_key" ON "PurchaseOrder"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_name_revision_key" ON "PurchaseOrder"("name", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_erpId_key" ON "SalesOrder"("erpId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_globalId_key" ON "SalesOrder"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Test_globalId_key" ON "Test"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetPath_key" ON "Asset"("assetPath");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_globalId_key" ON "Asset"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_name_revision_key" ON "Asset"("name", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ItemReceipt_globalId_key" ON "ItemReceipt"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_externalId_key" ON "Lot"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_globalId_key" ON "Lot"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotNumber_key" ON "Lot"("lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_globalId_key" ON "BomItem"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "FermentationChemistry_lotId_key" ON "FermentationChemistry"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "FermentationChemistry_settingDataId_key" ON "FermentationChemistry"("settingDataId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchId_key" ON "Batch"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_erpId_key" ON "Vendor"("erpId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_globalId_key" ON "Vendor"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToInstruction_AB_unique" ON "_EquipmentPhaseToInstruction"("A", "B");

-- CreateIndex
CREATE INDEX "_EquipmentPhaseToInstruction_B_index" ON "_EquipmentPhaseToInstruction"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToPhaseParameter_AB_unique" ON "_EquipmentPhaseToPhaseParameter"("A", "B");

-- CreateIndex
CREATE INDEX "_EquipmentPhaseToPhaseParameter_B_index" ON "_EquipmentPhaseToPhaseParameter"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentPhaseToTestParameter_AB_unique" ON "_EquipmentPhaseToTestParameter"("A", "B");

-- CreateIndex
CREATE INDEX "_EquipmentPhaseToTestParameter_B_index" ON "_EquipmentPhaseToTestParameter"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToUnitProcedure_AB_unique" ON "_RecipeToUnitProcedure"("A", "B");

-- CreateIndex
CREATE INDEX "_RecipeToUnitProcedure_B_index" ON "_RecipeToUnitProcedure"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToPurchaseOrder_AB_unique" ON "_ItemToPurchaseOrder"("A", "B");

-- CreateIndex
CREATE INDEX "_ItemToPurchaseOrder_B_index" ON "_ItemToPurchaseOrder"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToSalesOrder_AB_unique" ON "_ItemToSalesOrder"("A", "B");

-- CreateIndex
CREATE INDEX "_ItemToSalesOrder_B_index" ON "_ItemToSalesOrder"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PurchaseOrderToTestParameter_AB_unique" ON "_PurchaseOrderToTestParameter"("A", "B");

-- CreateIndex
CREATE INDEX "_PurchaseOrderToTestParameter_B_index" ON "_PurchaseOrderToTestParameter"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BomItemToEquipmentPhase_AB_unique" ON "_BomItemToEquipmentPhase"("A", "B");

-- CreateIndex
CREATE INDEX "_BomItemToEquipmentPhase_B_index" ON "_BomItemToEquipmentPhase"("B");

-- AddForeignKey
ALTER TABLE "PhaseParameter" ADD CONSTRAINT "PhaseParameter_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "PhaseParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestParameter" ADD CONSTRAINT "TestParameter_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "TestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestParameter" ADD CONSTRAINT "TestParameter_itemReceiptId_fkey" FOREIGN KEY ("itemReceiptId") REFERENCES "ItemReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeParameter" ADD CONSTRAINT "RecipeParameter_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "RecipeParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPhase" ADD CONSTRAINT "EquipmentPhase_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "EquipmentPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPhase" ADD CONSTRAINT "EquipmentPhase_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_unitProcedureId_fkey" FOREIGN KEY ("unitProcedureId") REFERENCES "UnitProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "Procedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_recipeGroupId_fkey" FOREIGN KEY ("recipeGroupId") REFERENCES "RecipeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOrderQueue" ADD CONSTRAINT "ScheduleOrderQueue_nextUnitProcedureId_fkey" FOREIGN KEY ("nextUnitProcedureId") REFERENCES "UnitProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOrderQueue" ADD CONSTRAINT "ScheduleOrderQueue_scheduleOrderId_fkey" FOREIGN KEY ("scheduleOrderId") REFERENCES "ScheduleOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitProcedure" ADD CONSTRAINT "UnitProcedure_bomsId_fkey" FOREIGN KEY ("bomsId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitProcedure" ADD CONSTRAINT "UnitProcedure_classIdId_fkey" FOREIGN KEY ("classIdId") REFERENCES "UnitProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitProcedure" ADD CONSTRAINT "UnitProcedure_primaryBomId_fkey" FOREIGN KEY ("primaryBomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitProcedure" ADD CONSTRAINT "UnitProcedure_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomsId_fkey" FOREIGN KEY ("bomsId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_fgItemId_fkey" FOREIGN KEY ("fgItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_recipeGroupId_fkey" FOREIGN KEY ("recipeGroupId") REFERENCES "RecipeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_scheduleOrderId_fkey" FOREIGN KEY ("scheduleOrderId") REFERENCES "ScheduleOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOrder" ADD CONSTRAINT "ScheduleOrder_recipeGroupId_fkey" FOREIGN KEY ("recipeGroupId") REFERENCES "RecipeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOrder" ADD CONSTRAINT "ScheduleOrder_scheduleOrderRecipeId_fkey" FOREIGN KEY ("scheduleOrderRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseOrderRejectedLotsId_fkey" FOREIGN KEY ("purchaseOrderRejectedLotsId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemReceipt" ADD CONSTRAINT "ItemReceipt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemReceipt" ADD CONSTRAINT "ItemReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_purchaseOrderAcceptedLotsId_fkey" FOREIGN KEY ("purchaseOrderAcceptedLotsId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnitProcedure" ADD CONSTRAINT "ProductionOrderUnitProcedure_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnitProcedure" ADD CONSTRAINT "ProductionOrderUnitProcedure_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnitProcedure" ADD CONSTRAINT "ProductionOrderUnitProcedure_unitProcedureId_fkey" FOREIGN KEY ("unitProcedureId") REFERENCES "UnitProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnitProcedure" ADD CONSTRAINT "ProductionOrderUnitProcedure_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationChemistry" ADD CONSTRAINT "FermentationChemistry_settingDataId_fkey" FOREIGN KEY ("settingDataId") REFERENCES "FermentationSettingDatum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MashDatum" ADD CONSTRAINT "MashDatum_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MashDatum" ADD CONSTRAINT "MashDatum_fermentationChemistryId_fkey" FOREIGN KEY ("fermentationChemistryId") REFERENCES "FermentationChemistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationSettingDatum" ADD CONSTRAINT "FermentationSettingDatum_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationDayDatum" ADD CONSTRAINT "FermentationDayDatum_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationDayDatum" ADD CONSTRAINT "FermentationDayDatum_fermentationChemistryId_fkey" FOREIGN KEY ("fermentationChemistryId") REFERENCES "FermentationChemistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationDayDatum" ADD CONSTRAINT "FermentationDayDatum_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FermentationDayDatum" ADD CONSTRAINT "FermentationDayDatum_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToInstruction" ADD CONSTRAINT "_EquipmentPhaseToInstruction_A_fkey" FOREIGN KEY ("A") REFERENCES "EquipmentPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToInstruction" ADD CONSTRAINT "_EquipmentPhaseToInstruction_B_fkey" FOREIGN KEY ("B") REFERENCES "Instruction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToPhaseParameter" ADD CONSTRAINT "_EquipmentPhaseToPhaseParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "EquipmentPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToPhaseParameter" ADD CONSTRAINT "_EquipmentPhaseToPhaseParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "PhaseParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToTestParameter" ADD CONSTRAINT "_EquipmentPhaseToTestParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "EquipmentPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EquipmentPhaseToTestParameter" ADD CONSTRAINT "_EquipmentPhaseToTestParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToUnitProcedure" ADD CONSTRAINT "_RecipeToUnitProcedure_A_fkey" FOREIGN KEY ("A") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToUnitProcedure" ADD CONSTRAINT "_RecipeToUnitProcedure_B_fkey" FOREIGN KEY ("B") REFERENCES "UnitProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToPurchaseOrder" ADD CONSTRAINT "_ItemToPurchaseOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToPurchaseOrder" ADD CONSTRAINT "_ItemToPurchaseOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToSalesOrder" ADD CONSTRAINT "_ItemToSalesOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToSalesOrder" ADD CONSTRAINT "_ItemToSalesOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PurchaseOrderToTestParameter" ADD CONSTRAINT "_PurchaseOrderToTestParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PurchaseOrderToTestParameter" ADD CONSTRAINT "_PurchaseOrderToTestParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BomItemToEquipmentPhase" ADD CONSTRAINT "_BomItemToEquipmentPhase_A_fkey" FOREIGN KEY ("A") REFERENCES "BomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BomItemToEquipmentPhase" ADD CONSTRAINT "_BomItemToEquipmentPhase_B_fkey" FOREIGN KEY ("B") REFERENCES "EquipmentPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
