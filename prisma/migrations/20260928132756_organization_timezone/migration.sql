-- Multitenancy Phase 5a: per-organization timezone for org-wide schedules.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "timezone" TEXT;

