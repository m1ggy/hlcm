-- Multitenancy Phase 2: organizationId defaults come from the transaction-local
-- setting app.org_id (set by src/lib/db.ts before every statement) instead of
-- the Phase 1 constant 'org_ctk'. nullif() turns an unset/empty setting into
-- NULL so a write with no tenant context fails the NOT NULL constraint.

-- AlterTable
ALTER TABLE "access_grants" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "applications" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "break_entries" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "care_instructions" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "care_recipient_assignments" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "care_recipients" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "case_types" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "checklist_item_templates" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_agreements" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_contacts" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_credentials" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_groups" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_licenses" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "client_owners" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "document_template_fields" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "document_templates" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "docusign_envelopes" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "file_assets" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "file_versions" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "form_fields" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "form_submission_files" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "form_submissions" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "form_templates" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "generated_documents" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "invoice_attachments" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "invoice_line_items" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "invoice_profiles" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "license_type_templates" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "mco_credentials" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "phases" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "pipeline_stages" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "receipts" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "service_types" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "signature_events" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "signature_profiles" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "stage_history" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "task_assignees" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "task_reviewers" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "task_time_entries" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "time_entries" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "timesheet_break_deductions" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "wise_recipients" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');

-- AlterTable
ALTER TABLE "wise_transactions" ALTER COLUMN "organizationId" SET DEFAULT nullif(current_setting('app.org_id', true), '');
