"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FileDown, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMyTaskTimeEntries, listTeamTaskTimeEntries, deleteTaskTimeEntry } from "@/lib/actions/task-time-entries";
import { summarizeByTask, formatDayLabel, formatTrackedDuration, type TaskTimeEntryLite, type TaskSummaryRow } from "@/lib/task-time-entries";
import { currentMonthRange, currentWeekRange, dayRangeToInstants, effectiveTimezone, formatMoney, toDateInputValue } from "@/lib/time-entries";
import { EditTaskTimeDialog } from "@/components/time-clock/edit-task-time-dialog";

type TaskOption = { id: string; label: string; applicationName: string | null };

/**
 * Filterable list report — one row per task, hours + billable $ (priced off
 * each entry's own User.hourlyRate). Self-scoped for a regular user; an
 * ADMIN/MANAGER additionally gets a user filter across the whole team, same
 * "self vs. team" split as TimesheetReport for the attendance clock. Below
 * the summary, a flat per-entry list (own entries always editable, anyone
 * else's requires ADMIN/MANAGER — enforced server-side, this just always
 * shows the controls) for corrections without hunting through the grid.
 */
export function TaskTimeReport({
  accountTimezone,
  canSeeAllUsers,
  users,
  tasks,
}: {
  accountTimezone: string | null;
  canSeeAllUsers: boolean;
  users: { id: string; name: string }[];
  tasks: TaskOption[];
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [{ from, to }, setRange] = useState(currentMonthRange(timezone));
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TaskTimeEntryLite[]>([]);
  const [isPending, startTransition] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    startTransition(async () => {
      const instants = dayRangeToInstants(from, to, timezone);
      const rows = canSeeAllUsers
        ? await listTeamTaskTimeEntries({ userId: userId || undefined, ...instants })
        : await listMyTaskTimeEntries(instants);
      setEntries(rows as unknown as TaskTimeEntryLite[]);
    });
  }, [from, to, userId, canSeeAllUsers, timezone, refreshKey]);

  function applyPreset(kind: "week" | "month" | "lastMonth") {
    if (kind === "week") setRange(currentWeekRange(timezone));
    else if (kind === "month") setRange(currentMonthRange(timezone));
    else {
      // Last calendar month, derived from the 1st of this month.
      const [y, m] = currentMonthRange(timezone).from.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      setRange({ from: toDateInputValue(first, "UTC"), to: toDateInputValue(last, "UTC") });
    }
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

  const rows: TaskSummaryRow[] = useMemo(() => summarizeByTask(entries), [entries]);
  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const totalBillable = rows.reduce((sum, r) => sum + r.billableAmount, 0);

  function exportCsv() {
    const header = ["Task", "Application", "Hours", "Billable amount"];
    const lines = rows.map((r) =>
      [r.taskLabel, r.applicationName ?? "", r.hours.toFixed(2), r.billableAmount.toFixed(2)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-time-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function pdfUrl() {
    const params = new URLSearchParams({ from, to, tz: timezone });
    if (userId) params.set("userId", userId);
    return `/api/export/task-time/pdf?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="tt-from">From</Label>
          <Input id="tt-from" type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tt-to">To</Label>
          <Input id="tt-to" type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-40" />
        </div>
        {canSeeAllUsers && (
          <div className="space-y-1">
            <Label>User</Label>
            <div className="w-48">
              <SearchableSelect
                items={Object.fromEntries(users.map((u) => [u.id, u.name]))}
                value={userId}
                onValueChange={setUserId}
                placeholder="Everyone"
                searchPlaceholder="Search people..."
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => applyPreset("week")}>This week</Button>
          <Button variant="ghost" size="sm" onClick={() => applyPreset("month")}>This month</Button>
          <Button variant="ghost" size="sm" onClick={() => applyPreset("lastMonth")}>Last month</Button>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={rows.length === 0}>
          <FileDown className="size-3.5" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" disabled={rows.length === 0} nativeButton={false} render={<a href={pdfUrl()} />}>
          <FileText className="size-3.5" /> Export PDF
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Application</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Billable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                {isPending ? "Loading…" : "No time logged in this range."}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.taskId ?? "internal"}>
              <TableCell>{row.taskLabel}</TableCell>
              <TableCell className="text-muted-foreground">{row.applicationName ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatTrackedDuration(row.hours)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.billableAmount > 0 ? formatMoney(row.billableAmount) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        {rows.length > 0 && (
          <tfoot>
            <TableRow className="font-medium">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatTrackedDuration(totalHours)}</TableCell>
              <TableCell className="text-right tabular-nums">{totalBillable > 0 ? formatMoney(totalBillable) : "—"}</TableCell>
            </TableRow>
          </tfoot>
        )}
      </Table>

      {/* Flat per-entry list, same "summary above, detail below" split as
          the weekly grid — the summary table groups by task, this is what
          you edit/delete a specific logged block from. */}
      {entries.filter((e) => e.endedAt).length > 0 && (
        <div className="space-y-1">
          {entries
            .filter((e): e is TaskTimeEntryLite & { endedAt: Date } => e.endedAt !== null)
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
            .map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  {canSeeAllUsers && <span className="font-medium">{entry.user.name} · </span>}
                  <span>{entry.task?.label ?? "Internal / no task"}</span>
                  {entry.description && <span className="text-muted-foreground"> — {entry.description}</span>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDayLabel(toDateInputValue(entry.startedAt, timezone))} ·{" "}
                  {formatTrackedDuration((entry.endedAt.getTime() - entry.startedAt.getTime()) / 3_600_000)}
                </span>
                <EditTaskTimeDialog
                  entry={entry}
                  tasks={tasks}
                  accountTimezone={accountTimezone}
                  onUpdated={() => setRefreshKey((k) => k + 1)}
                />
                <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(entry.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
