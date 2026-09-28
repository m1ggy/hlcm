-- Per-organization reply-to address for outgoing email.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "replyToEmail" TEXT;

