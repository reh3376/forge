-- AlterTable
ALTER TABLE "TestParameter" ADD COLUMN     "itemGroup" TEXT;

-- AlterTable
ALTER TABLE "_BomItemToEquipmentPhase" ADD CONSTRAINT "_BomItemToEquipmentPhase_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_BomItemToEquipmentPhase_AB_unique";

-- AlterTable
ALTER TABLE "_CustomerToScheduleOrder" ADD CONSTRAINT "_CustomerToScheduleOrder_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CustomerToScheduleOrder_AB_unique";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToInstruction" ADD CONSTRAINT "_EquipmentPhaseToInstruction_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_EquipmentPhaseToInstruction_AB_unique";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToPhaseParameter" ADD CONSTRAINT "_EquipmentPhaseToPhaseParameter_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_EquipmentPhaseToPhaseParameter_AB_unique";

-- AlterTable
ALTER TABLE "_EquipmentPhaseToTestParameter" ADD CONSTRAINT "_EquipmentPhaseToTestParameter_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_EquipmentPhaseToTestParameter_AB_unique";

-- AlterTable
ALTER TABLE "_ItemOnLots" ADD CONSTRAINT "_ItemOnLots_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ItemOnLots_AB_unique";

-- AlterTable
ALTER TABLE "_ItemToPurchaseOrder" ADD CONSTRAINT "_ItemToPurchaseOrder_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ItemToPurchaseOrder_AB_unique";

-- AlterTable
ALTER TABLE "_ItemToSalesOrder" ADD CONSTRAINT "_ItemToSalesOrder_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ItemToSalesOrder_AB_unique";

-- AlterTable
ALTER TABLE "_MashingProtocolStepToRecipeBomItem" ADD CONSTRAINT "_MashingProtocolStepToRecipeBomItem_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_MashingProtocolStepToRecipeBomItem_AB_unique";

-- AlterTable
ALTER TABLE "_MashingProtocolToProductionOrderRecipeInstance" ADD CONSTRAINT "_MashingProtocolToProductionOrderRecipeInstance_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_MashingProtocolToProductionOrderRecipeInstance_AB_unique";

-- AlterTable
ALTER TABLE "_ProductionOrderRecipeInstanceToRecipeBom" ADD CONSTRAINT "_ProductionOrderRecipeInstanceToRecipeBom_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ProductionOrderRecipeInstanceToRecipeBom_AB_unique";

-- AlterTable
ALTER TABLE "_PurchaseOrderToTestParameter" ADD CONSTRAINT "_PurchaseOrderToTestParameter_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_PurchaseOrderToTestParameter_AB_unique";

-- AlterTable
ALTER TABLE "_RecipeToRecipeBom" ADD CONSTRAINT "_RecipeToRecipeBom_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_RecipeToRecipeBom_AB_unique";

-- AlterTable
ALTER TABLE "_RecipeToRecipeParameter" ADD CONSTRAINT "_RecipeToRecipeParameter_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_RecipeToRecipeParameter_AB_unique";

-- AlterTable
ALTER TABLE "_RecipeToUnitProcedure" ADD CONSTRAINT "_RecipeToUnitProcedure_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_RecipeToUnitProcedure_AB_unique";

-- AlterTable
ALTER TABLE "_inventoryTransfersTo" ADD CONSTRAINT "_inventoryTransfersTo_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_inventoryTransfersTo_AB_unique";

-- CreateTable
CREATE TABLE "_ItemToTestParameter" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ItemToTestParameter_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UnsBrokerConfigurationToUnsConfiguration" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UnsBrokerConfigurationToUnsConfiguration_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ItemToTestParameter_B_index" ON "_ItemToTestParameter"("B");

-- CreateIndex
CREATE INDEX "_UnsBrokerConfigurationToUnsConfiguration_B_index" ON "_UnsBrokerConfigurationToUnsConfiguration"("B");

-- AddForeignKey
ALTER TABLE "_ItemToTestParameter" ADD CONSTRAINT "_ItemToTestParameter_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToTestParameter" ADD CONSTRAINT "_ItemToTestParameter_B_fkey" FOREIGN KEY ("B") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UnsBrokerConfigurationToUnsConfiguration" ADD CONSTRAINT "_UnsBrokerConfigurationToUnsConfiguration_A_fkey" FOREIGN KEY ("A") REFERENCES "UnsBrokerConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UnsBrokerConfigurationToUnsConfiguration" ADD CONSTRAINT "_UnsBrokerConfigurationToUnsConfiguration_B_fkey" FOREIGN KEY ("B") REFERENCES "UnsConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
