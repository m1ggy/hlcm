-- Multitenancy Phase 5c: the operator's own organization. The platform
-- console (create / suspend tenant workspaces) is served from its host,
-- admin.<ROOT_DOMAIN>; its OWNER/DEVELOPER users are the platform admins.
-- It holds no tenant data of its own. The first admin is created with
-- scripts/create-platform-admin.ts.
INSERT INTO "organizations" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES ('org_platform', 'platform', 'Platform', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
