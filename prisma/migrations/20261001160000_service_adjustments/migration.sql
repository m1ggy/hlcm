-- Manual credits/charges on a client service's balance (ServiceAdjustment).

-- CreateTable
CREATE TABLE "service_adjustments" (
    "id" TEXT NOT NULL,
    "clientServiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_adjustments_clientServiceId_idx" ON "service_adjustments"("clientServiceId");

-- AddForeignKey
ALTER TABLE "service_adjustments" ADD CONSTRAINT "service_adjustments_clientServiceId_fkey" FOREIGN KEY ("clientServiceId") REFERENCES "client_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_adjustments" ADD CONSTRAINT "service_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

