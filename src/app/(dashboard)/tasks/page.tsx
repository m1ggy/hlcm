import { auth } from "@/auth";
import { listMyTasks } from "@/lib/actions/tasks";
import { listAssignableUsers, listTaskAssignableUsers } from "@/lib/actions/applications";
import { NewStandaloneTaskDialog } from "@/components/tasks/new-standalone-task-dialog";
import { MyTasksView } from "@/components/tasks/standalone-tasks-view";
import { PageInfoButton } from "@/components/shared/page-info-button";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  // listAssignableUsers is ADMIN/MANAGER/STAFF-only (it also backs the
  // Application owner/manager pickers) and would throw for a Caregiver —
  // listTaskAssignableUsers covers the same task-assignee-name-resolution
  // need without that restriction, and also includes other Caregivers.
  const isCaregiver = session.user.role === "CAREGIVER";
  const [tasks, assignableUsers] = await Promise.all([
    listMyTasks(),
    isCaregiver ? listTaskAssignableUsers() : listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">My Tasks</h1>
          <PageInfoButton title="My Tasks">
            <p>
              Everything assigned to you — internal errands and recurring office work alongside checklist items from
              your cases. Each task from a case shows which one it&apos;s from; use the link to jump straight there.
            </p>
          </PageInfoButton>
        </div>
        {!isCaregiver && <NewStandaloneTaskDialog assignableUsers={assignableUsers} currentUserId={session.user.id} />}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks assigned to you yet.</p>
      ) : (
        <MyTasksView
          tasks={tasks}
          assignableUsers={assignableUsers}
          isAdmin={session.user.role === "ADMIN"}
          isCaregiver={isCaregiver}
        />
      )}
    </div>
  );
}
