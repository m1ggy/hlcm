-- Evening text of a client workspace's day note.
ALTER TABLE "organizations" ADD COLUMN "workDailyText" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users" ADD COLUMN "smsDailyUpdates" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "work_summary_notes" ADD COLUMN "textSkip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "textedAt" TIMESTAMP(3),
ADD COLUMN "textedCount" INTEGER;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
