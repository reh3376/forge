-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "inventoryLogId" TEXT;

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "schemaVersion" TEXT,
    "assetId" TEXT NOT NULL,
    "revision" INTEGER DEFAULT 0,
    "correctionNote" TEXT,
    "correctedBy" TEXT,
    "lotNumber" TEXT,
    "itemId" TEXT NOT NULL,
    "notes" TEXT,
    "units" TEXT,
    "globalId" TEXT,
    "customers" JSONB,
    "proof" DECIMAL(65,30),
    "fifoIndex" INTEGER DEFAULT 0,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "loggedBy" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "revision" INTEGER DEFAULT 0,
    "revisedBy" TEXT,
    "rawMeasurementValue" TEXT,
    "rawMeasurementUnits" TEXT,
    "units" TEXT NOT NULL,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fromAssetId" TEXT,
    "notes" TEXT,
    "department" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "quantity" INTEGER,
    "itemId" TEXT,
    "lotId" TEXT,
    "globalId" TEXT,

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_inventoryTransfersTo" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_globalId_key" ON "Inventory"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_assetId_fifoIndex_key" ON "Inventory"("assetId", "fifoIndex");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_globalId_key" ON "InventoryTransfer"("globalId");

-- CreateIndex
CREATE UNIQUE INDEX "_inventoryTransfersTo_AB_unique" ON "_inventoryTransfersTo"("A", "B");

-- CreateIndex
CREATE INDEX "_inventoryTransfersTo_B_index" ON "_inventoryTransfersTo"("B");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_inventoryLogId_fkey" FOREIGN KEY ("inventoryLogId") REFERENCES "InventoryLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inventoryTransfersTo" ADD CONSTRAINT "_inventoryTransfersTo_A_fkey" FOREIGN KEY ("A") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inventoryTransfersTo" ADD CONSTRAINT "_inventoryTransfersTo_B_fkey" FOREIGN KEY ("B") REFERENCES "InventoryTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
