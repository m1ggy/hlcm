-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "invoiceProfileId" TEXT;

-- CreateTable
CREATE TABLE "invoice_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "logoStorageKey" TEXT,
    "logoMimeType" TEXT,
    "ccEmails" TEXT,
    "footerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_profiles_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoiceProfileId_fkey" FOREIGN KEY ("invoiceProfileId") REFERENCES "invoice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

