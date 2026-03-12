-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT;

-- CreateIndex
CREATE INDEX "Sale_voidedById_idx" ON "Sale"("voidedById");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- AddForeignKey
ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
