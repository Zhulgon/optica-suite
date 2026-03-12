-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing sales so legacy totals remain consistent
UPDATE "Sale"
SET
  "subtotal" = "total",
  "discountType" = 'NONE',
  "discountValue" = 0,
  "discountAmount" = 0,
  "taxPercent" = 0,
  "taxAmount" = 0;

