-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignedUserId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_reviewerUserId_fkey";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "assignedUserId",
DROP COLUMN "reviewerUserId";

