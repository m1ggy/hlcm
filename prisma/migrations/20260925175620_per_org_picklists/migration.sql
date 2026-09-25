-- Multitenancy Phase 3d: the Illinois/CTK-specific enums (Agency, McoName,
-- BallWith) become per-organization picklists. The columns keep the exact
-- same values as plain text codes; each org's picklist_options rows supply
-- the choices and display labels (Admin > Lists).
--
-- Hand-written: Prisma's generated diff dropped and re-added the columns,
-- which would have erased every stored value.

CREATE TYPE "PicklistKind" AS ENUM ('AGENCY', 'PAYER', 'BALL_WITH');

CREATE TABLE "picklist_options" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "list" "PicklistKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "picklist_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "picklist_options_organizationId_idx" ON "picklist_options"("organizationId");
CREATE UNIQUE INDEX "picklist_options_organizationId_list_code_key" ON "picklist_options"("organizationId", "list", "code");
ALTER TABLE "picklist_options" ADD CONSTRAINT "picklist_options_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same values, now text (the clientId+mcoName unique index is rebuilt in place).
ALTER TABLE "applications"
  ALTER COLUMN "agency" TYPE TEXT USING "agency"::text,
  ALTER COLUMN "ballIsWith" TYPE TEXT USING "ballIsWith"::text;
ALTER TABLE "mco_credentials"
  ALTER COLUMN "mcoName" TYPE TEXT USING "mcoName"::text,
  ALTER COLUMN "ballIsWith" TYPE TEXT USING "ballIsWith"::text;

DROP TYPE "Agency";
DROP TYPE "BallWith";
DROP TYPE "McoName";

-- Every existing organization starts with the lists the app had hardcoded
-- (labels exactly as the UI showed them). New orgs get theirs from
-- seedOrganization() — src/lib/picklists.ts DEFAULT_PICKLISTS.
INSERT INTO "picklist_options" ("id", "organizationId", "list", "code", "label", "sortOrder", "updatedAt")
SELECT 'plo_' || o.id || '_' || v.list || '_' || v.code, o.id, v.list::"PicklistKind", v.code, v.label, v.sort_order, CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (VALUES
  ('AGENCY', 'IDPH', 'IDPH', 0),
  ('AGENCY', 'IDOA', 'IDoA', 1),
  ('AGENCY', 'IDHS', 'IDHS', 2),
  ('AGENCY', 'OTHER', 'Other', 3),
  ('PAYER', 'AETNA', 'Aetna', 0),
  ('PAYER', 'BCBS_IL', 'BCBS IL', 1),
  ('PAYER', 'COUNTY_CARE', 'CountyCare', 2),
  ('PAYER', 'HUMANA', 'Humana', 3),
  ('PAYER', 'MERIDIAN', 'Meridian', 4),
  ('PAYER', 'MOLINA', 'Molina', 5),
  ('PAYER', 'OTHER', 'Other', 6),
  ('BALL_WITH', 'CTK', 'CTK', 0),
  ('BALL_WITH', 'CLIENT', 'Client', 1),
  ('BALL_WITH', 'GOVERNMENT', 'Government', 2)
) AS v(list, code, label, sort_order);
