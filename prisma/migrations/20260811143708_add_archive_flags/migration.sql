-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;
