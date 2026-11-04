-- CreateEnum
CREATE TYPE "CareIncidentCategory" AS ENUM ('FALL_OR_INJURY', 'HEALTH_CHANGE', 'MEDICATION', 'BEHAVIOR', 'HOME_SAFETY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CARE_RECIPIENT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'CARE_INCIDENT_REPORTED';

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "visitNote" TEXT,
ADD COLUMN     "visitStartId" TEXT;

-- AlterTable
ALTER TABLE "care_instructions" DROP COLUMN "completed";

-- CreateTable
CREATE TABLE "visit_instruction_checks" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_instruction_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_shifts" (
    "id" TEXT NOT NULL,
    "careRecipientId" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_incidents" (
    "id" TEXT NOT NULL,
    "careRecipientId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "category" "CareIncidentCategory" NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "care_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_instruction_checks_instructionId_idx" ON "visit_instruction_checks"("instructionId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_instruction_checks_timeEntryId_instructionId_key" ON "visit_instruction_checks"("timeEntryId", "instructionId");

-- CreateIndex
CREATE INDEX "visit_shifts_careRecipientId_idx" ON "visit_shifts"("careRecipientId");

-- CreateIndex
CREATE INDEX "visit_shifts_caregiverId_weekday_idx" ON "visit_shifts"("caregiverId", "weekday");

-- CreateIndex
CREATE INDEX "care_incidents_careRecipientId_resolvedAt_idx" ON "care_incidents"("careRecipientId", "resolvedAt");

-- CreateIndex
CREATE INDEX "time_entries_visitStartId_idx" ON "time_entries"("visitStartId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_visitStartId_fkey" FOREIGN KEY ("visitStartId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instruction_checks" ADD CONSTRAINT "visit_instruction_checks_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instruction_checks" ADD CONSTRAINT "visit_instruction_checks_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "care_instructions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_instruction_checks" ADD CONSTRAINT "visit_instruction_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_shifts" ADD CONSTRAINT "visit_shifts_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_shifts" ADD CONSTRAINT "visit_shifts_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_shifts" ADD CONSTRAINT "visit_shifts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_incidents" ADD CONSTRAINT "care_incidents_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_incidents" ADD CONSTRAINT "care_incidents_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_incidents" ADD CONSTRAINT "care_incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_incidents" ADD CONSTRAINT "care_incidents_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

