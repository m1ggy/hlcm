-- File folders (docs/file-management-plan.md): a folder tree on a client's
-- or an application's files. Storage keys stay flat, so a folder is only a
-- row here and moving a file only changes file_assets."folderId".
--
-- Hand-written from `prisma migrate diff`. Sibling-name uniqueness (ignoring
-- case) is checked in src/lib/actions/folders.ts under an advisory lock, not
-- by an expression index Prisma can't model. Ends with the tenant policies
-- and same-org triggers every new tenant table gets.
-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "file_folders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "clientId" TEXT,
    "applicationId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_folders_organizationId_idx" ON "file_folders"("organizationId");

-- CreateIndex
CREATE INDEX "file_folders_clientId_parentId_idx" ON "file_folders"("clientId", "parentId");

-- CreateIndex
CREATE INDEX "file_folders_applicationId_parentId_idx" ON "file_folders"("applicationId", "parentId");

-- CreateIndex
CREATE INDEX "file_assets_folderId_idx" ON "file_assets"("folderId");

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "file_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "file_folders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exactly one owner.
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_one_owner" CHECK (("clientId" IS NULL) <> ("applicationId" IS NULL));

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
