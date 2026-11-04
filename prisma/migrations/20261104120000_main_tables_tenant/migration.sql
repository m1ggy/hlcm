-- Multitenancy for the tables that came from main after the 2026-10-12 merge
-- (20261016120000_caregiver_visits, 20261102120000_login_activity,
-- 20261103120000_payroll): each row belongs to an organization. Existing rows
-- take it from their parent (all of them are CTK's today: these tables only
-- exist on the single-workspace production database); new rows get it from
-- the session's org like every other tenant table. Pay periods have no
-- parent: on a database with more than one org they would be ambiguous, but
-- the only database that has any is single-org, so they go to the org of the
-- payments filed under them, else org_ctk. Then the pay-period dates become
-- unique per org, and row-level security + the same-org triggers.

-- AlterTable
ALTER TABLE "visit_shifts" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "visit_instruction_checks" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "care_incidents" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "login_events" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "pay_periods" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "payroll_payments" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "payroll_attachments" ADD COLUMN "organizationId" TEXT;

-- Backfill from the parent
UPDATE "visit_shifts" t SET "organizationId" = p."organizationId" FROM "care_recipients" p WHERE p.id = t."careRecipientId";
UPDATE "visit_instruction_checks" t SET "organizationId" = p."organizationId" FROM "time_entries" p WHERE p.id = t."timeEntryId";
UPDATE "care_incidents" t SET "organizationId" = p."organizationId" FROM "care_recipients" p WHERE p.id = t."careRecipientId";
UPDATE "login_events" t SET "organizationId" = p."organizationId" FROM "users" p WHERE p.id = t."userId";
UPDATE "pay_periods" t SET "organizationId" = COALESCE(
  (SELECT u."organizationId" FROM "payroll_payments" pp JOIN "users" u ON u.id = pp."userId" WHERE pp."payPeriodId" = t.id LIMIT 1),
  (SELECT u."organizationId" FROM "payroll_attachments" pa JOIN "users" u ON u.id = pa."uploadedById" WHERE pa."payPeriodId" = t.id LIMIT 1),
  'org_ctk'
);
UPDATE "payroll_payments" t SET "organizationId" = p."organizationId" FROM "users" p WHERE p.id = t."userId";
UPDATE "payroll_attachments" t SET "organizationId" = p."organizationId" FROM "users" p WHERE p.id = t."uploadedById";
-- A payment or file filed under a period uses the period's org if it ever differed (it can't today).
UPDATE "payroll_payments" t SET "organizationId" = p."organizationId" FROM "pay_periods" p WHERE p.id = t."payPeriodId" AND t."organizationId" IS NULL;
UPDATE "payroll_attachments" t SET "organizationId" = p."organizationId" FROM "pay_periods" p WHERE p.id = t."payPeriodId" AND t."organizationId" IS NULL;

ALTER TABLE "visit_shifts" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "visit_instruction_checks" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "care_incidents" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "login_events" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "pay_periods" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "payroll_payments" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "payroll_attachments" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();

-- Pay periods: one per date range per org, not globally
DROP INDEX "pay_periods_startDate_endDate_key";
CREATE UNIQUE INDEX "pay_periods_organizationId_startDate_endDate_key" ON "pay_periods"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "visit_shifts_organizationId_idx" ON "visit_shifts"("organizationId");
CREATE INDEX "visit_instruction_checks_organizationId_idx" ON "visit_instruction_checks"("organizationId");
CREATE INDEX "care_incidents_organizationId_idx" ON "care_incidents"("organizationId");
CREATE INDEX "login_events_organizationId_idx" ON "login_events"("organizationId");
CREATE INDEX "pay_periods_organizationId_idx" ON "pay_periods"("organizationId");
CREATE INDEX "payroll_payments_organizationId_idx" ON "payroll_payments"("organizationId");
CREATE INDEX "payroll_attachments_organizationId_idx" ON "payroll_attachments"("organizationId");

-- AddForeignKey
ALTER TABLE "visit_shifts" ADD CONSTRAINT "visit_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visit_instruction_checks" ADD CONSTRAINT "visit_instruction_checks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_incidents" ADD CONSTRAINT "care_incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_attachments" ADD CONSTRAINT "payroll_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
