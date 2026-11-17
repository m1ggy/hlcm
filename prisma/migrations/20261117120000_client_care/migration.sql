-- Clients and caregivers in client companies' tasks-only workspaces
-- (docs/client-care-plan.md).

-- Platform switch per workspace.
ALTER TABLE "organizations" ADD COLUMN "careEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Caregivers without an email sign in with their phone number.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Optional client / caregiver tags on a project task.
ALTER TABLE "work_tasks" ADD COLUMN "careRecipientId" TEXT,
ADD COLUMN "caregiverId" TEXT;

CREATE INDEX "work_tasks_careRecipientId_idx" ON "work_tasks"("careRecipientId");
CREATE INDEX "work_tasks_caregiverId_idx" ON "work_tasks"("caregiverId");

ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
