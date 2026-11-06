import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { requireWorkViewer } from "@/lib/work-session";
import { getProject, listAssignableUsers, listProjectActivity, workspaceToday } from "@/lib/work-data";
import { WORK_PROJECT_STATUS_LABELS, projectColorClass, type WorkProjectStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProjectView } from "@/components/work/project-view";
import { ProjectFormDialog } from "@/components/work/project-form-dialog";
import { RequestTaskDialog } from "@/components/work/request-task-dialog";
import { formatDay } from "@/components/work/work-status";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  const [{ id }, { task }] = await Promise.all([params, searchParams]);
  const { viewer, scope, org } = await requireWorkViewer();
  const data = await getProject(scope, id);
  if (!data) notFound();
  const { project, tasks } = data;
  const [people, activity, today] = await Promise.all([
    scope.side === "team" ? listAssignableUsers(org.kind) : Promise.resolve([]),
    listProjectActivity(scope, id),
    workspaceToday(),
  ]);
  const counted = tasks.filter((t) => t.status !== "CANCELLED");
  const done = counted.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/work" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="flex items-center gap-2.5 font-heading text-2xl font-semibold tracking-tight">
              <span className={cn("size-3 shrink-0 rounded-full", projectColorClass(project.color))} aria-hidden />
              {project.name}
              {project.status !== "ACTIVE" && <Badge variant="outline">{WORK_PROJECT_STATUS_LABELS[project.status as WorkProjectStatus]}</Badge>}
              {scope.canSeeInternal && !project.clientVisible && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="size-3" /> Hidden from client
                </Badge>
              )}
            </h1>
            {project.description && <p className="max-w-prose text-sm whitespace-pre-wrap text-muted-foreground">{project.description}</p>}
            <p className="text-xs text-muted-foreground tabular-nums">
              {done} of {counted.length} tasks done
              {project.lead && ` · Lead: ${project.lead.name}`}
              {project.dueDate && ` · Due ${formatDay(project.dueDate, { month: "short", day: "numeric", year: "numeric" })}`}
            </p>
          </div>
          <div className="flex gap-2">
            {scope.canRequestTasks && (
              <RequestTaskDialog projects={[{ id: project.id, name: project.name }]} defaultProjectId={project.id} />
            )}
            {scope.canManageProjects && (
              <ProjectFormDialog
                people={people}
                project={{
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  color: project.color,
                  status: project.status as WorkProjectStatus,
                  clientVisible: project.clientVisible,
                  leadId: project.leadId,
                  dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : null,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <ProjectView
        projectId={project.id}
        tasks={tasks}
        activity={activity}
        scope={scope}
        currentUserId={viewer.userId}
        people={people}
        today={today}
        initialTaskId={task ?? null}
      />
    </div>
  );
}
