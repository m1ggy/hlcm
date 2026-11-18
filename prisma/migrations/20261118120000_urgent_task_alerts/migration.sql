-- Urgent task alerts (docs/crm-requests-phase2.md): a notification type and
-- each person's opt-out of the text.
ALTER TYPE "NotificationType" ADD VALUE 'WORK_TASK_URGENT';

ALTER TABLE "users" ADD COLUMN "smsUrgentAlerts" BOOLEAN NOT NULL DEFAULT true;
