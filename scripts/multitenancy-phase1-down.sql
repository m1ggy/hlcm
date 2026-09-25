-- Rollback for migration 20260925154029_add_organizations (multitenancy
-- Phase 1). Only valid while every row still belongs to CTK — once a second
-- organization exists this would silently merge tenants' data, so it
-- refuses to run in that case.
--
-- Deploy the previous app/migrator images first, then run against the DB:
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < phase1-down.sql
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM "organizations") > 1 THEN
    RAISE EXCEPTION 'More than one organization exists; refusing to roll back Phase 1';
  END IF;
END $$;

ALTER TABLE "access_grants" DROP COLUMN "organizationId";
ALTER TABLE "applications" DROP COLUMN "organizationId";
ALTER TABLE "audit_logs" DROP COLUMN "organizationId";
ALTER TABLE "break_entries" DROP COLUMN "organizationId";
ALTER TABLE "care_instructions" DROP COLUMN "organizationId";
ALTER TABLE "care_recipient_assignments" DROP COLUMN "organizationId";
ALTER TABLE "care_recipients" DROP COLUMN "organizationId";
ALTER TABLE "case_types" DROP COLUMN "organizationId";
ALTER TABLE "checklist_item_templates" DROP COLUMN "organizationId";
ALTER TABLE "client_agreements" DROP COLUMN "organizationId";
ALTER TABLE "client_contacts" DROP COLUMN "organizationId";
ALTER TABLE "client_credentials" DROP COLUMN "organizationId";
ALTER TABLE "client_groups" DROP COLUMN "organizationId";
ALTER TABLE "client_licenses" DROP COLUMN "organizationId";
ALTER TABLE "client_owners" DROP COLUMN "organizationId";
ALTER TABLE "clients" DROP COLUMN "organizationId";
ALTER TABLE "document_template_fields" DROP COLUMN "organizationId";
ALTER TABLE "document_templates" DROP COLUMN "organizationId";
ALTER TABLE "docusign_envelopes" DROP COLUMN "organizationId";
ALTER TABLE "file_assets" DROP COLUMN "organizationId";
ALTER TABLE "file_versions" DROP COLUMN "organizationId";
ALTER TABLE "form_fields" DROP COLUMN "organizationId";
ALTER TABLE "form_submission_files" DROP COLUMN "organizationId";
ALTER TABLE "form_submissions" DROP COLUMN "organizationId";
ALTER TABLE "form_templates" DROP COLUMN "organizationId";
ALTER TABLE "generated_documents" DROP COLUMN "organizationId";
ALTER TABLE "invoice_attachments" DROP COLUMN "organizationId";
ALTER TABLE "invoice_line_items" DROP COLUMN "organizationId";
ALTER TABLE "invoice_profiles" DROP COLUMN "organizationId";
ALTER TABLE "invoices" DROP COLUMN "organizationId";
ALTER TABLE "leads" DROP COLUMN "organizationId";
ALTER TABLE "license_type_templates" DROP COLUMN "organizationId";
ALTER TABLE "mco_credentials" DROP COLUMN "organizationId";
ALTER TABLE "notes" DROP COLUMN "organizationId";
ALTER TABLE "notifications" DROP COLUMN "organizationId";
ALTER TABLE "payments" DROP COLUMN "organizationId";
ALTER TABLE "phases" DROP COLUMN "organizationId";
ALTER TABLE "pipeline_stages" DROP COLUMN "organizationId";
ALTER TABLE "projects" DROP COLUMN "organizationId";
ALTER TABLE "receipts" DROP COLUMN "organizationId";
ALTER TABLE "service_types" DROP COLUMN "organizationId";
ALTER TABLE "signature_events" DROP COLUMN "organizationId";
ALTER TABLE "signature_profiles" DROP COLUMN "organizationId";
ALTER TABLE "stage_history" DROP COLUMN "organizationId";
ALTER TABLE "task_assignees" DROP COLUMN "organizationId";
ALTER TABLE "task_reviewers" DROP COLUMN "organizationId";
ALTER TABLE "task_time_entries" DROP COLUMN "organizationId";
ALTER TABLE "tasks" DROP COLUMN "organizationId";
ALTER TABLE "time_entries" DROP COLUMN "organizationId";
ALTER TABLE "timesheet_break_deductions" DROP COLUMN "organizationId";
ALTER TABLE "users" DROP COLUMN "organizationId";
ALTER TABLE "wise_recipients" DROP COLUMN "organizationId";
ALTER TABLE "wise_transactions" DROP COLUMN "organizationId";

DROP TABLE "organizations";
DROP TYPE "OrgStatus";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260925154029_add_organizations';

COMMIT;
