-- Pipeline stage catalog (see docs/pipeline-stage-plan.md). Additive only —
-- Application still uses the old ApplicationStatus enum until Phase 1 wires
-- it to PipelineStage and backfills real data.

-- CreateEnum
CREATE TYPE "Pipeline" AS ENUM ('HOME_CARE', 'CILA_GROUP_HOME', 'MCO');

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline" "Pipeline" NOT NULL,
    "abbrev" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "hex" TEXT NOT NULL,
    "colorLabel" TEXT NOT NULL,
    "isExitStatus" BOOLEAN NOT NULL DEFAULT false,
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "requiresFollowUpDate" BOOLEAN NOT NULL DEFAULT false,
    "allowedBackwardStageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_sortOrder_idx" ON "pipeline_stages"("pipeline", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_abbrev_key" ON "pipeline_stages"("pipeline", "abbrev");

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
