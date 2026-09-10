/*
  Warnings:

  - You are about to drop the column `ownerDateOfBirth` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `ownerEmail` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `ownerName` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `ownerPhone` on the `clients` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'ON_HOLD', 'COMPLETED');

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "ownerDateOfBirth",
DROP COLUMN "ownerEmail",
DROP COLUMN "ownerName",
DROP COLUMN "ownerPhone",
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT';

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_owners" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "ownershipPercentage" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_agreements" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agreementType" TEXT NOT NULL,
    "signedDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION,
    "paymentStatus" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_licenses" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_contacts_clientId_idx" ON "client_contacts"("clientId");

-- CreateIndex
CREATE INDEX "client_owners_clientId_idx" ON "client_owners"("clientId");

-- CreateIndex
CREATE INDEX "client_agreements_clientId_idx" ON "client_agreements"("clientId");

-- CreateIndex
CREATE INDEX "client_licenses_clientId_idx" ON "client_licenses"("clientId");

-- CreateIndex
CREATE INDEX "client_licenses_expiryDate_idx" ON "client_licenses"("expiryDate");

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_owners" ADD CONSTRAINT "client_owners_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_owners" ADD CONSTRAINT "client_owners_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_agreements" ADD CONSTRAINT "client_agreements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_agreements" ADD CONSTRAINT "client_agreements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_licenses" ADD CONSTRAINT "client_licenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_licenses" ADD CONSTRAINT "client_licenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
