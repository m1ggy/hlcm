"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listMyTaskTimeEntries, listTeamTaskTimeEntries, deleteTaskTimeEntry } from "@/lib/actions/task-time-entries";
import { weekGridRows, budgetSeverity, formatDayLabel, formatWeekRangeLabel, formatTrackedDuration, type TaskTimeEntryLite, type WeekGridRow } from "@/lib/task-time-entries";
import { dayRangeToInstants, currentWeekRange, weekRangeForDay, effectiveTimezone, toDateInputValue } from "@/lib/time-entries";
import { EditTaskTimeDialog } from "@/components/time-clock/edit-task-time-dialog";
import { QuickLogDialog } from "@/components/time-clock/quick-log-dialog";
import { listTaskOptionsForUser } from "@/lib/actions/tasks";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SEVERITY_CLASS: Record<"ok" | "warning" | "critical", string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

type TaskOption = { id: string; label: string; applicationName: string | null };

/**
 * Everhour's signature view — day columns × task rows for one week at a
 * time, with a per-task budget bar (tracked vs Task.estimatedHours). Reads
 * via listMyTaskTimeEntries (self-scoped server action) and re-fetches on
 * week navigation rather than paging client-side data, same as
 * MyTimeLog/TimesheetReport's own "refetch on range change" convention.
 * An ADMIN/MANAGER additionally gets a user picker to view a teammate's
 * week (via listTeamTaskTimeEntries) — plain staff only ever see their own.
 */
