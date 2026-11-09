-- Forms upgrade (docs/forms-plan.md): new field types, help text,
-- placeholders and show-if conditions, thank-you message and submitter copy,
-- field snapshots and notes on submissions, text alerts to staff (shared
-- Carenela number) with a send log.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FORM_SUBMITTED';

-- AlterEnum


ALTER TYPE "FormFieldType" ADD VALUE 'RADIO';
ALTER TYPE "FormFieldType" ADD VALUE 'MULTI_CHECKBOX';
ALTER TYPE "FormFieldType" ADD VALUE 'NUMBER';
ALTER TYPE "FormFieldType" ADD VALUE 'HEADING';
ALTER TYPE "FormFieldType" ADD VALUE 'PARAGRAPH';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "smsFormAlerts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "notifyTextUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sendCopyToSubmitter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "thankYouMessage" TEXT;

-- AlterTable
ALTER TABLE "form_fields" ADD COLUMN     "helpText" TEXT,
ADD COLUMN     "placeholder" TEXT,
ADD COLUMN     "showIf" JSONB;

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "copyEmailedTo" TEXT,
ADD COLUMN     "fieldsSnapshot" JSONB,
ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT,
    "toNumber" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "entityId" TEXT,
    "ok" BOOLEAN NOT NULL,
    "twilioSid" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_logs_organizationId_idx" ON "sms_logs"("organizationId");

-- CreateIndex
CREATE INDEX "sms_logs_entityId_idx" ON "sms_logs"("entityId");

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
