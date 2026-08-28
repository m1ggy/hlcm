import { prisma } from "@/lib/prisma";
import { sendEmail, renderEmailLayout, getAppUrl } from "@/lib/email";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";

const DUE_SOON_WINDOW_DAYS = 3;

function formatTask(task: { label: string; dueDate: Date | null; application: { name: string } | null }) {
  const scope = task.application ? task.application.name : "Standalone task";
  const due = task.dueDate ? task.dueDate.toLocaleDateString() : "";
  return `<li style="margin:4px 0"><strong>${scope}</strong> — ${task.label} <span style="color:#6b7280">(due ${due})</span></li>`;
}

type DigestTask = { label: string; dueDate: Date | null; application: { name: string } | null };

// Groups every open task with a due date in the next few days (or already
// overdue) by assignee and sends each of them one digest email. A task with
// multiple assignees shows up in every one of their digests. Meant to be
// invoked at most once a day — see src/instrumentation.ts for the scheduler.
export async function sendDueDateDigests() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
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
  });

  const byAssignee = new Map<string, { user: { email: string; emailNotificationsEnabled: boolean }; tasks: DigestTask[] }>();
  for (const task of tasks) {
    const { assignees, ...digestTask } = task;
    for (const { user } of assignees) {
      const existing = byAssignee.get(user.id);
      if (existing) existing.tasks.push(digestTask);
      else byAssignee.set(user.id, { user, tasks: [digestTask] });
    }
  }

  for (const [, { user, tasks: userTasks }] of byAssignee) {
    if (!user.emailNotificationsEnabled) continue;

    const overdue = userTasks.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime());
    const dueSoon = userTasks.filter((t) => !overdue.includes(t));
    const total = overdue.length + dueSoon.length;

    const sections = [
      overdue.length
        ? `<p style="margin:0 0 4px;font-weight:600;color:#b91c1c">Overdue (${overdue.length})</p><ul style="margin:0 0 16px;padding-left:18px">${overdue.map(formatTask).join("")}</ul>`
        : "",
      dueSoon.length
        ? `<p style="margin:0 0 4px;font-weight:600;color:#1f2937">Due in the next ${DUE_SOON_WINDOW_DAYS} days (${dueSoon.length})</p><ul style="margin:0;padding-left:18px">${dueSoon.map(formatTask).join("")}</ul>`
        : "",
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
}
