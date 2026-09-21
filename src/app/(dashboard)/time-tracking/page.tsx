import { auth } from "@/auth";
import { blockCaregiverRoute, isManagement } from "@/lib/rbac";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listMyTaskOptions } from "@/lib/actions/tasks";
import { listOpenTeamTimers, getMyOpenTaskTimer, listMyRecentTimerTasks } from "@/lib/actions/task-time-entries";
import { getAccount } from "@/lib/actions/account";
import { AddTaskTimeDialog } from "@/components/time-clock/add-task-time-dialog";
import { TaskTimeWeekGrid } from "@/components/time-clock/task-time-week-grid";
import { TaskTimeReport } from "@/components/time-clock/task-time-report";
import { TaskTimerBar } from "@/components/time-clock/task-timer-bar";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration } from "@/lib/time-entries";
import { Radio } from "lucide-react";

// Separate from /time (the attendance clock) on purpose — that page is
// payroll/shift tracking; this is Everhour-style work time tracked against
// a Task, for case-level reporting and "bill tracked time" on an invoice.
// A person can be clocked in for the day and running/not-running this
// timer independently — see TaskTimerWidget in the nav.
export default async function TimeTrackingPage() {
  await blockCaregiverRoute();
  const session = await auth();
  const role = session?.user?.role;
  const canSeeAllUsers = isManagement(role);

  const [taskOptions, users, account, openTimers, myTimer, recentTasks] = await Promise.all([
    listMyTaskOptions(),
    canSeeAllUsers ? listAssignableUsers() : Promise.resolve([]),
    getAccount(),
    canSeeAllUsers ? listOpenTeamTimers() : Promise.resolve([]),
    getMyOpenTaskTimer(),
    listMyRecentTimerTasks(5),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Time tracking</h1>
          <PageInfoButton title="Time tracking">
            <p>
              Track work time against a task — start the timer from the top bar, or log a block of time after the
              fact. This is separate from the Time page&apos;s attendance clock: you can be clocked in for the day
              and running (or not running) a task timer independently.
            </p>
            <p>Hours logged here feed the weekly grid, the report below, and can be billed to a client&apos;s invoice.</p>
          </PageInfoButton>
        </div>
        <AddTaskTimeDialog
          tasks={taskOptions}
          users={canSeeAllUsers ? users.map((u) => ({ id: u.id, name: u.name })) : undefined}
          accountTimezone={account.timezone}
        />
      </div>

      <TaskTimerBar
        key={`${myTimer?.id ?? "idle"}:${myTimer?.description ?? ""}`}
        running={
          myTimer
            ? { taskLabel: myTimer.task?.label ?? null, startedAt: myTimer.startedAt.toISOString(), description: myTimer.description }
            : null
        }
        recentTasks={recentTasks}
      />

      {canSeeAllUsers && openTimers.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Radio className="size-3.5 text-blue-600" /> Currently running ({openTimers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {openTimers.map((t) => (
                <span
                  key={t.id}
                  className="rounded-md border border-blue-500/40 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400"
                >
                  {t.user.name} — {t.task?.label ?? "Internal / no task"} ·{" "}
                  {formatDuration(t.runningHours)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Tabs defaultValue="week">
            <TabsList>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
            </TabsList>
            <TabsContent value="week">
              <TaskTimeWeekGrid
                accountTimezone={account.timezone}
                tasks={taskOptions}
                canSeeAllUsers={canSeeAllUsers}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
              />
            </TabsContent>
            <TabsContent value="report">
              <TaskTimeReport
                accountTimezone={account.timezone}
                canSeeAllUsers={canSeeAllUsers}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
                tasks={taskOptions}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
