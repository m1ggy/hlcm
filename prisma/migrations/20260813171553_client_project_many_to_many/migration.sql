-- Client <-> Project becomes many-to-many: a client can be worked under more
-- than one project instead of being duplicated per project.

-- CreateTable (join table, before touching the old column so we can backfill from it)
CREATE TABLE "_ClientToProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClientToProject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ClientToProject_B_index" ON "_ClientToProject"("B");

-- AddForeignKey
ALTER TABLE "_ClientToProject" ADD CONSTRAINT "_ClientToProject_A_fkey" FOREIGN KEY ("A") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToProject" ADD CONSTRAINT "_ClientToProject_B_fkey" FOREIGN KEY ("B") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every client keeps its existing project as a link before the
-- scalar column disappears.
INSERT INTO "_ClientToProject" ("A", "B")
SELECT "id", "projectId" FROM "clients" WHERE "projectId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_projectId_fkey";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "projectId";
