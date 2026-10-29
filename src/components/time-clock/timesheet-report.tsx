"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileDown, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getTimesheetReport,
  deleteBreakDeduction,
  deleteTimeEntry,
  deleteBreakEntry,
} from "@/lib/actions/time-entries";
import {
  effectiveTimezone,
  currentMonthRange,
  currentPayPeriodRange,
  currentWeekRange,
  dayRangeToInstants,
  formatDuration,
  formatMoney,
  hoursBetween,
  toDateInputValue,
  segmentsByDay,
  fillSegmentsRange,
  breakComplianceByDay,
  hoursByDay,
  type TimesheetTotal,
} from "@/lib/time-entries";
import { DailyTotalsTable, type DayTotal } from "@/components/time-clock/daily-totals";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { AddTimeEntryDialog } from "@/components/time-clock/add-time-entry-dialog";
import { BreakDeductionDialog } from "@/components/time-clock/break-deduction-dialog";
import { DailyTimelineChart } from "@/components/time-clock/daily-timeline-chart";
import { TimesheetDayList, type DayListEntry, type DayListBreak } from "@/components/time-clock/timesheet-day-list";

// Beyond this, a per-day bar chart gets too cramped to read — the table above
// still covers longer ranges fine, this just stops trying to chart them.
const MAX_CHARTABLE_DAYS = 62;

type TimeEntryRow = DayListEntry & {
  user: { id: string; name: string; hourlyRate: number | null };
};

type BreakDeductionRow = {
  id: string;
  userId: string | null;
  fromDate: Date;
  toDate: Date;
  minutesPerDay: number;
  note: string | null;
  user: { id: string; name: string } | null;
  createdBy: { name: string };
};

