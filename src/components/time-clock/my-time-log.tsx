import { listMyTimeEntries, getMyEntriesInRange, getMyBreaksInRange } from "@/lib/actions/time-entries";
import { getAccount } from "@/lib/actions/account";
import {
  hoursBetween,
  formatDuration,
  effectiveTimezone,
  lastNDaysRange,
  dayRangeToInstants,
  segmentsByDay,
  fillSegmentsRange,
  breakComplianceByDay,
} from "@/lib/time-entries";
import { LocalDate, LocalTime } from "@/components/time-clock/local-time";
import { DailyTimelineChart } from "@/components/time-clock/daily-timeline-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CHART_DAYS = 14;

export async function MyTimeLog({ limit = 25 }: { limit?: number }) {
  const [entries, account] = await Promise.all([listMyTimeEntries(limit), getAccount()]);
  const timeZone = effectiveTimezone(account.timezone);

  const range = lastNDaysRange(CHART_DAYS, timeZone);
  const instants = dayRangeToInstants(range.from, range.to, timeZone);
  const [chartEntries, chartBreaks] = await Promise.all([
    getMyEntriesInRange(instants),
    getMyBreaksInRange(instants),
  ]);
  const daily = fillSegmentsRange(segmentsByDay(chartEntries, timeZone), range.from, range.to);
  const dailyBreaks = fillSegmentsRange(
    segmentsByDay(
      chartBreaks.map((b: { breakStart: Date; breakEnd: Date | null }) => ({ clockIn: b.breakStart, clockOut: b.breakEnd })),
      timeZone
    ),
    range.from,
    range.to
  );
  const compliance = breakComplianceByDay(daily, dailyBreaks);
  const missingBreakDays = compliance.filter((c) => !c.meetsBreakPolicy).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Clock in/out (last {CHART_DAYS} days)</p>
        <DailyTimelineChart data={daily} breakData={dailyBreaks} compliance={compliance} />
        {missingBreakDays > 0 && (
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
            {missingBreakDays} {missingBreakDays === 1 ? "day" : "days"} without the required 30-minute break.
          </p>
        )}
      </div>
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
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell><LocalDate iso={entry.clockIn.toISOString()} timeZone={timeZone} /></TableCell>
              <TableCell><LocalTime iso={entry.clockIn.toISOString()} timeZone={timeZone} /></TableCell>
              <TableCell>
                {entry.clockOut ? <LocalTime iso={entry.clockOut.toISOString()} timeZone={timeZone} /> : "In progress"}
              </TableCell>
              <TableCell>{entry.clockOut ? formatDuration(hoursBetween(entry.clockIn, entry.clockOut)) : "—"}</TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No sessions yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
