-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('PENDING', 'SENT_TO_LAB', 'RECEIVED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "saleId" TEXT,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "lensDetails" TEXT,
    "labName" TEXT,
    "responsible" TEXT,
    "promisedDate" TIMESTAMP(3),
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabOrder_status_idx" ON "LabOrder"("status");

-- CreateIndex
CREATE INDEX "LabOrder_patientId_idx" ON "LabOrder"("patientId");

-- CreateIndex
CREATE INDEX "LabOrder_saleId_idx" ON "LabOrder"("saleId");

-- CreateIndex
CREATE INDEX "LabOrder_createdById_idx" ON "LabOrder"("createdById");

-- CreateIndex
CREATE INDEX "LabOrder_updatedById_idx" ON "LabOrder"("updatedById");

-- CreateIndex
CREATE INDEX "LabOrder_promisedDate_idx" ON "LabOrder"("promisedDate");

-- CreateIndex
CREATE INDEX "LabOrder_createdAt_idx" ON "LabOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
