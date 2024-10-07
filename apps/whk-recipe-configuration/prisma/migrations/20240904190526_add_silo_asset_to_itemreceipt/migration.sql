-- AlterTable
ALTER TABLE "ItemReceipt" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "siloNumber" INTEGER;

-- AddForeignKey
ALTER TABLE "ItemReceipt" ADD CONSTRAINT "ItemReceipt_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
