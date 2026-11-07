-- End-of-day reports (docs/client-portal-eod-plan.md, Phase C): one report per
-- person per day, its lines (against tasks or ad hoc) and manager comments;
-- users.eodRequired (null = the role default) and two notification types.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- CreateEnum
CREATE TYPE "EodStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EOD_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'EOD_COMMENTED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "eodRequired" BOOLEAN;

-- CreateTable
CREATE TABLE "eod_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "EodStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "summary" TEXT,
    "blockers" TEXT,
    "tomorrowPlan" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eod_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_report_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "reportId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "applicationId" TEXT,
    "clientId" TEXT,
    "statusBefore" "TaskStatus",
    "statusAfter" "TaskStatus",
    "workDone" TEXT NOT NULL DEFAULT '',
    "internalNote" TEXT,
    "minutes" INTEGER,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eod_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_report_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eod_report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eod_reports_organizationId_reportDate_idx" ON "eod_reports"("organizationId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "eod_reports_userId_reportDate_key" ON "eod_reports"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "eod_report_items_reportId_idx" ON "eod_report_items"("reportId");

-- CreateIndex
CREATE INDEX "eod_report_items_taskId_idx" ON "eod_report_items"("taskId");

-- CreateIndex
CREATE INDEX "eod_report_items_organizationId_clientId_idx" ON "eod_report_items"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "eod_report_comments_reportId_idx" ON "eod_report_comments"("reportId");

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_reports" ADD CONSTRAINT "eod_reports_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_items" ADD CONSTRAINT "eod_report_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_items" ADD CONSTRAINT "eod_report_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "eod_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_items" ADD CONSTRAINT "eod_report_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_comments" ADD CONSTRAINT "eod_report_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_comments" ADD CONSTRAINT "eod_report_comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "eod_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eod_report_comments" ADD CONSTRAINT "eod_report_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
