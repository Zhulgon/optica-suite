-- CreateSequence
CREATE SEQUENCE "Sale_saleNumber_seq";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "saleNumber" INTEGER;

-- Set default for new rows
ALTER TABLE "Sale"
ALTER COLUMN "saleNumber" SET DEFAULT nextval('"Sale_saleNumber_seq"');

-- Backfill existing rows
UPDATE "Sale"
SET "saleNumber" = nextval('"Sale_saleNumber_seq"')
WHERE "saleNumber" IS NULL;

-- Make sequence managed by the column
ALTER SEQUENCE "Sale_saleNumber_seq" OWNED BY "Sale"."saleNumber";

-- Enforce constraints
ALTER TABLE "Sale"
ALTER COLUMN "saleNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");

