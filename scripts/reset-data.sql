-- Wipes every table except `users`. Users survive untouched (including
-- passwords/roles) — everything else (projects, clients, applications,
-- tasks, files, notes, audit logs, time entries, Wise records, reference
-- data) is truncated. cuid ids, so no sequences to restart.
--
-- Run: psql "$DATABASE_URL" -f scripts/reset-data.sql
-- (or paste into whatever client you use against the target DB)

TRUNCATE TABLE
  wise_transactions,
  wise_recipients,
  time_entries,
  access_grants,
  file_versions,
  signature_events,
  file_assets,
  document_template_fields,
  generated_documents,
  document_templates,
  notes,
  notifications,
  audit_logs,
  tasks,
  phases,
  checklist_item_templates,
  applications,
  case_types,
  license_type_templates,
  clients,
  projects
CASCADE;
