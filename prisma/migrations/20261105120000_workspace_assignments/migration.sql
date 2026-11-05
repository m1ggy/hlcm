-- Workspace tasks, Phase 1 (docs/workspace-tasks-plan.md): workspace kinds,
-- managing companies, and a managing company's users assigned to other
-- workspaces through linked accounts there.

CREATE TYPE "OrgKind" AS ENUM ('FULL', 'TASKS');

ALTER TYPE "AuthTokenKind" ADD VALUE 'WORKSPACE_SWITCH';

ALTER TABLE "organizations"
  ADD COLUMN "kind" "OrgKind" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "managedByOrgId" TEXT;

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_managedByOrgId_fkey"
  FOREIGN KEY ("managedByOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_not_managing_itself"
  CHECK ("managedByOrgId" IS NULL OR "managedByOrgId" <> "id");

ALTER TABLE "users" ADD COLUMN "assignedFromUserId" TEXT;

CREATE TABLE "workspace_assignments" (
    "id" TEXT NOT NULL,
    "homeOrgId" TEXT NOT NULL,
    "homeUserId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "canAssign" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "workspace_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_assignments_other_org" CHECK ("homeOrgId" <> "orgId")
);

CREATE UNIQUE INDEX "workspace_assignments_userId_key" ON "workspace_assignments"("userId");
CREATE INDEX "workspace_assignments_orgId_idx" ON "workspace_assignments"("orgId");
CREATE UNIQUE INDEX "workspace_assignments_homeUserId_orgId_key" ON "workspace_assignments"("homeUserId", "orgId");

ALTER TABLE "workspace_assignments" ADD CONSTRAINT "workspace_assignments_homeOrgId_fkey" FOREIGN KEY ("homeOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_assignments" ADD CONSTRAINT "workspace_assignments_homeUserId_fkey" FOREIGN KEY ("homeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_assignments" ADD CONSTRAINT "workspace_assignments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_assignments" ADD CONSTRAINT "workspace_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The home user must belong to the home org, and the linked account to the
-- assigned org and point back at the home user.
CREATE OR REPLACE FUNCTION workspace_assignment_orgs_match() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW."homeUserId" AND "organizationId" = NEW."homeOrgId") THEN
    RAISE EXCEPTION 'workspace assignment: home user % is not in organization %', NEW."homeUserId", NEW."homeOrgId";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW."userId" AND "organizationId" = NEW."orgId" AND "assignedFromUserId" = NEW."homeUserId") THEN
    RAISE EXCEPTION 'workspace assignment: linked user % is not a linked account in organization %', NEW."userId", NEW."orgId";
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER workspace_assignment_orgs_match
  BEFORE INSERT OR UPDATE ON "workspace_assignments"
  FOR EACH ROW EXECUTE FUNCTION workspace_assignment_orgs_match();

-- Cross-org by design: RLS on with no policy, so the restricted app role
-- (DATABASE_URL) sees and writes none of it. Only the system client
-- (table owner, exempt) touches it.
ALTER TABLE "workspace_assignments" ENABLE ROW LEVEL SECURITY;
