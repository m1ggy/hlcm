-- Workspace file library (docs/file-management-plan.md): a client workspace's
-- own Files page, one folder tree for the whole workspace, separate from task
-- attachments. Folders and files carry library = true instead of a client or
-- application. No new tables, so the tenant policies already cover it.

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "library" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "file_folders" ADD COLUMN     "library" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "file_assets_organizationId_library_idx" ON "file_assets"("organizationId", "library");

-- CreateIndex
CREATE INDEX "file_folders_organizationId_library_parentId_idx" ON "file_folders"("organizationId", "library", "parentId");

-- A folder still has exactly one owner: a client, an application, or the library.
ALTER TABLE "file_folders" DROP CONSTRAINT "file_folders_one_owner";
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_one_owner"
  CHECK ((("clientId" IS NOT NULL)::int + ("applicationId" IS NOT NULL)::int + "library"::int) = 1);
