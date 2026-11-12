import { redirect } from "next/navigation";
import { requireSession } from "@/lib/rbac";
import { listMyWorkEverywhere } from "@/lib/work-everywhere";
import { currentWorkspaceTimezone } from "@/lib/db";
import { toDateInputValue } from "@/lib/time-entries";
import { getMyOpenTaskTimer } from "@/lib/actions/task-time-entries";
import { ClientWorkList } from "@/components/work/client-work-list";

// My open tasks in every client workspace I'm assigned to, from my home
// workspace (docs/workspace-tasks-plan.md, Phase 5). Each task ticks off,
// times and opens right here; nothing needs a switch into the workspace.
export default async function ClientWorkPage() {
  const session = await requireSession();
  if (session.user.isAssigned) redirect("/work/my"); // a linked account: this is a client workspace
  const [groups, timeZone, timer] = await Promise.all([listMyWorkEverywhere(session.user.id), currentWorkspaceTimezone(), getMyOpenTaskTimer()]);
  const today = toDateInputValue(new Date(), timeZone);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const runningTimer = timer?.workTaskId ? { orgId: timer.orgId, workTaskId: timer.workTaskId } : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Client work</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your open tasks in the client workspaces you&apos;re assigned to. Click a task to open it, start its timer, and tick it when it&apos;s done
          to say what you did; it goes on your end-of-day report.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">You&apos;re not assigned to any client workspaces.</p>
      ) : total === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nothing assigned to you in your client workspaces right now.</p>
      ) : (
        <ClientWorkList
          groups={groups.map((g) => ({ workspace: { orgId: g.workspace.orgId, slug: g.workspace.slug, name: g.workspace.name }, tasks: g.tasks }))}
          today={today}
          runningTimer={runningTimer}
        />
      )}
    </div>
  );
}
