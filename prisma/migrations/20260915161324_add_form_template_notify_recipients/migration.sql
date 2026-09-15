-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "notifyEmails" TEXT,
ADD COLUMN     "notifyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
