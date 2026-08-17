"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { computeAgingAlerts, AgingAlert } from "@/lib/aging-alerts";
import { daysInStage } from "@/lib/stage-transitions";

export type ApplicationAlertGroup = {
  applicationId: string;
  applicationName: string;
  clientName: string;
  alerts: AgingAlert[];
};

export type McoAlertGroup = {
  mcoCredentialId: string;
  clientId: string;
  clientName: string;
  mcoName: string;
  alerts: AgingAlert[];
};

// Computed on read, same as the rest of this app's pull-based Notification
// pattern — no scheduler stands behind these, so a case that's been
// unopened for weeks won't self-report until someone loads a page that
// calls this. Acceptable for a dashboard panel; would need a real cron if
// this needed to page someone unprompted.
export async function listApplicationAlerts(): Promise<ApplicationAlertGroup[]> {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const apps = await prisma.application.findMany({
    where: { active: true, stageId: { not: null } },
    include: {
      client: { select: { name: true } },
      stage: true,
      stageHistory: { orderBy: { enteredAt: "desc" }, take: 1 },
    },
  });

  const now = new Date();
  const results: ApplicationAlertGroup[] = [];
  for (const app of apps) {
    const latest = app.stageHistory[0];
    const alerts = computeAgingAlerts(
      {
        entityType: "Application",
        stageAbbrev: app.stage?.abbrev ?? null,
        daysInStage: latest ? daysInStage(latest.enteredAt, now) : null,
        followUpDate: latest?.followUpDate ?? null,
        deficiencyResponseDueDate: app.deficiencyResponseDueDate,
        deficiencyResponseSubmittedDate: app.deficiencyResponseSubmittedDate,
        recredentialingDueDate: null,
      },
      now
    );
    if (alerts.length > 0) {
      results.push({ applicationId: app.id, applicationName: app.name, clientName: app.client.name, alerts });
    }
  }
  return results;
}

export async function listMcoAlerts(): Promise<McoAlertGroup[]> {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const credentials = await prisma.mcoCredential.findMany({
    include: {
      client: { select: { id: true, name: true } },
      stage: true,
      stageHistory: { orderBy: { enteredAt: "desc" }, take: 1 },
    },
  });

  const now = new Date();
  const results: McoAlertGroup[] = [];
  for (const c of credentials) {
    const latest = c.stageHistory[0];
    const alerts = computeAgingAlerts(
      {
        entityType: "McoCredential",
        stageAbbrev: c.stage?.abbrev ?? null,
        daysInStage: latest ? daysInStage(latest.enteredAt, now) : null,
        followUpDate: latest?.followUpDate ?? null,
        deficiencyResponseDueDate: c.deficiencyResponseDueDate,
        deficiencyResponseSubmittedDate: c.deficiencyResponseSubmittedDate,
        recredentialingDueDate: c.recredentialingDueDate,
      },
      now
    );
    if (alerts.length > 0) {
      results.push({ mcoCredentialId: c.id, clientId: c.client.id, clientName: c.client.name, mcoName: c.mcoName, alerts });
    }
  }
  return results;
}
