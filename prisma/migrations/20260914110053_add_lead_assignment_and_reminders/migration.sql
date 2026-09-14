-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_REMINDER';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "reminder24hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder30mSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
