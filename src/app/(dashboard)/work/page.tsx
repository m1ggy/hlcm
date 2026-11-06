import Link from "next/link";
import { FolderKanban, Lock } from "lucide-react";
import { requireWorkViewer } from "@/lib/work-session";
import { listAssignableUsers, listProjects, listRequestableProjects, type ProjectCard } from "@/lib/work-data";
import { WORK_PROJECT_STATUS_LABELS, projectColorClass, type WorkProjectStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { ProjectFormDialog } from "@/components/work/project-form-dialog";
import { RequestTaskDialog } from "@/components/work/request-task-dialog";
import { formatDay } from "@/components/work/work-status";

// Projects (docs/workspace-tasks-plan.md, Phase 2): a tasks-only workspace's
// home, and "Work" in a full workspace.
export default async function WorkPage() {
  const { scope, org } = await requireWorkViewer();
  const [projects, people, requestable] = await Promise.all([
    listProjects(scope),
    scope.canManageProjects ? listAssignableUsers(org.kind) : Promise.resolve([]),
    scope.canRequestTasks ? listRequestableProjects(scope) : Promise.resolve([]),
  ]);
  const current = projects.filter((p) => p.status === "ACTIVE" || p.status === "ON_HOLD");
  const finished = projects.filter((p) => p.status === "DONE" || p.status === "ARCHIVED");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {scope.side === "client" ? `What the team is working on for ${org.name}.` : `Work for ${org.name}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/work/summary" />}>
            Weekly summary
          </Button>
          {scope.side === "team" && (
            <Button variant="outline" nativeButton={false} render={<Link href="/work/my" />}>
              My tasks
            </Button>
          )}
          {scope.canRequestTasks && (
            <RequestTaskDialog projects={requestable} />
          )}
          {scope.canManageProjects && (
            <ProjectFormDialog people={people} />
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div data-tour="work-projects" className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-heading text-lg font-semibold">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {scope.canManageProjects
              ? "Create a project to start adding tasks. Clients see the projects and tasks you leave visible to them."
              : scope.side === "client"
                ? "When the team starts a project for you, it shows up here with its progress."
                : "A manager creates projects; you'll see them here once there's one."}
          </p>
        </div>
      ) : (
        <>
          <ProjectGrid projects={current} showHidden={scope.canSeeInternal} />
          {finished.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Finished and archived</h2>
              <ProjectGrid projects={finished} showHidden={scope.canSeeInternal} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProjectGrid({ projects, showHidden }: { projects: ProjectCard[]; showHidden: boolean }) {
  if (projects.length === 0) return null;
  return (
    <div data-tour="work-projects" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        return (
          <Link
            key={p.id}
            href={`/work/projects/${p.id}`}
            className="flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", projectColorClass(p.color))} aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-heading text-base font-semibold">{p.name}</h3>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              </div>
              {p.status !== "ACTIVE" && <Badge variant="outline">{WORK_PROJECT_STATUS_LABELS[p.status as WorkProjectStatus]}</Badge>}
              {showHidden && !p.clientVisible && <Lock className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-label="Hidden from client" />}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  {p.done} of {p.total} done
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex flex-wrap gap-x-3">
                <span>{p.open} open</span>
                {p.overdue > 0 && <span className="font-semibold text-destructive">{p.overdue} overdue</span>}
                {p.dueDate && <span>Due {formatDay(p.dueDate)}</span>}
              </span>
              <span className="flex -space-x-1.5">
                {p.people.slice(0, 4).map((u) => (
                  <AvatarInitials key={u.id} name={u.name} className="size-6 text-[0.6rem] ring-2 ring-card" />
                ))}
              </span>
            </div>
            {p.lastActivityAt && <p className="-mt-2 text-xs text-muted-foreground">Last update {formatDay(p.lastActivityAt)}</p>}
          </Link>
        );
      })}
    </div>
  );
}
