-- Correspondence (docs/client-portal-eod-plan.md, Phase B): emails, letters,
-- calls and screenshots about an application or a task, with attachments
-- (file_assets.correspondenceId), and links from EOD lines to them.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.
-- CreateEnum
CREATE TYPE "CorrespondenceKind" AS ENUM ('EMAIL', 'SCREENSHOT', 'LETTER', 'PHONE_CALL', 'PORTAL_MESSAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CorrespondenceDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "correspondenceId" TEXT;

-- CreateTable
CREATE TABLE "correspondence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "applicationId" TEXT,
    "taskId" TEXT,
    "clientId" TEXT,
    "clientServiceId" TEXT,
    "kind" "CorrespondenceKind" NOT NULL DEFAULT 'EMAIL',
    "direction" "CorrespondenceDirection" NOT NULL DEFAULT 'INBOUND',
    "subject" TEXT NOT NULL,
    "fromParty" TEXT,
    "toParty" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "body" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_item_correspondence" (
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "itemId" TEXT NOT NULL,
    "correspondenceId" TEXT NOT NULL,

    CONSTRAINT "eod_item_correspondence_pkey" PRIMARY KEY ("itemId","correspondenceId")
);

-- CreateIndex
CREATE INDEX "correspondence_organizationId_idx" ON "correspondence"("organizationId");

-- CreateIndex
CREATE INDEX "correspondence_applicationId_occurredAt_idx" ON "correspondence"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "correspondence_taskId_occurredAt_idx" ON "correspondence"("taskId", "occurredAt");

-- CreateIndex
CREATE INDEX "correspondence_organizationId_clientId_idx" ON "correspondence"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "eod_item_correspondence_organizationId_idx" ON "eod_item_correspondence"("organizationId");

-- CreateIndex
CREATE INDEX "eod_item_correspondence_correspondenceId_idx" ON "eod_item_correspondence"("correspondenceId");

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_item_correspondence" ADD CONSTRAINT "eod_item_correspondence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_item_correspondence" ADD CONSTRAINT "eod_item_correspondence_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "eod_report_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_item_correspondence" ADD CONSTRAINT "eod_item_correspondence_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every entry belongs to an application or a task.
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_has_parent" CHECK ("applicationId" IS NOT NULL OR "taskId" IS NOT NULL);

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
