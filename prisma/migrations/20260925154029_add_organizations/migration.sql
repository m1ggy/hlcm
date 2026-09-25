-- Multitenancy Phase 1 (docs/multitenancy-plan.md): add organizations and
-- scope every table to one. Zero behavior change: everything lands in CTK.

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "access_grants" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "break_entries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "care_instructions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "care_recipient_assignments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "care_recipients" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "case_types" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "checklist_item_templates" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_agreements" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_contacts" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_credentials" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_groups" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_licenses" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "client_owners" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "document_template_fields" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "document_templates" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "docusign_envelopes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "file_versions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "form_fields" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "form_submission_files" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "generated_documents" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "invoice_attachments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "invoice_profiles" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "license_type_templates" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "mco_credentials" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "phases" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "service_types" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "signature_events" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "signature_profiles" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "stage_history" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "task_assignees" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "task_reviewers" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "task_time_entries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "timesheet_break_deductions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "wise_recipients" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- AlterTable
ALTER TABLE "wise_transactions" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_ctk';

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Seed the first tenant. Every existing row is backfilled to it by the
-- 'org_ctk' column defaults above (ADD COLUMN with a constant default fills
-- existing rows); this row must exist before the foreign keys below.
INSERT INTO "organizations" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES ('org_ctk', 'ctk', 'CTK', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE INDEX "access_grants_organizationId_idx" ON "access_grants"("organizationId");

-- CreateIndex
CREATE INDEX "applications_organizationId_idx" ON "applications"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "break_entries_organizationId_idx" ON "break_entries"("organizationId");

-- CreateIndex
CREATE INDEX "care_instructions_organizationId_idx" ON "care_instructions"("organizationId");

-- CreateIndex
CREATE INDEX "care_recipient_assignments_organizationId_idx" ON "care_recipient_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "care_recipients_organizationId_idx" ON "care_recipients"("organizationId");

-- CreateIndex
CREATE INDEX "case_types_organizationId_idx" ON "case_types"("organizationId");

-- CreateIndex
CREATE INDEX "checklist_item_templates_organizationId_idx" ON "checklist_item_templates"("organizationId");

-- CreateIndex
CREATE INDEX "client_agreements_organizationId_idx" ON "client_agreements"("organizationId");

-- CreateIndex
CREATE INDEX "client_contacts_organizationId_idx" ON "client_contacts"("organizationId");

-- CreateIndex
CREATE INDEX "client_credentials_organizationId_idx" ON "client_credentials"("organizationId");

-- CreateIndex
CREATE INDEX "client_groups_organizationId_idx" ON "client_groups"("organizationId");

-- CreateIndex
CREATE INDEX "client_licenses_organizationId_idx" ON "client_licenses"("organizationId");

-- CreateIndex
CREATE INDEX "client_owners_organizationId_idx" ON "client_owners"("organizationId");

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "clients"("organizationId");

-- CreateIndex
CREATE INDEX "document_template_fields_organizationId_idx" ON "document_template_fields"("organizationId");

-- CreateIndex
CREATE INDEX "document_templates_organizationId_idx" ON "document_templates"("organizationId");

-- CreateIndex
CREATE INDEX "docusign_envelopes_organizationId_idx" ON "docusign_envelopes"("organizationId");

-- CreateIndex
CREATE INDEX "file_assets_organizationId_idx" ON "file_assets"("organizationId");

-- CreateIndex
CREATE INDEX "file_versions_organizationId_idx" ON "file_versions"("organizationId");

-- CreateIndex
CREATE INDEX "form_fields_organizationId_idx" ON "form_fields"("organizationId");

-- CreateIndex
CREATE INDEX "form_submission_files_organizationId_idx" ON "form_submission_files"("organizationId");

-- CreateIndex
CREATE INDEX "form_submissions_organizationId_idx" ON "form_submissions"("organizationId");

-- CreateIndex
CREATE INDEX "form_templates_organizationId_idx" ON "form_templates"("organizationId");

-- CreateIndex
CREATE INDEX "generated_documents_organizationId_idx" ON "generated_documents"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_attachments_organizationId_idx" ON "invoice_attachments"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_line_items_organizationId_idx" ON "invoice_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_profiles_organizationId_idx" ON "invoice_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "license_type_templates_organizationId_idx" ON "license_type_templates"("organizationId");

-- CreateIndex
CREATE INDEX "mco_credentials_organizationId_idx" ON "mco_credentials"("organizationId");

-- CreateIndex
CREATE INDEX "notes_organizationId_idx" ON "notes"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE INDEX "phases_organizationId_idx" ON "phases"("organizationId");

-- CreateIndex
CREATE INDEX "pipeline_stages_organizationId_idx" ON "pipeline_stages"("organizationId");

-- CreateIndex
CREATE INDEX "projects_organizationId_idx" ON "projects"("organizationId");

-- CreateIndex
CREATE INDEX "receipts_organizationId_idx" ON "receipts"("organizationId");

-- CreateIndex
CREATE INDEX "service_types_organizationId_idx" ON "service_types"("organizationId");

-- CreateIndex
CREATE INDEX "signature_events_organizationId_idx" ON "signature_events"("organizationId");

-- CreateIndex
CREATE INDEX "signature_profiles_organizationId_idx" ON "signature_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "stage_history_organizationId_idx" ON "stage_history"("organizationId");

-- CreateIndex
CREATE INDEX "task_assignees_organizationId_idx" ON "task_assignees"("organizationId");

-- CreateIndex
CREATE INDEX "task_reviewers_organizationId_idx" ON "task_reviewers"("organizationId");

-- CreateIndex
CREATE INDEX "task_time_entries_organizationId_idx" ON "task_time_entries"("organizationId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_idx" ON "time_entries"("organizationId");

-- CreateIndex
CREATE INDEX "timesheet_break_deductions_organizationId_idx" ON "timesheet_break_deductions"("organizationId");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "wise_recipients_organizationId_idx" ON "wise_recipients"("organizationId");

-- CreateIndex
CREATE INDEX "wise_transactions_organizationId_idx" ON "wise_transactions"("organizationId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wise_recipients" ADD CONSTRAINT "wise_recipients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wise_transactions" ADD CONSTRAINT "wise_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_break_deductions" ADD CONSTRAINT "timesheet_break_deductions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_owners" ADD CONSTRAINT "client_owners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_agreements" ADD CONSTRAINT "client_agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_licenses" ADD CONSTRAINT "client_licenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipients" ADD CONSTRAINT "care_recipients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_instructions" ADD CONSTRAINT "care_instructions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipient_assignments" ADD CONSTRAINT "care_recipient_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_groups" ADD CONSTRAINT "client_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_type_templates" ADD CONSTRAINT "license_type_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_types" ADD CONSTRAINT "case_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item_templates" ADD CONSTRAINT "checklist_item_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_fields" ADD CONSTRAINT "document_template_fields_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reviewers" ADD CONSTRAINT "task_reviewers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_profiles" ADD CONSTRAINT "signature_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_profiles" ADD CONSTRAINT "invoice_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission_files" ADD CONSTRAINT "form_submission_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
