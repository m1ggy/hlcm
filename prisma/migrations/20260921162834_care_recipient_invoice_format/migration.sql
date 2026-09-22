-- CreateEnum
CREATE TYPE "InvoiceLineItemKind" AS ENUM ('MANUAL', 'VISIT_HOURLY', 'VISIT_DAILY');

-- AlterTable
ALTER TABLE "care_recipients" ADD COLUMN     "dailyRate" DOUBLE PRECISION,
ADD COLUMN     "socialSecurityNumber" TEXT;

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "kind" "InvoiceLineItemKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "visitDate" TIMESTAMP(3),
ADD COLUMN     "visitEnd" TIMESTAMP(3),
ADD COLUMN     "visitStart" TIMESTAMP(3),
ADD COLUMN     "workerName" TEXT;
