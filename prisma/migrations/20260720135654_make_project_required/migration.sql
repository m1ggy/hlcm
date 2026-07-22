/*
  Warnings:

  - Made the column `projectId` on table `clients` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_projectId_fkey";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "projectId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
