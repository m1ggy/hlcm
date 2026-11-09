import { redirect } from "next/navigation";
import { requireSession } from "@/lib/rbac";
import { listMyWorkEverywhere } from "@/lib/work-everywhere";
import { isOverdue, projectColorClass, type WorkTaskPriority, type WorkTaskStatus } from "@/lib/work";
import { currentWorkspaceTimezone } from "@/lib/db";
import { toDateInputValue } from "@/lib/time-entries";
import { cn } from "@/lib/utils";
import { PriorityLabel, WorkStatusPill, formatDay } from "@/components/work/work-status";
import { OpenInWorkspace } from "@/components/workspaces/open-in-workspace";

// My open tasks in every client workspace I'm assigned to, from my home
// workspace (docs/workspace-tasks-plan.md, Phase 5). Clicking one switches
// to that workspace and opens the task.
export default async function ClientWorkPage() {
  const session = await requireSession();
  if (session.user.isAssigned) redirect("/work/my"); // a linked account: this is a client workspace
  const [groups, timeZone] = await Promise.all([listMyWorkEverywhere(session.user.id), currentWorkspaceTimezone()]);
  const today = toDateInputValue(new Date(), timeZone);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Client work</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your open tasks in the client workspaces you&apos;re assigned to. Click one to open it there. They&apos;re also on your end-of-day report.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">You&apos;re not assigned to any client workspaces.</p>
      ) : total === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nothing assigned to you in your client workspaces right now.</p>
      ) : (
        groups.map((g) => (
          <section key={g.workspace.slug} className="space-y-2">
            <h2 className="text-sm font-semibold">
              {g.workspace.name} <span className="font-normal text-muted-foreground">· {g.tasks.length}</span>
            </h2>
            {g.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open.</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {g.tasks.map((t) => {
                  const overdue = isOverdue({ status: t.status as WorkTaskStatus, dueDate: t.dueDate }, today);
                  return (
                    <li key={t.id}>
                      <OpenInWorkspace slug={g.workspace.slug} path={`/work/projects/${t.project.id}?task=${t.id}`} className="flex-wrap gap-y-1 px-4 py-3 hover:bg-muted/60">
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
                        <span className={cn("w-28 text-right text-xs tabular-nums", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                          {t.dueDate ? (overdue ? `Overdue · ${formatDay(t.dueDate)}` : formatDay(t.dueDate)) : "No due date"}
                        </span>
                      </OpenInWorkspace>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
