"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getMyEntriesInRange, getMyBreaksInRange } from "@/lib/actions/time-entries";
import {
  hoursBetween,
  formatDuration,
  effectiveTimezone,
  lastNDaysRange,
  currentWeekRange,
  weekRangeForDay,
  dayRangeToInstants,
  toDateInputValue,
  segmentsByDay,
  fillSegmentsRange,
  breakComplianceByDay,
  type DaySegments,
} from "@/lib/time-entries";
import { DailyTimelineChart } from "@/components/time-clock/daily-timeline-chart";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CHART_DAYS = 14;
// A wide-enough default window that there's actually something to collapse
// into the accordion below the current week, without pulling someone's
// whole work history on every page load — widen via the date filter.
const DEFAULT_WEEKS = 8;

type ShiftRow = { id: string; clockIn: Date; clockOut: Date | null };

// "yyyy-mm-dd" -> "Sep 1" — parsed as a pure calendar date (via UTC, never
// the browser's own zone), since weekStart/weekEnd are already resolved to
// the account's effective timezone; re-parsing them with the browser's
// local offset could shift the displayed day by one near midnight.
function formatCalendarDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function totalHours(rows: ShiftRow[]) {
  return rows.reduce((sum, r) => sum + (r.clockOut ? hoursBetween(r.clockIn, r.clockOut) : 0), 0);
}

function ShiftsTable({ rows, timeZone }: { rows: ShiftRow[]; timeZone: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Clock in</TableHead>
          <TableHead>Clock out</TableHead>
          <TableHead>Hours</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{entry.clockIn.toLocaleDateString(undefined, { timeZone })}</TableCell>
            <TableCell>{entry.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone })}</TableCell>
            <TableCell>
              {entry.clockOut
                ? entry.clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone })
                : "In progress"}
            </TableCell>
            <TableCell>{entry.clockOut ? formatDuration(hoursBetween(entry.clockIn, entry.clockOut)) : "—"}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No shifts.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function MyTimeLog({ accountTimezone }: { accountTimezone: string | null }) {
  const timeZone = effectiveTimezone(accountTimezone);
  const defaultRange = useMemo(() => lastNDaysRange(DEFAULT_WEEKS * 7, timeZone), [timeZone]);

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [entries, setEntries] = useState<ShiftRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [hasLoaded, setHasLoaded] = useState(false);

  const [daily, setDaily] = useState<DaySegments[] | null>(null);
  const [dailyBreaks, setDailyBreaks] = useState<DaySegments[] | null>(null);

  function loadShifts(range: { from: string; to: string }) {
    startTransition(async () => {
      try {
        const instants = dayRangeToInstants(range.from, range.to, timeZone);
        const rows = await getMyEntriesInRange(instants);
        setEntries(rows);
      } finally {
        setHasLoaded(true);
      }
    });
  }

  function applyPreset(range: { from: string; to: string }) {
    setFrom(range.from);
    setTo(range.to);
    loadShifts(range);
  }

  // Loads once on mount: the shifts list at its default window, and the
  // fixed 14-day chart above it (unaffected by the shifts date filter —
  // it's a separate "how's my last couple weeks looked" glance, not the
  // filterable shift history below it).
  useEffect(() => {
    loadShifts(defaultRange);

    const chartRange = lastNDaysRange(CHART_DAYS, timeZone);
    const instants = dayRangeToInstants(chartRange.from, chartRange.to, timeZone);
    (async () => {
      const [chartEntries, chartBreaks] = await Promise.all([
        getMyEntriesInRange(instants),
        getMyBreaksInRange(instants),
      ]);
      setDaily(fillSegmentsRange(segmentsByDay(chartEntries, timeZone), chartRange.from, chartRange.to));
      setDailyBreaks(
        fillSegmentsRange(
          segmentsByDay(
            chartBreaks.map((b) => ({ clockIn: b.breakStart, clockOut: b.breakEnd })),
            timeZone
          ),
          chartRange.from,
          chartRange.to
        )
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);

  const compliance = useMemo(() => (daily && dailyBreaks ? breakComplianceByDay(daily, dailyBreaks) : null), [daily, dailyBreaks]);
  const missingBreakDays = compliance?.filter((c) => !c.meetsBreakPolicy).length ?? 0;

  // One group per Monday–Sunday week touched by any loaded shift, newest
  // week first — a shift is bucketed by the calendar day it clocked in on
  // (in the account's effective timezone), same as the "Date" column shows.
  const weeks = useMemo(() => {
    const byWeek = new Map<string, { weekStart: string; weekEnd: string; rows: ShiftRow[] }>();
    for (const entry of entries) {
      const day = toDateInputValue(entry.clockIn, timeZone);
      const { from: weekStart, to: weekEnd } = weekRangeForDay(day);
      const group = byWeek.get(weekStart) ?? { weekStart, weekEnd, rows: [] };
      group.rows.push(entry);
      byWeek.set(weekStart, group);
    }
    return [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  }, [entries, timeZone]);

  const thisWeek = currentWeekRange(timeZone);
  const currentWeekGroup = weeks.find((w) => w.weekStart === thisWeek.from);
  const otherWeeks = weeks.filter((w) => w.weekStart !== thisWeek.from);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Clock in/out (last {CHART_DAYS} days)</p>
        <DailyTimelineChart data={daily ?? []} breakData={dailyBreaks ?? undefined} compliance={compliance ?? undefined} />
        {missingBreakDays > 0 && (
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
            {missingBreakDays} {missingBreakDays === 1 ? "day" : "days"} without the required 30-minute break.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="my-time-from">From</Label>
          <Input id="my-time-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="my-time-to">To</Label>
          <Input id="my-time-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => loadShifts({ from, to })} loading={isPending}>
          Apply
        </Button>
        <Button variant="ghost" size="sm" onClick={() => applyPreset(currentWeekRange(timeZone))} loading={isPending}>
          This week
        </Button>
        <Button variant="ghost" size="sm" onClick={() => applyPreset(lastNDaysRange(DEFAULT_WEEKS * 7, timeZone))} loading={isPending}>
          Last {DEFAULT_WEEKS} weeks
        </Button>
      </div>

      {!hasLoaded ? (
        <p className="text-sm text-muted-foreground">Loading shifts...</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">
              This week <span className="font-normal text-muted-foreground">({formatCalendarDay(thisWeek.from)} – {formatCalendarDay(thisWeek.to)})</span>
            </p>
            <ShiftsTable rows={currentWeekGroup?.rows ?? []} timeZone={timeZone} />
          </div>

          {otherWeeks.length > 0 && (
            <Accordion multiple className="rounded-lg border px-3">
              {otherWeeks.map((week) => (
                <AccordionItem key={week.weekStart} value={week.weekStart}>
                  <AccordionTrigger>
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span>
                        Week of {formatCalendarDay(week.weekStart)} – {formatCalendarDay(week.weekEnd)}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {week.rows.length} {week.rows.length === 1 ? "shift" : "shifts"} · {formatDuration(totalHours(week.rows))}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ShiftsTable rows={week.rows} timeZone={timeZone} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          {weeks.length === 0 && <p className="text-sm text-muted-foreground">No shifts in this range.</p>}
        </div>
      )}
    </div>
  );
}
