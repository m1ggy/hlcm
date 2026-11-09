-- Workspace tasks, Phase 5 (docs/workspace-tasks-plan.md): recurring tasks,
-- task templates per project, an approval queue for client requests, and
-- end-of-day lines on client-workspace tasks (plain ids: those tasks live in
-- another workspace).
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- CreateEnum
CREATE TYPE "WorkRepeat" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum


ALTER TYPE "WorkActivityKind" ADD VALUE 'REPORTED';
ALTER TYPE "WorkActivityKind" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "work_tasks" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "repeat" "WorkRepeat",
ADD COLUMN     "repeatedFromId" TEXT;

-- AlterTable
ALTER TABLE "eod_report_items" ADD COLUMN     "workOrgId" TEXT,
ADD COLUMN     "workStatusAfter" "WorkTaskStatus",
ADD COLUMN     "workStatusBefore" "WorkTaskStatus",
ADD COLUMN     "workTaskId" TEXT,
ADD COLUMN     "workspaceName" TEXT;

-- CreateTable
CREATE TABLE "work_task_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "repeat" "WorkRepeat",
    "subtasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_task_templates_organizationId_idx" ON "work_task_templates"("organizationId");

-- CreateIndex
CREATE INDEX "work_task_templates_projectId_idx" ON "work_task_templates"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "work_tasks_repeatedFromId_key" ON "work_tasks"("repeatedFromId");

-- CreateIndex
CREATE INDEX "work_tasks_organizationId_isClientRequest_approvedAt_idx" ON "work_tasks"("organizationId", "isClientRequest", "approvedAt");

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_repeatedFromId_fkey" FOREIGN KEY ("repeatedFromId") REFERENCES "work_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_templates" ADD CONSTRAINT "work_task_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_templates" ADD CONSTRAINT "work_task_templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_templates" ADD CONSTRAINT "work_task_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Requests made before the queue existed count as accepted.
UPDATE "work_tasks" SET "approvedAt" = "createdAt" WHERE "isClientRequest" AND "approvedAt" IS NULL;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
