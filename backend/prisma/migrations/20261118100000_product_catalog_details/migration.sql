BEGIN;

ALTER TABLE "Product"
    ADD COLUMN "manufacturerPartNumber" VARCHAR(100),
    ADD COLUMN "purchaseDescription" TEXT,
    ADD COLUMN "salesDescription" TEXT,
    ADD COLUMN "itemNotes" TEXT,
    ADD COLUMN "customFields" JSONB,
    ADD COLUMN "preferredSupplierId" TEXT,
    ADD COLUMN "parentProductId" INTEGER;

CREATE INDEX "Product_preferredSupplierId_idx" ON "Product"("preferredSupplierId");
CREATE INDEX "Product_parentProductId_idx" ON "Product"("parentProductId");

ALTER TABLE "Product"
    ADD CONSTRAINT "Product_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
