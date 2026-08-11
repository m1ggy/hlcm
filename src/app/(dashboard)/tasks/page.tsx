import { auth } from "@/auth";
import { listStandaloneTasks } from "@/lib/actions/tasks";
import { listAssignableUsers } from "@/lib/actions/applications";
import { NewStandaloneTaskDialog } from "@/components/tasks/new-standalone-task-dialog";
import { StandaloneTasksView } from "@/components/tasks/standalone-tasks-view";
import { PageInfoButton } from "@/components/shared/page-info-button";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [tasks, assignableUsers] = await Promise.all([
    listStandaloneTasks(),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <PageInfoButton title="Tasks">
            <p>
              To-dos that aren&apos;t part of any client case — internal errands, recurring office work, anything
              worth tracking on its own.
            </p>
          </PageInfoButton>
        </div>
        <NewStandaloneTaskDialog assignableUsers={assignableUsers} currentUserId={session.user.id} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <StandaloneTasksView tasks={tasks} assignableUsers={assignableUsers} />
      )}
    </div>
  );
}
