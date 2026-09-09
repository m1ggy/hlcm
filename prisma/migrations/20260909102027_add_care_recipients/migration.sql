-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "careRecipientId" TEXT,
ADD COLUMN     "clockInLatitude" DOUBLE PRECISION,
ADD COLUMN     "clockInLocationAccuracy" DOUBLE PRECISION,
ADD COLUMN     "clockInLocationError" TEXT,
ADD COLUMN     "clockInLongitude" DOUBLE PRECISION,
ADD COLUMN     "clockOutLatitude" DOUBLE PRECISION,
ADD COLUMN     "clockOutLocationAccuracy" DOUBLE PRECISION,
ADD COLUMN     "clockOutLocationError" TEXT,
ADD COLUMN     "clockOutLongitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "care_recipients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "contactInfo" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_recipient_assignments" (
    "id" TEXT NOT NULL,
    "careRecipientId" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_recipient_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_recipients_clientId_idx" ON "care_recipients"("clientId");

-- CreateIndex
CREATE INDEX "care_recipient_assignments_caregiverId_idx" ON "care_recipient_assignments"("caregiverId");

-- CreateIndex
CREATE UNIQUE INDEX "care_recipient_assignments_careRecipientId_caregiverId_key" ON "care_recipient_assignments"("careRecipientId", "caregiverId");

-- CreateIndex
CREATE INDEX "time_entries_careRecipientId_idx" ON "time_entries"("careRecipientId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipients" ADD CONSTRAINT "care_recipients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipients" ADD CONSTRAINT "care_recipients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipient_assignments" ADD CONSTRAINT "care_recipient_assignments_careRecipientId_fkey" FOREIGN KEY ("careRecipientId") REFERENCES "care_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipient_assignments" ADD CONSTRAINT "care_recipient_assignments_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_recipient_assignments" ADD CONSTRAINT "care_recipient_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
