
-- CreateEnum
CREATE TYPE "PayrollMethod" AS ENUM ('DIRECT_DEPOSIT', 'CHECK', 'WISE', 'CASH', 'OTHER');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'PAYROLL_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'PAYROLL_PROBLEM_REPORTED';

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "breakHours" DOUBLE PRECISION NOT NULL,
    "hourlyRate" DOUBLE PRECISION,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "method" "PayrollMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidOn" DATE NOT NULL,
    "markedById" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "problemReportedAt" TIMESTAMP(3),
    "problemNote" TEXT,
    "problemResolvedAt" TIMESTAMP(3),
    "problemResolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_attachments" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "payrollPaymentId" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_startDate_endDate_key" ON "pay_periods"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "payroll_payments_userId_idx" ON "payroll_payments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_payPeriodId_userId_key" ON "payroll_payments"("payPeriodId", "userId");

-- CreateIndex
CREATE INDEX "payroll_attachments_payPeriodId_idx" ON "payroll_attachments"("payPeriodId");

-- CreateIndex
CREATE INDEX "payroll_attachments_payrollPaymentId_idx" ON "payroll_attachments"("payrollPaymentId");

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_problemResolvedById_fkey" FOREIGN KEY ("problemResolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_attachments" ADD CONSTRAINT "payroll_attachments_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_attachments" ADD CONSTRAINT "payroll_attachments_payrollPaymentId_fkey" FOREIGN KEY ("payrollPaymentId") REFERENCES "payroll_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_attachments" ADD CONSTRAINT "payroll_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

