-- Running invoice (Option 1): a date on each line, a reference on each payment.
ALTER TABLE "invoice_line_items" ADD COLUMN "lineDate" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "reference" TEXT;
