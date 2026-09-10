import { prisma } from "@/lib/prisma";
import { sendEmail, renderEmailLayout, getAppUrl } from "@/lib/email";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";
import { computeLicenseAlerts } from "@/lib/aging-alerts";

const DUE_SOON_WINDOW_DAYS = 3;
// Matches computeLicenseAlerts' own 60-day warning threshold — the query
// below only needs to fetch licenses that could possibly produce an alert.
const LICENSE_WINDOW_DAYS = 60;

function formatTask(task: { label: string; dueDate: Date | null; application: { name: string } | null }) {
  const scope = task.application ? task.application.name : "Standalone task";
  const due = task.dueDate ? task.dueDate.toLocaleDateString() : "";
  return `<li style="margin:4px 0"><strong>${scope}</strong> — ${task.label} <span style="color:#6b7280">(due ${due})</span></li>`;
}

type DigestTask = { label: string; dueDate: Date | null; application: { name: string } | null };

function formatLicense(license: { licenseType: string; expiryDate: Date; client: { name: string } }, now: Date) {
  const [alert] = computeLicenseAlerts(license.expiryDate, now);
  const color = alert?.severity === "critical" ? "#b91c1c" : "#92400e";
  return `<li style="margin:4px 0"><strong>${license.client.name}</strong> — ${license.licenseType} <span style="color:${color}">(${alert?.message ?? ""})</span></li>`;
}

// Licenses have no natural assignee (unlike tasks) — this section goes to
// every active ADMIN/MANAGER once per run, same content for all of them.
// Built once and reused rather than a per-recipient query.
async function buildLicenseSectionHtml(now: Date): Promise<string> {
  const windowEnd = new Date(now.getTime() + LICENSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const licenses = await prisma.clientLicense.findMany({
    where: { expiryDate: { lte: windowEnd }, client: { active: true } },
    select: { licenseType: true, expiryDate: true, client: { select: { name: true } } },
    orderBy: { expiryDate: "asc" },
  });
  if (licenses.length === 0) return "";
  return `<p style="margin:16px 0 4px;font-weight:600;color:#1f2937">Licenses expiring soon (${licenses.length})</p><ul style="margin:0;padding-left:18px">${licenses.map((l) => formatLicense(l, now)).join("")}</ul>`;
}

// Groups every open task with a due date in the next few days (or already
// overdue) by assignee and sends each of them one digest email, with a
// licenses-expiring-soon section appended for ADMIN/MANAGER recipients (an
// ADMIN/MANAGER with no tasks due still gets a dedicated email for just
// that section, rather than being skipped). A task with multiple assignees
// shows up in every one of their digests. Meant to be invoked at most once
// a day — see src/instrumentation.ts for the scheduler.
export async function sendDueDateDigests() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [tasks, licenseSectionHtml, managers] = await Promise.all([
    prisma.task.findMany({
      where: {
        dueDate: { lte: windowEnd },
        status: { notIn: [...TASK_CLOSED_STATUSES] },
      },
      select: {
        label: true,
        dueDate: true,
        application: { select: { name: true } },
        assignees: { select: { user: { select: { id: true, email: true, emailNotificationsEnabled: true } } } },
      },
    }),
    buildLicenseSectionHtml(now),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, active: true, emailNotificationsEnabled: true },
      select: { id: true, email: true },
    }),
  ]);

  const byAssignee = new Map<string, { user: { email: string; emailNotificationsEnabled: boolean }; tasks: DigestTask[] }>();
  for (const task of tasks) {
    const { assignees, ...digestTask } = task;
    for (const { user } of assignees) {
      const existing = byAssignee.get(user.id);
      if (existing) existing.tasks.push(digestTask);
      else byAssignee.set(user.id, { user, tasks: [digestTask] });
    }
  }

  const managerIdsWithTaskDigest = new Set<string>();

  for (const [userId, { user, tasks: userTasks }] of byAssignee) {
    if (!user.emailNotificationsEnabled) continue;

    const overdue = userTasks.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime());
    const dueSoon = userTasks.filter((t) => !overdue.includes(t));
    const total = overdue.length + dueSoon.length;
    // Appended into this same email rather than a second one, for
    // whichever assignees also happen to be an ADMIN/MANAGER.
    const isManager = managers.some((m) => m.id === userId);
    if (isManager) managerIdsWithTaskDigest.add(userId);

    const sections = [
      overdue.length
        ? `<p style="margin:0 0 4px;font-weight:600;color:#b91c1c">Overdue (${overdue.length})</p><ul style="margin:0 0 16px;padding-left:18px">${overdue.map(formatTask).join("")}</ul>`
        : "",
      dueSoon.length
        ? `<p style="margin:0 0 4px;font-weight:600;color:#1f2937">Due in the next ${DUE_SOON_WINDOW_DAYS} days (${dueSoon.length})</p><ul style="margin:0;padding-left:18px">${dueSoon.map(formatTask).join("")}</ul>`
        : "",
      isManager ? licenseSectionHtml : "",
    ].join("");

    try {
      await sendEmail({
        to: user.email,
        subject: `${total} task${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} your attention`,
        html: renderEmailLayout({
          heading: "Daily task digest",
          bodyHtml: sections,
          ctaLabel: "View your tasks",
          ctaUrl: `${getAppUrl()}/tasks`,
          preheader: `${total} task${total === 1 ? "" : "s"} due or overdue`,
        }),
      });
    } catch (error) {
      console.error("Failed to send due-date digest:", error);
    }
  }

  // Every other active ADMIN/MANAGER (no tasks due, so no digest email
  // above to append to) still gets a dedicated email when there's
  // something expiring soon — the license section isn't lost just because
  // they have no open tasks.
  if (licenseSectionHtml) {
    for (const manager of managers) {
      if (managerIdsWithTaskDigest.has(manager.id)) continue;
      try {
        await sendEmail({
          to: manager.email,
          subject: "Licenses expiring soon",
          html: renderEmailLayout({
            heading: "License expiry digest",
            bodyHtml: licenseSectionHtml,
            ctaLabel: "View clients",
            ctaUrl: `${getAppUrl()}/clients`,
            preheader: "Licenses on client records expiring soon",
          }),
        });
      } catch (error) {
        console.error("Failed to send license digest:", error);
      }
    }
  }
}
