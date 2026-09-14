-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('CALENDLY');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('BOOKED', 'HELD', 'FOLLOW_UP_SENT', 'REBOOKED', 'CONVERTED', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LEAD_BOOKED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_CANCELED';

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'CALENDLY',
    "stage" "LeadStage" NOT NULL DEFAULT 'BOOKED',
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "timezone" TEXT,
    "meetingStartAt" TIMESTAMP(3) NOT NULL,
    "meetingEndAt" TIMESTAMP(3),
    "meetingJoinUrl" TEXT,
    "calendlyEventUri" TEXT NOT NULL,
    "calendlyInviteeUri" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "clientId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_calendlyInviteeUri_key" ON "leads"("calendlyInviteeUri");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_calendlyEventUri_idx" ON "leads"("calendlyEventUri");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
