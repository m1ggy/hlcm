-- CreateEnum
CREATE TYPE "TaskTimeEntrySource" AS ENUM ('TIMER', 'MANUAL');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "estimatedHours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "task_time_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "source" "TaskTimeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "billedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_time_entries_userId_startedAt_idx" ON "task_time_entries"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "task_time_entries_taskId_idx" ON "task_time_entries"("taskId");

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_billedInvoiceId_fkey" FOREIGN KEY ("billedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
