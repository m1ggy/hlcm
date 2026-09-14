-- CreateEnum
CREATE TYPE "DocusignEnvelopeStatus" AS ENUM ('CREATED', 'SENT', 'DELIVERED', 'COMPLETED', 'DECLINED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ENVELOPE_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'ENVELOPE_DECLINED';

-- CreateTable
CREATE TABLE "docusign_envelopes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "clientAgreementId" TEXT,
    "sourceFileAssetId" TEXT NOT NULL,
    "completedFileAssetId" TEXT,
    "docusignEnvelopeId" TEXT NOT NULL,
    "status" "DocusignEnvelopeStatus" NOT NULL DEFAULT 'CREATED',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "xRatio" DOUBLE PRECISION NOT NULL,
    "yRatio" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "voidReason" TEXT,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docusign_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "docusign_envelopes_completedFileAssetId_key" ON "docusign_envelopes"("completedFileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "docusign_envelopes_docusignEnvelopeId_key" ON "docusign_envelopes"("docusignEnvelopeId");

-- CreateIndex
CREATE INDEX "docusign_envelopes_applicationId_idx" ON "docusign_envelopes"("applicationId");

-- CreateIndex
CREATE INDEX "docusign_envelopes_clientAgreementId_idx" ON "docusign_envelopes"("clientAgreementId");

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_clientAgreementId_fkey" FOREIGN KEY ("clientAgreementId") REFERENCES "client_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_sourceFileAssetId_fkey" FOREIGN KEY ("sourceFileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_completedFileAssetId_fkey" FOREIGN KEY ("completedFileAssetId") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
