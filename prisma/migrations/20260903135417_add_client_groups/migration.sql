-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "clientGroupId" TEXT;

-- CreateTable
CREATE TABLE "client_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_clientGroupId_idx" ON "clients"("clientGroupId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_clientGroupId_fkey" FOREIGN KEY ("clientGroupId") REFERENCES "client_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_groups" ADD CONSTRAINT "client_groups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
