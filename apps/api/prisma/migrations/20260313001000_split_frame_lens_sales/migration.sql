-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "frameSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lensSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lensCostTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SaleLensItem" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "labOrderId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitSalePrice" DOUBLE PRECISION NOT NULL,
  "unitLabCost" DOUBLE PRECISION NOT NULL,
  "subtotalSale" DOUBLE PRECISION NOT NULL,
  "subtotalCost" DOUBLE PRECISION NOT NULL,

  CONSTRAINT "SaleLensItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleLensItem_saleId_idx" ON "SaleLensItem"("saleId");
CREATE INDEX "SaleLensItem_labOrderId_idx" ON "SaleLensItem"("labOrderId");

-- AddForeignKey
ALTER TABLE "SaleLensItem"
ADD CONSTRAINT "SaleLensItem_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleLensItem"
ADD CONSTRAINT "SaleLensItem_labOrderId_fkey"
FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy sales
UPDATE "Sale"
SET
  "frameSubtotal" = "subtotal",
  "lensSubtotal" = 0,
  "lensCostTotal" = 0,
  "grossProfit" = "total";

