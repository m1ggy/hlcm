-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "logoStorageKey" TEXT,
    "logoMimeType" TEXT,
    "ccEmails" TEXT,
    "footerText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

