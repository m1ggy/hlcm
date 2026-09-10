/*
  Warnings:

  - You are about to drop the column `notes` on the `care_recipients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "care_recipients" DROP COLUMN "notes",
ADD COLUMN     "careNotes" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "visitSchedule" TEXT;

-- CreateTable
CREATE TABLE "care_instructions" (
    "id" TEXT NOT NULL,
    "careRecipientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_instructions_careRecipientId_idx" ON "care_instructions"("careRecipientId");

-- AddForeignKey
ALTER TABLE "care_instructions" ADD CONSTRAINT "care_instructions_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_instructions" ADD CONSTRAINT "care_instructions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
