import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applicationVisibilityFilter } from "@/lib/rbac";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";
import { OverdueTaskActions } from "@/components/tasks/overdue-task-actions";

function StatCard({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-colors group-hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {label}
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-bold">{count}</CardContent>
      </Card>
    </Link>
  );
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  const [projectCount, clientCount, applicationCount, stats] = await Promise.all([
    prisma.project.count({ where: { active: true } }),
    prisma.client.count(),
    prisma.application.count({ where: applicationVisibilityFilter(session) }),
    getDashboardStats(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
        <p className="text-muted-foreground">Role: {session.user.role}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard href="/projects" label="Projects" count={projectCount} />
        <StatCard href="/clients" label="Clients" count={clientCount} />
        <StatCard href="/applications" label="Your Applications" count={applicationCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applications by Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.applicationsByStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <Badge variant={STATUS_BADGE_VARIANT[s.status as ApplicationStatus]}>
                    {STATUS_LABELS[s.status as ApplicationStatus]}
                  </Badge>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            {stats.applicationsByStatus.every((s) => s.count === 0) && (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            )}
          </CardContent>
        </Card>

        {stats.isManagement && (
          <Card>
            <CardHeader>
              <CardTitle>Workload by Staff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.workload.map((w) => (
                <div key={w.userId} className="flex items-center justify-between text-sm">
                  <span>{w.name}</span>
                  <span className="font-medium">{w.count} open tasks</span>
                </div>
              ))}
              {stats.workload.length === 0 && (
                <p className="text-sm text-muted-foreground">No open tasks assigned.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overdue Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.overdueTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing overdue.</p>
          )}
          {stats.overdueTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-b-0">
              <div>
                <Link
                  href={task.application ? `/applications/${task.application.id}` : "/tasks"}
                  className="font-medium hover:underline"
                >
                  {task.label}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {task.application?.name ?? "Standalone"} · {task.assignedUser.name} ·{" "}
                  {TASK_STATUS_LABELS[task.status as TaskStatusValue]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">
                  Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ""}
                </span>
                {task.dueDate && <OverdueTaskActions taskId={task.id} dueDate={task.dueDate} />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
