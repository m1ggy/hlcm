import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireWorkViewer } from "@/lib/work-session";
import { listMyWorkTasks, workspaceToday } from "@/lib/work-data";
import { isOverdue, projectColorClass, type WorkTaskPriority, type WorkTaskStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { PriorityLabel, WorkStatusPill, formatDay } from "@/components/work/work-status";
import { TaskCheck } from "@/components/work/task-update-dialog";

// My tasks in this workspace: open, assigned to me, soonest due first.
export default async function MyWorkTasksPage() {
  const { viewer, scope } = await requireWorkViewer();
  if (scope.side !== "team") notFound();
  const [tasks, today] = await Promise.all([listMyWorkTasks(scope, viewer.userId), workspaceToday()]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/work" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">My tasks</h1>
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nothing assigned to you right now.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {tasks.map((t) => {
            const overdue = isOverdue({ status: t.status as WorkTaskStatus, dueDate: t.dueDate }, today);
            return (
              <li key={t.id} className="flex items-center hover:bg-muted/60">
                <TaskCheck className="ml-4" task={{ id: t.id, title: t.title, status: t.status, clientCanSee: t.clientVisible && t.project.clientVisible }} />
                <Link href={`/work/projects/${t.project.id}?task=${t.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className={cn("size-2 shrink-0 rounded-full", projectColorClass(t.project.color))} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.project.name}
                      {t.parent && ` / ${t.parent.title}`}
                    </span>
                  </span>
                  <PriorityLabel priority={t.priority as WorkTaskPriority} />
                  <WorkStatusPill status={t.status as WorkTaskStatus} />
                  <span className={cn("w-24 text-right text-xs tabular-nums", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {t.dueDate ? (overdue ? `Overdue · ${formatDay(t.dueDate)}` : formatDay(t.dueDate)) : "No due date"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
