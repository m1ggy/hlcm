import { prisma } from "@/lib/prisma";
import { sendEmail, getAppUrl } from "@/lib/email";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";

const DUE_SOON_WINDOW_DAYS = 3;

function formatTask(task: { label: string; dueDate: Date | null; application: { name: string } | null }) {
  const scope = task.application ? task.application.name : "Standalone task";
  const due = task.dueDate ? task.dueDate.toLocaleDateString() : "";
  return `<li>${scope} — ${task.label} (due ${due})</li>`;
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

    const sections = [
      overdue.length ? `<h2>Overdue (${overdue.length})</h2><ul>${overdue.map(formatTask).join("")}</ul>` : "",
      dueSoon.length ? `<h2>Due soon (${dueSoon.length})</h2><ul>${dueSoon.map(formatTask).join("")}</ul>` : "",
    ].join("");

    try {
      await sendEmail({
        to: user.email,
        subject: `${overdue.length + dueSoon.length} task(s) need your attention`,
        html: `${sections}<p><a href="${getAppUrl()}/tasks">View your tasks</a></p>`,
      });
    } catch (error) {
      console.error("Failed to send due-date digest:", error);
    }
  }
}
