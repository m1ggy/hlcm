-- MCO as its own model — one row per client per MCO, moving through the MCO
-- pipeline independently (docs/pipeline-stage-plan.md). StageHistory becomes
-- polymorphic (exactly one of applicationId/mcoCredentialId set, same
-- pattern as Note) so MCO credentials get the same per-transition history
-- Applications do.

-- CreateEnum
CREATE TYPE "McoName" AS ENUM ('AETNA', 'BCBS_IL', 'COUNTY_CARE', 'HUMANA', 'MERIDIAN', 'MOLINA', 'OTHER');

-- DropForeignKey
ALTER TABLE "stage_history" DROP CONSTRAINT "stage_history_applicationId_fkey";

-- AlterTable
ALTER TABLE "stage_history" ADD COLUMN     "mcoCredentialId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "mco_credentials" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mcoName" "McoName" NOT NULL,
    "stageId" TEXT,
    "npi" TEXT,
    "providerId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "recredentialingDueDate" TIMESTAMP(3),
    "ballIsWith" "BallWith",
    "correctionRound" INTEGER,
    "deficiencyReceivedDate" TIMESTAMP(3),
    "deficiencyResponseDueDate" TIMESTAMP(3),
    "deficiencyResponseSubmittedDate" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "assignedManagerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mco_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mco_credentials_clientId_mcoName_key" ON "mco_credentials"("clientId", "mcoName");

-- CreateIndex
CREATE INDEX "stage_history_mcoCredentialId_enteredAt_idx" ON "stage_history"("mcoCredentialId", "enteredAt");

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_mcoCredentialId_fkey" FOREIGN KEY ("mcoCredentialId") REFERENCES "mco_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mco_credentials" ADD CONSTRAINT "mco_credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
