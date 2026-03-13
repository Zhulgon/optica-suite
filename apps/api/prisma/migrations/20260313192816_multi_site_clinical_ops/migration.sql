-- CreateEnum
CREATE TYPE "ClinicalHistoryStatus" AS ENUM ('DRAFT', 'SIGNED');

-- AlterTable
ALTER TABLE "ClinicalHistory" ADD COLUMN     "completionScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completionWarnings" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedById" TEXT,
ADD COLUMN     "siteId" TEXT,
ADD COLUMN     "sourceFileName" TEXT,
ADD COLUMN     "status" "ClinicalHistoryStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "LabOrder" ADD COLUMN     "siteId" TEXT,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "siteId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "siteId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "siteId" TEXT;

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE INDEX "Site_code_idx" ON "Site"("code");

-- CreateIndex
CREATE INDEX "Site_isActive_idx" ON "Site"("isActive");

-- CreateIndex
CREATE INDEX "ClinicalHistory_siteId_idx" ON "ClinicalHistory"("siteId");

-- CreateIndex
CREATE INDEX "ClinicalHistory_status_idx" ON "ClinicalHistory"("status");

-- CreateIndex
CREATE INDEX "ClinicalHistory_signedById_idx" ON "ClinicalHistory"("signedById");

-- CreateIndex
CREATE INDEX "LabOrder_siteId_idx" ON "LabOrder"("siteId");

-- CreateIndex
CREATE INDEX "Patient_siteId_idx" ON "Patient"("siteId");

-- CreateIndex
CREATE INDEX "Sale_siteId_idx" ON "Sale"("siteId");

-- CreateIndex
CREATE INDEX "User_siteId_idx" ON "User"("siteId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalHistory" ADD CONSTRAINT "ClinicalHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalHistory" ADD CONSTRAINT "ClinicalHistory_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
