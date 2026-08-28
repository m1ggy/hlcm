-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "amountPaid" DOUBLE PRECISION DEFAULT 0;

