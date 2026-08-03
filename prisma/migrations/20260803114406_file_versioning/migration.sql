-- CreateTable
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generation" BIGINT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_fileAssetId_version_key" ON "file_versions"("fileAssetId", "version");

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
