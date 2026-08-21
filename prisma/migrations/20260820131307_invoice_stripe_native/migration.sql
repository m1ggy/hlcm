-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "billingAddressLine1" TEXT,
ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCountry" TEXT DEFAULT 'US',
ADD COLUMN     "billingPostalCode" TEXT,
ADD COLUMN     "billingState" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "pdfStorageKey",
DROP COLUMN "stripeCheckoutSessionId",
DROP COLUMN "stripePaymentUrl",
ADD COLUMN     "hostedInvoiceUrl" TEXT,
ADD COLUMN     "invoicePdfUrl" TEXT,
ADD COLUMN     "stripeInvoiceId" TEXT,
ADD COLUMN     "stripeInvoiceNumber" TEXT,
ALTER COLUMN "taxAmount" DROP NOT NULL,
ALTER COLUMN "taxAmount" DROP DEFAULT,
ALTER COLUMN "total" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");

