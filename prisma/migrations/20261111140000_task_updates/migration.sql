-- End-of-day lines written as updates on the task (docs/task-updates-plan.md).
ALTER TABLE "eod_report_items" ADD COLUMN "fromTaskUpdate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "addedAfterSubmit" BOOLEAN NOT NULL DEFAULT false;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
