-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "category" TEXT,
ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "Vendor_category_idx" ON "Vendor"("category");

-- CreateIndex
CREATE INDEX "Vendor_categoryId_idx" ON "Vendor"("categoryId");
