/*
  Warnings:

  - You are about to drop the column `contactInfo` on the `care_recipients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "care_recipients" DROP COLUMN "contactInfo",
ADD COLUMN     "contactNotes" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferredContactMethod" TEXT;
