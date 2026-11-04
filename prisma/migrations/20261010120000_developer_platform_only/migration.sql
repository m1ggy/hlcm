-- DEVELOPER is the top role: the superadmin. Inside a workspace it keeps
-- full power (at least OWNER's — see isSuperuser() in src/lib/rbac.ts), so a
-- workspace's existing DEVELOPER accounts stay DEVELOPER. The platform
-- organization's admins, created as OWNERs until now, become DEVELOPERs:
-- that's who runs the console and can enter any workspace (as a hidden
-- DEVELOPER account there, src/lib/support-access.ts).
-- (Edited 2026-11-04 before reaching production: it used to turn workspace
-- DEVELOPERs into OWNERs and tie DEVELOPER to org_platform only.)
UPDATE "users" SET "role" = 'DEVELOPER' WHERE "organizationId" = 'org_platform' AND "role" <> 'DEVELOPER';

-- Every platform-org account is a DEVELOPER (DEVELOPERs can also exist in workspaces).
ALTER TABLE "users" ADD CONSTRAINT "users_developer_platform_only"
  CHECK ("organizationId" <> 'org_platform' OR "role" = 'DEVELOPER');
