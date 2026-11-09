import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireWorkViewer } from "@/lib/work-session";
import { listPendingRequests } from "@/lib/work-service";
import { projectColorClass } from "@/lib/work";
import { cn } from "@/lib/utils";
import { formatDay } from "@/components/work/work-status";

// The approval queue (docs/workspace-tasks-plan.md, Phase 5): client
// requests waiting for a manager, oldest first. Opening one shows it in its
// project, where the task panel has Accept and Decline.
export default async function WorkRequestsPage() {
  const { scope } = await requireWorkViewer();
  if (!scope.canManageProjects) notFound();
  const requests = await listPendingRequests(scope);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link href="/work" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Requests to approve</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tasks the client asked for. Open one to accept it (and assign someone) or decline it with a reason the client sees.</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nothing waiting. New client requests show up here.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/work/projects/${r.project.id}?task=${r.id}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/60">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", projectColorClass(r.project.color))} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.project.name} · asked by {r.createdBy.name} on {formatDay(r.createdAt, { month: "short", day: "numeric" })}
                    {r.dueDate && ` · wanted by ${formatDay(r.dueDate, { month: "short", day: "numeric" })}`}
                  </span>
                  {r.description && <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{r.description}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
