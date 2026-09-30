-- Platform support access (owner-granted, time-limited) and terms acceptance.

-- AlterEnum
ALTER TYPE "AuthTokenKind" ADD VALUE 'SUPPORT_LOGIN';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "supportAccessUntil" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedBy" TEXT,
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSupport" BOOLEAN NOT NULL DEFAULT false;
