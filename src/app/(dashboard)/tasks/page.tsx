import { auth } from "@/auth";
import { listMyTasks } from "@/lib/actions/tasks";
import { listAssignableUsers } from "@/lib/actions/applications";
import { NewStandaloneTaskDialog } from "@/components/tasks/new-standalone-task-dialog";
import { MyTasksView } from "@/components/tasks/standalone-tasks-view";
import { PageInfoButton } from "@/components/shared/page-info-button";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [tasks, assignableUsers] = await Promise.all([
    listMyTasks(),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">My Tasks</h1>
          <PageInfoButton title="My Tasks">
            <p>
              Everything assigned to you — internal errands and recurring office work alongside checklist items from
              your cases. Each task from a case shows which one it&apos;s from; use the link to jump straight there.
            </p>
          </PageInfoButton>
        </div>
        <NewStandaloneTaskDialog assignableUsers={assignableUsers} currentUserId={session.user.id} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks assigned to you yet.</p>
      ) : (
        <MyTasksView tasks={tasks} assignableUsers={assignableUsers} isAdmin={session.user.role === "ADMIN"} />
      )}
    </div>
  );
}