// isAdmin gates the Pay button and every change (add/edit/delete time and
// breaks) — admin and above (ADMIN, ACCOUNTANT, OWNER), the same population
// the server actions allow. Managers see the same view read-only.
export function TimesheetReport({
  users,
  recipients = [],
  accountTimezone,
  isAdmin = false,
}: {
  users: { id: string; name: string }[];
  /** Active care recipients, for the visit picker when adding/editing time. */
  recipients?: { id: string; name: string }[];
  /** The viewer's own Account timezone setting, or null if unset (falls back to the browser's). */
  accountTimezone: string | null;
  isAdmin?: boolean;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  // Empty until the admin picks someone (or "All users"), so opening the
  // page doesn't read everyone's time.
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(() => currentMonthRange(timezone).from);
  const [to, setTo] = useState(() => toDateInputValue(new Date(), timezone));
  const [totals, setTotals] = useState<TimesheetTotal[] | null>(null);
  const [entries, setEntries] = useState<TimeEntryRow[] | null>(null);
  const [breakEntries, setBreakEntries] = useState<DayListBreak[]>([]);
  const [breaks, setBreaks] = useState<BreakDeductionRow[]>([]);
  const [isPending, startTransition] = useTransition();
  // One id at a time is enough — only one delete runs at once.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Filters reload on every change; a slow earlier response must not
  // overwrite a newer one.
  const requestId = useRef(0);

  function pdfUrl() {
    const params = new URLSearchParams({ from, to, tz: timezone });
    if (userId !== "all") params.set("userId", userId);
    return `/api/export/timesheet/pdf?${params.toString()}`;
  }

  const load = useCallback(() => {
    if (!userId || !from || !to || from > to) return;
    const id = ++requestId.current;
    startTransition(async () => {
      try {
        const instants = dayRangeToInstants(from, to, timezone);
        const report = await getTimesheetReport({
          userId: userId === "all" ? undefined : userId,
          from: instants.from,
          to: instants.to,
          timeZone: timezone,
        });
        if (id !== requestId.current) return;
        setTotals(report.totals);
        setEntries(report.entries);
        setBreakEntries(report.breakEntries);
        setBreaks(report.deductions);
      } catch (error) {
        if (id === requestId.current) toast.error(error instanceof Error ? error.message : "Failed to load time");
      }
    });
  }, [from, to, timezone, userId]);

  // Loads on open and whenever the person or dates change — no Preview
  // click. Waits for the filters to settle so stepping through dates in the
  // picker doesn't fire a query per click.
  const firstLoad = useRef(true);
  useEffect(() => {
    const delay = firstLoad.current ? 0 : 400;
    firstLoad.current = false;
    const timer = setTimeout(load, delay);
    return () => clearTimeout(timer);
  }, [load]);

  function applyPreset(range: { from: string; to: string }) {
    setFrom(range.from);
    setTo(range.to);
  }

  function runDelete(id: string, action: () => Promise<void>) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await action();
        load();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't delete — try again"));
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleDeleteEntry(id: string) {
    if (!confirm("Delete this time? This can't be undone.")) return;
    runDelete(id, async () => {
      const result = await deleteTimeEntry(id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Time deleted");
    });
  }

  function handleDeleteBreak(id: string) {
    if (!confirm("Delete this break? The work time on either side is joined back into one session, so the break becomes paid time.")) return;
    runDelete(id, async () => {
      const result = await deleteBreakEntry(id);
      if (!result.ok) return void toast.error(result.error);
      if (result.data.merged) toast.success("Break deleted — the time is paid again");
      else toast.success("Break deleted", { description: `The sessions weren't joined: ${result.data.reason}.` });
    });
  }

  function handleDeleteBreakDeduction(id: string) {
    if (!confirm("Remove this break deduction? Hours/pay for this range will recalculate without it.")) return;
    runDelete(id, async () => {
      await deleteBreakDeduction(id);
      toast.success("Break deduction removed");
    });
  }

  const grandHours = totals?.reduce((sum, t) => sum + t.hours, 0) ?? 0;
  const grandPay = totals?.reduce((sum, t) => sum + (t.pay ?? 0), 0) ?? 0;

  const openBreakUserIds = useMemo(() => new Set(breakEntries.filter((b) => !b.breakEnd).map((b) => b.userId)), [breakEntries]);

  // Actual breaks taken (not deduction rules) and session counts per person.
  const perUser = useMemo(() => {
    const map = new Map<string, { breakHours: number; sessions: number }>();
    const get = (id: string) => map.get(id) ?? { breakHours: 0, sessions: 0 };
    for (const e of entries ?? []) map.set(e.userId, { ...get(e.userId), sessions: get(e.userId).sessions + 1 });
    for (const b of breakEntries) {
      if (b.breakEnd) map.set(b.userId, { ...get(b.userId), breakHours: get(b.userId).breakHours + hoursBetween(b.breakStart, b.breakEnd) });
    }
    return map;
  }, [entries, breakEntries]);
  const grandBreakHours = [...perUser.values()].reduce((sum, u) => sum + u.breakHours, 0);
  const grandSessions = [...perUser.values()].reduce((sum, u) => sum + u.sessions, 0);

  const dayCount = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const chartTooLong = Number.isFinite(dayCount) && dayCount > MAX_CHARTABLE_DAYS;
  const dailyChartData = useMemo(() => {
    if (!entries || chartTooLong || !Number.isFinite(dayCount) || dayCount <= 0) return null;
    // Break deductions (BreakDeductionRow) are a flat per-day amount with no
    // clock time of their own, so unlike the totals table there's no
    // specific span of the day to carve out of the timeline for them —
    // actual BreakEntry sessions (below) are what render as break segments.
    return fillSegmentsRange(segmentsByDay(entries, timezone), from, to);
  }, [entries, timezone, from, to, chartTooLong, dayCount]);
  const dailyBreakChartData = useMemo(() => {
    if (chartTooLong || !Number.isFinite(dayCount) || dayCount <= 0) return null;
    return fillSegmentsRange(
      segmentsByDay(breakEntries.map((b) => ({ clockIn: b.breakStart, clockOut: b.breakEnd })), timezone),
      from,
      to
    );
  }, [breakEntries, timezone, from, to, chartTooLong, dayCount]);
  // Break-policy compliance only means something for one person at a time —
  // summed across "All users" a day's combined break minutes don't say
  // whether any individual actually took theirs.
  const compliance = useMemo(() => {
    if (userId === "all" || !dailyChartData || !dailyBreakChartData) return null;
    return breakComplianceByDay(dailyChartData, dailyBreakChartData);
  }, [userId, dailyChartData, dailyBreakChartData]);
  const missingBreakDays = compliance?.filter((c) => !c.meetsBreakPolicy).length ?? 0;

  // Clocked time per day across the loaded sessions (split at midnight,
  // same as the chart) — not limited by MAX_CHARTABLE_DAYS, since it's a
  // table. Days outside [from, to] are dropped: a session that started
  // before `from` still spills its in-range part in. Break deductions
  // aren't applied here (they're per-user policy, shown in the totals).
  const dailyTotals = useMemo((): DayTotal[] | null => {
    if (!entries) return null;
    const people = new Map<string, number>();
    const byUser = new Map<string, TimeEntryRow[]>();
    for (const e of entries) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
    for (const userEntries of byUser.values()) {
      for (const [day, hours] of hoursByDay(userEntries, timezone)) {
        if (hours > 0) people.set(day, (people.get(day) ?? 0) + 1);
      }
    }
    const breakHours = hoursByDay(
      breakEntries.map((b) => ({ clockIn: b.breakStart, clockOut: b.breakEnd })),
      timezone
    );
    return [...hoursByDay(entries, timezone)]
      .filter(([day, hours]) => hours > 0 && day >= from && day <= to)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, hours]) => ({ day, hours, breakHours: breakHours.get(day) ?? 0, people: people.get(day) ?? 0 }));
  }, [entries, breakEntries, timezone, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Person</Label>
          <SearchableSelect
            items={{ all: "All users", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
            value={userId || null}
            placeholder="Choose a person"
            onValueChange={(v) => setUserId(v ?? "all")}
            searchPlaceholder="Search users..."
            className="flex h-8 w-48 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => applyPreset(currentWeekRange(timezone))}>
            This week
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyPreset(currentPayPeriodRange(timezone))}>
            This pay period
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyPreset(currentMonthRange(timezone))}>
            This month
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={load} loading={isPending} title="Refresh" aria-label="Refresh">
            {!isPending && <RefreshCw className="size-3.5" />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" nativeButton={false} disabled={!userId} render={<a href={userId ? pdfUrl() : undefined} target="_blank" rel="noopener noreferrer" />}>
            <FileDown className="size-3.5" /> PDF
          </Button>
          {isAdmin && (
            <AddTimeEntryDialog
              users={users}
              recipients={recipients}
              accountTimezone={accountTimezone}
              defaultUserId={userId}
              onAdded={load}
            />
          )}
          {isAdmin && (
            <BreakDeductionDialog users={users} defaultUserId={userId || "all"} defaultFrom={from} defaultTo={to} onAdded={load} />
          )}
        </div>
      </div>
      {from > to && <p className="text-sm text-destructive">The start date is after the end date.</p>}
      {!userId && <p className="text-sm text-muted-foreground">Choose a person, or All users, to load their time.</p>}

      {breaks.length > 0 && (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">Break deductions in this range</p>
          <ul className="space-y-1 text-sm">
            {breaks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{b.user?.name ?? "All users"}</span> — {formatDuration(b.minutesPerDay / 60)}/day,{" "}
                  {b.fromDate.toLocaleDateString()} – {b.toDate.toLocaleDateString()}
                  {b.note && <span className="text-muted-foreground"> · {b.note}</span>}
                  <span className="text-muted-foreground"> (added by {b.createdBy.name})</span>
                </span>
                {isAdmin && (
                  <Button size="xs" variant="ghost" loading={busyId === b.id} onClick={() => handleDeleteBreakDeduction(b.id)}>
                    <X className="size-3.5 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {totals && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Paid hours</TableHead>
              <TableHead>Breaks</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Total pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((t) => (
              <TableRow key={t.userId}>
                <TableCell className="font-medium">
                  {userId === "all" ? (
                    <button type="button" className="text-left hover:underline" onClick={() => setUserId(t.userId)} title="Show only this person">
                      {t.userName}
                    </button>
                  ) : (
                    t.userName
                  )}
                  {t.hasOpenEntry && <span className="ml-1.5 text-xs text-muted-foreground">(on the clock)</span>}
                  {openBreakUserIds.has(t.userId) && (
                    <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">(on break)</span>
                  )}
                </TableCell>
                <TableCell>{t.hourlyRate != null ? `${formatMoney(t.hourlyRate)}/hr` : "—"}</TableCell>
                <TableCell>
                  {formatDuration(t.hours)}
                  {t.breakHours > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">(−{formatDuration(t.breakHours)} deducted)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDuration(perUser.get(t.userId)?.breakHours ?? 0)}</TableCell>
                <TableCell className="text-muted-foreground">{perUser.get(t.userId)?.sessions ?? 0}</TableCell>
                <TableCell>{t.pay != null ? formatMoney(t.pay) : "—"}</TableCell>
              </TableRow>
            ))}
            {totals.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No time in this range.
                </TableCell>
              </TableRow>
            )}
            {totals.length > 0 && (
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell />
                <TableCell className="font-medium">{formatDuration(grandHours)}</TableCell>
                <TableCell className="font-medium">{formatDuration(grandBreakHours)}</TableCell>
                <TableCell className="font-medium">{grandSessions}</TableCell>
                <TableCell className="font-medium">{formatMoney(grandPay)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {dailyTotals && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Daily totals{" "}
            <span className="font-normal text-muted-foreground">
              ({userId === "all" ? "all users combined" : users.find((u) => u.id === userId)?.name}; clocked time, before break
              deductions)
            </span>
          </p>
          <DailyTotalsTable days={dailyTotals} showPeople={userId === "all"} />
        </div>
      )}

      {totals && (
        <div>
          <p className="mb-2 text-sm font-medium">Clock in/out per day</p>
          {chartTooLong ? (
            <p className="text-sm text-muted-foreground">Range too long to chart per day — narrow the dates to see a daily breakdown.</p>
          ) : (
            <>
              <DailyTimelineChart
                data={dailyChartData ?? []}
                breakData={dailyBreakChartData ?? undefined}
                compliance={compliance ?? undefined}
              />
              {compliance && missingBreakDays > 0 && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  {missingBreakDays} {missingBreakDays === 1 ? "day" : "days"} without the required 30-minute break.
                </p>
              )}
              {userId === "all" && (
                <p className="mt-1.5 text-xs text-muted-foreground">Select a single user to check the 30-minute break policy.</p>
              )}
            </>
          )}
        </div>
      )}

      {entries && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Time by day
            {isAdmin && (
              <span className="font-normal text-muted-foreground"> — edit, add a break, or delete from each row</span>
            )}
          </p>
          <TimesheetDayList
            entries={entries}
            breaks={breakEntries}
            timeZone={timezone}
            accountTimezone={accountTimezone}
            from={from}
            to={to}
            isAdmin={isAdmin}
            recipients={recipients}
            busyId={busyId}
            onChanged={load}
            onDeleteEntry={handleDeleteEntry}
            onDeleteBreak={handleDeleteBreak}
          />
        </div>
      )}
    </div>
  );
}
