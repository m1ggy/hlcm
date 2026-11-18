import { after } from "next/server";
import { currentOrg, currentOrganization, db, runAsTenant } from "@/lib/db";
import { homeTextSettings } from "@/lib/workspace-assignments";
import { getEmailBranding } from "@/lib/email";
import { notify } from "@/lib/notifications";
import { fitSms, textUser } from "@/lib/sms";
import { normalizePhone } from "@/lib/form-logic";
import type { WorkNotification } from "@/lib/work-service";

// Urgent task alerts (docs/crm-requests-phase2.md): when a workspace task is
// marked Urgent, everyone on it plus the workspace's Owners, Admins and
// Managers get an in-app notification, an email (unless they turned email
// off) and a text (if they have a mobile number and haven't turned urgent
// texts off or replied STOP). Never the person who marked it.

const MANAGERS = ["OWNER", "ADMIN", "MANAGER"] as const;

type TextTarget = { id: string; phone: string | null; smsOptedOutAt: Date | null };

export type UrgentAlerts = {
  notifications: WorkNotification[];
  texts: { user: TextTarget; body: string }[];
};

/** Who to alert about this task and what to send them. Reads only; sends nothing. */
export async function urgentTaskAlerts(actorId: string, taskId: string): Promise<UrgentAlerts> {
  const task = await db.workTask.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, project: { select: { name: true } }, assignees: { select: { userId: true } } },
  });
  if (!task) return { notifications: [], texts: [] };
  const assigneeIds = task.assignees.map((a) => a.userId);
  const [people, actor, org, { appUrl }] = await Promise.all([
    db.user.findMany({
      where: {
        id: { not: actorId },
        active: true,
        isSupport: false,
        role: { not: "CAREGIVER" },
        OR: [{ id: { in: assigneeIds } }, { role: { in: [...MANAGERS] } }],
      },
      select: { id: true, phone: true, smsUrgentAlerts: true, smsOptedOutAt: true, assignedFromUserId: true },
    }),
    db.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    currentOrganization(),
    getEmailBranding(),
  ]);

  // A managing company's staff work here through a linked account with no
  // number of its own: their home account holds the number and the setting.
  const homes = await homeTextSettings(people.flatMap((p) => (p.assignedFromUserId ? [p.assignedFromUserId] : [])));
  const homeById = new Map(homes.map((h) => [h.id, h]));

  const by = actor?.name ?? "Someone";
  const message = `${by} marked "${task.title}" (${task.project.name}) urgent`;
  const head = `URGENT in ${org.name}: ${by} marked "`;
  const tail = `" urgent. ${appUrl}/work/tasks/${task.id} Reply STOP to opt out.`;
  const body = head + fitSms(task.title, Math.max(40, 320 - head.length - tail.length)) + tail;

  const notifications: WorkNotification[] = [];
  const texts: UrgentAlerts["texts"] = [];
  for (const p of people) {
    notifications.push({ userId: p.id, type: "WORK_TASK_URGENT", message, entityType: "WorkTask", entityId: task.id });
    const source = p.assignedFromUserId ? homeById.get(p.assignedFromUserId) : p;
    const phone = source?.phone ? normalizePhone(source.phone) : null;
    if (!source || !phone || !source.smsUrgentAlerts || source.smsOptedOutAt) continue;
    // Logged against the person's row in this workspace.
    texts.push({ user: { id: p.id, phone, smsOptedOutAt: null }, body });
  }
  return { notifications, texts };
}

/** Sends the alerts. Texts go out after the response, so marking a task urgent stays quick. */
export async function sendUrgentTaskAlerts(actorId: string, taskId: string) {
  const { notifications, texts } = await urgentTaskAlerts(actorId, taskId);
  for (const n of notifications) await notify(n, actorId);
  if (texts.length === 0) return;
  const org = await currentOrg();
  after(() =>
    runAsTenant(org, async () => {
      for (const t of texts) await textUser(t.user, t.body, { purpose: "urgent_task", entityId: taskId });
    })
  );
}
