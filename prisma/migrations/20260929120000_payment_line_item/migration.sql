-- Optional link from a manual invoice's Payment to one of that invoice's
-- line items.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "lineItemId" TEXT;

-- CreateIndex
CREATE INDEX "payments_lineItemId_idx" ON "payments"("lineItemId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "invoice_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
