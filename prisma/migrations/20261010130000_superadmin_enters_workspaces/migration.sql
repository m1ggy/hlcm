-- Platform admins (superadmins) can enter any workspace without the owner
-- switching support access on, each as their own hidden account in it.

-- Which platform admin a workspace's hidden support account belongs to.
ALTER TABLE "users" ADD COLUMN "platformAdminId" TEXT;
CREATE UNIQUE INDEX "users_organizationId_platformAdminId_key" ON "users"("organizationId", "platformAdminId");

-- The old shared support account (one per workspace, not tied to a person)
-- is retired; it's kept, inactive, so its audit history still has a name.
UPDATE "users" SET "active" = false WHERE "isSupport" AND "platformAdminId" IS NULL;

-- No more owner-granted support window.
ALTER TABLE "organizations" DROP COLUMN "supportAccessUntil";
