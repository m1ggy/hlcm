import type { EodReportFull } from "@/lib/eod";
import type { EodReportData } from "@/components/eod/eod-types";
import type { TaskStatusValue } from "@/lib/task-status";

/** A report as the EOD pages pass it to their client components. */
export function toReportData(r: EodReportFull): EodReportData {
  return {
    id: r.id,
    reportDate: r.reportDate.toISOString().slice(0, 10),
    status: r.status,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
    summary: r.summary,
    blockers: r.blockers,
    tomorrowPlan: r.tomorrowPlan,
    reopenedAt: r.reopenedAt,
    reopenedByName: r.reopenedBy?.name ?? null,
    author: { id: r.user.id, name: r.user.name },
    items: r.items.map((i) => ({
      id: i.id,
      taskId: i.taskId,
      title: i.title,
      clientId: i.clientId,
      statusBefore: i.statusBefore as TaskStatusValue | null,
      statusAfter: i.statusAfter as TaskStatusValue | null,
      workDone: i.workDone,
      internalNote: i.internalNote,
      minutes: i.minutes,
      clientVisible: i.clientVisible,
      correspondence: i.correspondence.map((l) => l.correspondence),
      work: i.workOrgId && i.workTaskId ? { orgId: i.workOrgId, taskId: i.workTaskId, workspaceName: i.workspaceName ?? "Client workspace" } : null,
      workStatusBefore: i.workStatusBefore,
      workStatusAfter: i.workStatusAfter,
      fromTaskUpdate: i.fromTaskUpdate,
      addedAfterSubmit: i.addedAfterSubmit,
    })),
    comments: r.comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: c.author })),
  };
}
