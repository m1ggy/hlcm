-- Shift forms (docs/shift-forms-plan.md): a form caregivers fill in the app
-- when they end a visit, required before they can clock out. A form is a
-- shift form for every client's visits or only for chosen care clients
-- (form_shift_clients); its submissions record who, for which client, and
-- which visit.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "shiftAllClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shiftForm" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "careRecipientId" TEXT,
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "visitId" TEXT;

-- CreateTable
CREATE TABLE "form_shift_clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "templateId" TEXT NOT NULL,
    "careRecipientId" TEXT NOT NULL,

    CONSTRAINT "form_shift_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_shift_clients_organizationId_idx" ON "form_shift_clients"("organizationId");

-- CreateIndex
CREATE INDEX "form_shift_clients_careRecipientId_idx" ON "form_shift_clients"("careRecipientId");

-- CreateIndex
CREATE UNIQUE INDEX "form_shift_clients_templateId_careRecipientId_key" ON "form_shift_clients"("templateId", "careRecipientId");

-- CreateIndex
CREATE INDEX "form_submissions_visitId_idx" ON "form_submissions"("visitId");

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_shift_clients" ADD CONSTRAINT "form_shift_clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_shift_clients" ADD CONSTRAINT "form_shift_clients_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_shift_clients" ADD CONSTRAINT "form_shift_clients_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;



SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
