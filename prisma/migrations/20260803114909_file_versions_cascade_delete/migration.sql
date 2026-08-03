-- DropForeignKey
ALTER TABLE "file_versions" DROP CONSTRAINT "file_versions_fileAssetId_fkey";

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
