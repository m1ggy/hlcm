-- Wires Application to the pipeline stage catalog (see
-- docs/pipeline-stage-plan.md). Additive/nullable only — the old `status`
-- column stays put; scripts/backfill-application-stages.ts populates
-- pipeline/stageId for existing rows, then a later migration makes them
-- required and drops `status`.

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "pipeline" "Pipeline",
ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "stage_history" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_history_applicationId_enteredAt_idx" ON "stage_history"("applicationId", "enteredAt");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
