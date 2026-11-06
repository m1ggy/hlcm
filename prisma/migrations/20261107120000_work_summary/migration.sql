-- Client weekly summary (docs/workspace-tasks-plan.md, Phase 3): the written
-- note on each day and week of a client's summary (Claude-written or by a
-- person), and three workspace settings: show hours to the client (off),
-- AI summaries (on) and the Monday email (on).
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- CreateEnum
CREATE TYPE "WorkSummaryPeriod" AS ENUM ('DAY', 'WEEK');

-- CreateEnum
CREATE TYPE "WorkSummarySource" AS ENUM ('AI', 'HUMAN', 'EDITED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "workAiSummaries" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workShowHoursToClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workWeeklyEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "work_summary_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "period" "WorkSummaryPeriod" NOT NULL,
    "date" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "source" "WorkSummarySource" NOT NULL,
    "authorId" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_summary_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_summary_notes_organizationId_period_date_key" ON "work_summary_notes"("organizationId", "period", "date");

-- AddForeignKey
ALTER TABLE "work_summary_notes" ADD CONSTRAINT "work_summary_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_summary_notes" ADD CONSTRAINT "work_summary_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
