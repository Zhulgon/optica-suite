-- AlterTable
ALTER TABLE "User"
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorSecret" TEXT,
ADD COLUMN "twoFactorTempSecret" TEXT,
ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_twoFactorEnabled_idx" ON "User"("twoFactorEnabled");
