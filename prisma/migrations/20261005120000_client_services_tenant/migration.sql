-- Multitenancy for the multi-service client tables that came from main
-- (20261001150000_client_services, 20261001160000_service_adjustments):
-- each row belongs to its client's organization. Existing rows take it from
-- their parent; new rows get it from the session's org like every other
-- tenant table. Then row-level security and the same-org triggers, which
-- also cover the clientServiceId links on applications, file_assets, tasks,
-- notes and invoices.

-- AlterTable
ALTER TABLE "client_services" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "client_service_assignees" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "service_adjustments" ADD COLUMN "organizationId" TEXT;

-- Backfill from the parent
UPDATE "client_services" s SET "organizationId" = c."organizationId" FROM "clients" c WHERE c.id = s."clientId";
UPDATE "client_service_assignees" a SET "organizationId" = s."organizationId" FROM "client_services" s WHERE s.id = a."clientServiceId";
UPDATE "service_adjustments" a SET "organizationId" = s."organizationId" FROM "client_services" s WHERE s.id = a."clientServiceId";

ALTER TABLE "client_services" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "client_service_assignees" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();
ALTER TABLE "service_adjustments" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "organizationId" SET DEFAULT current_org_id();

-- CreateIndex
CREATE INDEX "client_services_organizationId_idx" ON "client_services"("organizationId");
CREATE INDEX "client_service_assignees_organizationId_idx" ON "client_service_assignees"("organizationId");
CREATE INDEX "service_adjustments_organizationId_idx" ON "service_adjustments"("organizationId");

-- AddForeignKey
ALTER TABLE "client_services" ADD CONSTRAINT "client_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_service_assignees" ADD CONSTRAINT "client_service_assignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_adjustments" ADD CONSTRAINT "service_adjustments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
