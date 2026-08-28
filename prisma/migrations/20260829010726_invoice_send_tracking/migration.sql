-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "paidEmailSentAt" TIMESTAMP(3);

