-- DropForeignKey
ALTER TABLE "file_assets" DROP CONSTRAINT "file_assets_applicationId_fkey";

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "taskId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
