-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "optometristId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_optometristId_idx" ON "Appointment"("optometristId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_optometristId_fkey" FOREIGN KEY ("optometristId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
