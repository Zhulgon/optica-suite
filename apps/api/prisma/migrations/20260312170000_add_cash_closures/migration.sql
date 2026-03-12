-- CreateTable
CREATE TABLE "CashClosure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "totalSales" DOUBLE PRECISION NOT NULL,
    "cashSales" DOUBLE PRECISION NOT NULL,
    "cardSales" DOUBLE PRECISION NOT NULL,
    "transferSales" DOUBLE PRECISION NOT NULL,
    "mixedSales" DOUBLE PRECISION NOT NULL,
    "expectedCash" DOUBLE PRECISION NOT NULL,
    "declaredCash" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashClosure_userId_idx" ON "CashClosure"("userId");

-- CreateIndex
CREATE INDEX "CashClosure_closedById_idx" ON "CashClosure"("closedById");

-- CreateIndex
CREATE INDEX "CashClosure_createdAt_idx" ON "CashClosure"("createdAt");

-- CreateIndex
CREATE INDEX "CashClosure_periodStart_periodEnd_idx" ON "CashClosure"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