export function TaskTimeWeekGrid({
  accountTimezone,
  tasks,
  canSeeAllUsers,
  users,
}: {
  accountTimezone: string | null;
  /** For the edit dialog's task picker. */
  tasks: TaskOption[];
  canSeeAllUsers: boolean;
  users: { id: string; name: string }[];
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [weekStart, setWeekStart] = useState(() => currentWeekRange(timezone).from);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null); // null = self
  const [entries, setEntries] = useState<TaskTimeEntryLite[]>([]);
  const [isPending, startTransition] = useTransition();
  // Bumped after an edit to force the effect below to refetch even though
  // from/to/viewedUserId haven't changed — same "toggle a counter" pattern
  // as elsewhere refetching after a mutation without duplicating the fetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const [today] = useState(() => toDateInputValue(new Date(), timezone));
  // Click-a-cell logging: which task+day is open in the quick dialog, plus
  // task rows the user added by hand (a task with no time yet has no row).
  const [quickLog, setQuickLog] = useState<{ taskId: string | null; taskLabel: string; day: string } | null>(null);
  const [extraTasks, setExtraTasks] = useState<TaskOption[]>([]);
  // The "add a task row" list — the viewed person's tasks, not always mine.
  const [rowOptions, setRowOptions] = useState<TaskOption[]>(tasks);

  const { from, to } = weekRangeForDay(weekStart);
  const dayNumbers = DAY_LABELS.map((_, i) => {
    const [y, m, d] = from.split("-").map(Number);
    return toDateInputValue(new Date(Date.UTC(y, m - 1, d + i)), "UTC");
  });

  useEffect(() => {
    startTransition(async () => {
      // Week boundaries are the user's own timezone's midnights — not UTC
      // — so the fetched entries match how weekGridRows buckets them.
      const range = dayRangeToInstants(from, to, timezone);
      const rows = viewedUserId ? await listTeamTaskTimeEntries({ userId: viewedUserId, ...range }) : await listMyTaskTimeEntries(range);
      setEntries(rows as unknown as TaskTimeEntryLite[]);
    });
  }, [from, to, viewedUserId, refreshKey, timezone]);

  const baseRows = weekGridRows(entries, weekStart, timezone);
  const rows: WeekGridRow[] = [
    ...baseRows,
    ...extraTasks
      .filter((t) => !baseRows.some((r) => r.taskId === t.id))
      .map((t) => ({ taskId: t.id, taskLabel: t.label, estimatedHours: null, days: [0, 0, 0, 0, 0, 0, 0], total: 0 })),
  ];
  const addableTasks = rowOptions.filter((t) => !rows.some((r) => r.taskId === t.id));

  function switchUser(next: string | null) {
    setViewedUserId(next);
    setExtraTasks([]);
    if (!next) {
      setRowOptions(tasks);
      return;
    }
    listTaskOptionsForUser(next)
      .then(setRowOptions)
      .catch(() => setRowOptions([]));
  }
  const columnTotals = DAY_LABELS.map((_, i) => rows.reduce((sum, r) => sum + r.days[i], 0));
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  function shiftWeek(days: number) {
    const [y, m, d] = weekStart.split("-").map(Number);
    setWeekStart(toDateInputValue(new Date(Date.UTC(y, m - 1, d + days)), "UTC"));
  }

  async function handleDelete(id: string) {
    try {
      await deleteTaskTimeEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Entry deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete entry");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => shiftWeek(-7)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{formatWeekRangeLabel(from, to)}</span>
        <Button variant="ghost" size="icon-sm" onClick={() => shiftWeek(7)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="link" size="sm" onClick={() => setWeekStart(currentWeekRange(timezone).from)}>
          This week
        </Button>
        {canSeeAllUsers && (
          <div className="ml-auto w-44">
            <SearchableSelect
              items={{ __me__: "Me", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
              value={viewedUserId ?? "__me__"}
              onValueChange={(v) => switchUser(!v || v === "__me__" ? null : v)}
              searchPlaceholder="Search people..."
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="p-2 font-medium">Task</th>
              {DAY_LABELS.map((label, i) => (
                <th
                  key={label}
                  className={`p-2 text-right font-medium ${dayNumbers[i] === today ? "text-foreground" : ""}`}
                >
                  {label} <span className={dayNumbers[i] === today ? "rounded bg-primary px-1 text-primary-foreground" : ""}>{Number(dayNumbers[i].slice(8))}</span>
                </th>
              ))}
              <th className="p-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                  {isPending ? "Loading…" : "No time logged this week. Start the timer in the top bar, or use Log time."}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const severity = budgetSeverity(row.total, row.estimatedHours);
              return (
                <tr key={row.taskId ?? "internal"} className="border-b last:border-0">
                  <td className="max-w-56 p-2">
                    <div className="truncate">{row.taskLabel}</div>
                    {row.estimatedHours != null && severity && (
                      <div className="mt-1 h-1 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${SEVERITY_CLASS[severity]}`}
                          style={{ width: `${Math.min(100, (row.total / row.estimatedHours) * 100)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  {row.days.map((hours, i) => (
                    <td key={i} className="p-0 text-right tabular-nums">
                      <button
                        type="button"
                        onClick={() => setQuickLog({ taskId: row.taskId, taskLabel: row.taskLabel, day: dayNumbers[i] })}
                        title={`Log time — ${row.taskLabel}, ${formatDayLabel(dayNumbers[i])}`}
                        className="group h-full w-full cursor-pointer p-2 text-right text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:bg-primary/10 focus-visible:outline-none"
                      >
                        {hours > 0 ? (
                          formatTrackedDuration(hours)
                        ) : (
                          <>
                            <span className="group-hover:hidden group-focus-visible:hidden">—</span>
                            <span className="hidden font-medium group-hover:inline group-focus-visible:inline">+</span>
                          </>
                        )}
                      </button>
                    </td>
                  ))}
                  <td className="p-2 text-right font-medium tabular-nums">{row.total > 0 ? formatTrackedDuration(row.total) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-medium">
                <td className="p-2">Total</td>
                {columnTotals.map((hours, i) => (
                  <td key={i} className="p-2 text-right tabular-nums">{hours > 0 ? formatTrackedDuration(hours) : "—"}</td>
                ))}
                <td className="p-2 text-right tabular-nums">{formatTrackedDuration(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {addableTasks.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="w-72">
            <SearchableSelect
              items={Object.fromEntries(addableTasks.map((t) => [t.id, t.applicationName ? `${t.label} · ${t.applicationName}` : t.label]))}
              value={null}
              onValueChange={(id) => {
                const picked = addableTasks.find((t) => t.id === id);
                if (picked) setExtraTasks((prev) => [...prev, picked]);
              }}
              placeholder="+ Add a task row…"
              searchPlaceholder="Search tasks..."
            />
          </div>
          <span className="text-xs text-muted-foreground">Click any cell to log time to that task and day.</span>
        </div>
      )}

      <QuickLogDialog
        target={quickLog}
        userId={viewedUserId}
        accountTimezone={accountTimezone}
        onClose={() => setQuickLog(null)}
        onLogged={() => setRefreshKey((k) => k + 1)}
      />

      {/* Flat entry list below the grid, for editing/deleting individual
          logs — the grid itself shows daily totals per task, not each
          session, same "summary above, detail below" split as
          DailyTimelineChart + the sessions list on MyTimeLog. */}
      <div className="space-y-1">
        {entries
          .filter((e): e is TaskTimeEntryLite & { endedAt: Date } => e.endedAt !== null)
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{entry.task?.label ?? "Internal / no task"}</span>
                {entry.description && <span className="text-muted-foreground"> — {entry.description}</span>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDayLabel(toDateInputValue(entry.startedAt, timezone))} · {formatTrackedDuration(entryHoursFor(entry))}
              </span>
              <EditTaskTimeDialog entry={entry} tasks={tasks} accountTimezone={accountTimezone} onUpdated={() => setRefreshKey((k) => k + 1)} />
              <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(entry.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}

function entryHoursFor(entry: TaskTimeEntryLite): number {
  if (!entry.endedAt) return 0;
  return (entry.endedAt.getTime() - entry.startedAt.getTime()) / 3_600_000;
}
