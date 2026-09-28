-- Dashboard "Set up your workspace" checklist for new workspaces' owners.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "setupChecklistDismissedAt" TIMESTAMP(3);

-- Workspaces that already exist are set up — don't show them the checklist.
UPDATE "organizations" SET "setupChecklistDismissedAt" = CURRENT_TIMESTAMP;
