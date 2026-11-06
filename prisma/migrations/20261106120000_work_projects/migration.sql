-- Projects and tasks (docs/workspace-tasks-plan.md, Phase 2): general work
-- shared between a managing company's staff and a client company, separate
-- from the licensing Task/Phase checklist. Five tenant tables, plus a file
-- and a time-entry link to a project task.
--
-- Hand-written from `prisma migrate diff`, then: a CHECK that a time entry
-- points at one kind of task at most, and the tenant policies and same-org
-- triggers every new tenant table gets.

-- CreateEnum
CREATE TYPE "WorkProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkCommentVisibility" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "WorkActivityKind" AS ENUM ('CREATED', 'REQUESTED', 'STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'COMMENTED', 'FILE_ADDED', 'DUE_CHANGED', 'DECLINED');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'WORK_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_TASK_COMMENTED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_TASK_REQUESTED';

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "workTaskId" TEXT;

-- AlterTable
ALTER TABLE "task_time_entries" ADD COLUMN     "workTaskId" TEXT;

-- CreateTable
CREATE TABLE "work_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "status" "WorkProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "leadId" TEXT,
    "startDate" DATE,
    "dueDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "startDate" DATE,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "estimateHours" DOUBLE PRECISION,
    "isClientRequest" BOOLEAN NOT NULL DEFAULT false,
    "declineReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_task_assignees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_task_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "WorkCommentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "work_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_task_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "WorkActivityKind" NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_projects_organizationId_status_idx" ON "work_projects"("organizationId", "status");

-- CreateIndex
CREATE INDEX "work_tasks_organizationId_projectId_status_idx" ON "work_tasks"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "work_tasks_parentId_idx" ON "work_tasks"("parentId");

-- CreateIndex
CREATE INDEX "work_task_assignees_userId_idx" ON "work_task_assignees"("userId");

-- CreateIndex
CREATE INDEX "work_task_assignees_organizationId_idx" ON "work_task_assignees"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "work_task_assignees_taskId_userId_key" ON "work_task_assignees"("taskId", "userId");

-- CreateIndex
CREATE INDEX "work_task_comments_taskId_createdAt_idx" ON "work_task_comments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "work_task_comments_organizationId_idx" ON "work_task_comments"("organizationId");

-- CreateIndex
CREATE INDEX "work_task_activities_organizationId_occurredAt_idx" ON "work_task_activities"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "work_task_activities_projectId_occurredAt_idx" ON "work_task_activities"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "work_task_activities_taskId_occurredAt_idx" ON "work_task_activities"("taskId", "occurredAt");

-- CreateIndex
CREATE INDEX "task_time_entries_workTaskId_idx" ON "task_time_entries"("workTaskId");

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_workTaskId_fkey" FOREIGN KEY ("workTaskId") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_workTaskId_fkey" FOREIGN KEY ("workTaskId") REFERENCES "work_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_projects" ADD CONSTRAINT "work_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_projects" ADD CONSTRAINT "work_projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_projects" ADD CONSTRAINT "work_projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_activities" ADD CONSTRAINT "work_task_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_activities" ADD CONSTRAINT "work_task_activities_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_activities" ADD CONSTRAINT "work_task_activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_task_activities" ADD CONSTRAINT "work_task_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A timer runs against a licensing task or a project task, never both.
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_one_task" CHECK ("taskId" IS NULL OR "workTaskId" IS NULL);

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
