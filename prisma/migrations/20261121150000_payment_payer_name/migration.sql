-- Who sent a payment ("Paid by"), so staff can tell one client's payments from another's.
ALTER TABLE "payments" ADD COLUMN "payerName" TEXT;
