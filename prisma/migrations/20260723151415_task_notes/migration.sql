-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_applicationId_fkey";

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "taskId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
