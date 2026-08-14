-- Case-tracking fields from docs/pipeline-stage-plan.md: Agency, Ball is
-- with, correction round, deficiency dates, Assigned Manager. All nullable —
-- additive only.

-- CreateEnum
CREATE TYPE "Agency" AS ENUM ('IDPH', 'IDOA', 'IDHS', 'OTHER');

-- CreateEnum
CREATE TYPE "BallWith" AS ENUM ('CTK', 'CLIENT', 'GOVERNMENT');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "agency" "Agency",
ADD COLUMN     "assignedManagerId" TEXT,
ADD COLUMN     "ballIsWith" "BallWith",
ADD COLUMN     "correctionRound" INTEGER,
ADD COLUMN     "deficiencyReceivedDate" TIMESTAMP(3),
ADD COLUMN     "deficiencyResponseDueDate" TIMESTAMP(3),
ADD COLUMN     "deficiencyResponseSubmittedDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
