-- StageHistory gains reason/followUpDate — what On Hold and Withdrawn
-- require per docs/pipeline-stage-plan.md, stored on the specific
-- transition rather than the case as a whole.

-- AlterTable
ALTER TABLE "stage_history" ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT;
