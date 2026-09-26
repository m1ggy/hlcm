-- Multitenancy Phase 4: each organization's own Stripe / DocuSign / Calendly /
-- Wise / Twilio / Teams connection (secrets encrypted at rest, see
-- src/lib/secrets.ts).

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('STRIPE', 'DOCUSIGN', 'CALENDLY', 'WISE', 'TWILIO', 'TEAMS');

-- CreateTable
CREATE TABLE "organization_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "provider" "IntegrationProvider" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_integrations_organizationId_idx" ON "organization_integrations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_integrations_organizationId_provider_key" ON "organization_integrations"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

