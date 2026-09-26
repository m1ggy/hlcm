-- Multitenancy Phase 3d': aging alerts match stages by role, not abbrev.
-- Each org owns its stage list, so a renamed abbrev must not silently
-- switch an alert off. The backfill mirrors exactly the abbrev rules
-- src/lib/aging-alerts.ts used until now, so existing orgs' alerts behave
-- the same.

-- CreateEnum
CREATE TYPE "StageRole" AS ENUM ('SUPERVISOR_REVIEW', 'WAITING_CLIENT_DOCS', 'CORRECTIONS_RECEIVED', 'ON_HOLD', 'CREDENTIALING_REVIEW');

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "role" "StageRole";

UPDATE "pipeline_stages" SET "role" = 'SUPERVISOR_REVIEW'    WHERE "abbrev" LIKE '%SVR';
UPDATE "pipeline_stages" SET "role" = 'WAITING_CLIENT_DOCS'  WHERE "abbrev" LIKE '%WCD';
UPDATE "pipeline_stages" SET "role" = 'CORRECTIONS_RECEIVED' WHERE "abbrev" LIKE '%COR';
UPDATE "pipeline_stages" SET "role" = 'ON_HOLD'              WHERE "abbrev" = 'HLD';
UPDATE "pipeline_stages" SET "role" = 'CREDENTIALING_REVIEW' WHERE "abbrev" = 'CIR' AND "pipeline" = 'MCO';
