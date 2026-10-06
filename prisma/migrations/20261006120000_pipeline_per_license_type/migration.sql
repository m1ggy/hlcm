-- Each license type now says which pipeline its cases run through, instead
-- of the app matching three hardcoded names (CILA, IDPH, IDOA). Existing
-- types get exactly the pipeline they map to today; everything else stays
-- on MCO, today's fallback. Plus each workspace's own names for the three
-- pipelines and which ones it hides.

-- AlterTable
ALTER TABLE "license_type_templates" ADD COLUMN "pipeline" "Pipeline" NOT NULL DEFAULT 'MCO';

UPDATE "license_type_templates" SET "pipeline" = 'CILA_GROUP_HOME' WHERE "name" = 'CILA';
UPDATE "license_type_templates" SET "pipeline" = 'HOME_CARE' WHERE "name" IN ('IDPH', 'IDOA');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "pipelineSettings" JSONB;
