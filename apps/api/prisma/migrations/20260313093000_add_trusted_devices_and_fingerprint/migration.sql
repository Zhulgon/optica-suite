-- AlterTable
ALTER TABLE "RefreshToken"
ADD COLUMN "deviceFingerprintHash" TEXT;

-- CreateTable
CREATE TABLE "TrustedDeviceToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceFingerprintHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrustedDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDeviceToken_tokenHash_key" ON "TrustedDeviceToken"("tokenHash");
CREATE INDEX "RefreshToken_deviceFingerprintHash_idx" ON "RefreshToken"("deviceFingerprintHash");
CREATE INDEX "TrustedDeviceToken_userId_idx" ON "TrustedDeviceToken"("userId");
CREATE INDEX "TrustedDeviceToken_deviceFingerprintHash_idx" ON "TrustedDeviceToken"("deviceFingerprintHash");
CREATE INDEX "TrustedDeviceToken_expiresAt_idx" ON "TrustedDeviceToken"("expiresAt");
CREATE INDEX "TrustedDeviceToken_revokedAt_idx" ON "TrustedDeviceToken"("revokedAt");

-- AddForeignKey
ALTER TABLE "TrustedDeviceToken"
ADD CONSTRAINT "TrustedDeviceToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
