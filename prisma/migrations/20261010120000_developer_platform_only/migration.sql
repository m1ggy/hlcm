-- DEVELOPER becomes the platform superadmin role and exists only in the
-- platform organization (org_platform). Inside a workspace it no longer
-- means anything, so a workspace's DEVELOPER (the old break-glass account)
-- becomes an OWNER of that workspace; the platform org's admins, created
-- as OWNERs until now, become DEVELOPERs.
UPDATE "users" SET "role" = 'OWNER' WHERE "role" = 'DEVELOPER' AND "organizationId" <> 'org_platform';
UPDATE "users" SET "role" = 'DEVELOPER' WHERE "organizationId" = 'org_platform' AND "role" <> 'DEVELOPER';

-- From now on: DEVELOPER if and only if the user belongs to the platform org.
ALTER TABLE "users" ADD CONSTRAINT "users_developer_platform_only"
  CHECK (("role" = 'DEVELOPER') = ("organizationId" = 'org_platform'));
