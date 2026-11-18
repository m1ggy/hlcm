-- Activity monitoring, scope v2 (docs/activity-monitoring-plan.md): the
-- desktop app's devices, 30-minute app-usage intervals (no keyboard or mouse
-- data), screenshots, policy consents and productivity rules, all
-- tenant-scoped; the add-on and on/off switch per workspace; app-only
-- clock-in per person; where each time entry came from.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('WEB', 'AGENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProductivityCategory" AS ENUM ('PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE');

-- CreateEnum
CREATE TYPE "ProductivityMatch" AS ENUM ('APP', 'DOMAIN', 'TITLE_CONTAINS');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "activityMonitoringAddon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "activityMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monitoringPolicy" TEXT,
ADD COLUMN     "monitoringPolicyVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "requireDesktopClock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "agentDeviceId" TEXT,
ADD COLUMN     "autoClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "source" "TimeEntrySource" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "agent_devices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_intervals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "apps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "intervalId" TEXT,
    "deviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "monitors" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_consents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "userId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "deviceId" TEXT,

    CONSTRAINT "monitoring_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "matchType" "ProductivityMatch" NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" "ProductivityCategory" NOT NULL,
    "roles" "Role"[],
    "userId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_devices_userId_idx" ON "agent_devices"("userId");

-- CreateIndex
CREATE INDEX "activity_intervals_userId_start_idx" ON "activity_intervals"("userId", "start");

-- CreateIndex
CREATE INDEX "activity_intervals_timeEntryId_idx" ON "activity_intervals"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_intervals_deviceId_clientId_key" ON "activity_intervals"("deviceId", "clientId");

-- CreateIndex
CREATE INDEX "screenshots_userId_takenAt_idx" ON "screenshots"("userId", "takenAt");

-- CreateIndex
CREATE INDEX "screenshots_timeEntryId_idx" ON "screenshots"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "screenshots_deviceId_clientId_key" ON "screenshots"("deviceId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_consents_userId_policyVersion_key" ON "monitoring_consents"("userId", "policyVersion");

-- CreateIndex
CREATE INDEX "productivity_rules_organizationId_enabled_idx" ON "productivity_rules"("organizationId", "enabled");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_agentDeviceId_fkey" FOREIGN KEY ("agentDeviceId") REFERENCES "agent_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_devices" ADD CONSTRAINT "agent_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_devices" ADD CONSTRAINT "agent_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_intervals" ADD CONSTRAINT "activity_intervals_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "agent_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_intervalId_fkey" FOREIGN KEY ("intervalId") REFERENCES "activity_intervals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "agent_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_consents" ADD CONSTRAINT "monitoring_consents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_consents" ADD CONSTRAINT "monitoring_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_consents" ADD CONSTRAINT "monitoring_consents_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "agent_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_rules" ADD CONSTRAINT "productivity_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_rules" ADD CONSTRAINT "productivity_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_rules" ADD CONSTRAINT "productivity_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
