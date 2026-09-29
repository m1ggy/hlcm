-- Switchable PDF layouts for manual invoices and receipts, plus the sender
-- details the Modern layout prints. Existing profiles move to Modern.

-- CreateEnum
CREATE TYPE "PdfTemplate" AS ENUM ('CLASSIC', 'MODERN');

-- CreateEnum
CREATE TYPE "QuantityLabel" AS ENUM ('HOURS', 'QTY');

-- AlterTable
ALTER TABLE "invoice_profiles" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "invoiceTemplate" "PdfTemplate" NOT NULL DEFAULT 'MODERN',
ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "quantityLabel" "QuantityLabel" NOT NULL DEFAULT 'HOURS',
ADD COLUMN     "receiptTemplate" "PdfTemplate" NOT NULL DEFAULT 'MODERN';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "pdfTemplate" "PdfTemplate";
