-- AlterTable
ALTER TABLE "care_recipients" ADD COLUMN     "billingContactEmail" TEXT,
ADD COLUMN     "billingContactName" TEXT,
ADD COLUMN     "billingContactPhone" TEXT,
ADD COLUMN     "hourlyRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "careRecipientId" TEXT;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "billedInvoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_billedInvoiceId_fkey" FOREIGN KEY ("billedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
