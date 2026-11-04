import { formatDuration } from "@/lib/time-entries";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Days here are "yyyy-mm-dd" strings already resolved to the account's
// timezone, so they're read back as plain UTC calendar dates — never
// re-parsed in the browser's own zone, which could shift them by a day.
function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
  return parseDay(day).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

export type DayTotal = { day: string; hours: number; breakHours?: number; people?: number };

/** One week as seven small tiles (Mon–Sun), each with that day's clocked
 * total — the at-a-glance "how much did I work each day" for My Time.
 * `today` gets a ring; days with nothing logged are muted. */
export function WeekDayTotals({ days, today }: { days: DayTotal[]; today: string }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
      {days.map((d) => (
        <div
          key={d.day}
          className={`rounded-lg border px-2 py-1.5 ${d.day === today ? "border-primary/60 bg-primary/5" : ""} ${
            d.hours > 0 ? "" : "text-muted-foreground"
          }`}
        >
          <p className="text-xs text-muted-foreground">{formatDay(d.day, { weekday: "short", month: "short", day: "numeric" })}</p>
          <p className="text-sm font-medium tabular-nums">{d.hours > 0 ? formatDuration(d.hours) : "—"}</p>
          {(d.breakHours ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{formatDuration(d.breakHours!)} break</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Per-day totals for the admin timesheet range — only days with time
 * logged, newest first, with a grand total. `showPeople` adds how many
 * users clocked time that day (only meaningful for "All users"). */
export function DailyTotalsTable({ days, showPeople }: { days: DayTotal[]; showPeople: boolean }) {
  const total = days.reduce((sum, d) => sum + d.hours, 0);
  const totalBreak = days.reduce((sum, d) => sum + (d.breakHours ?? 0), 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showPeople && <TableHead className="text-right">People</TableHead>}
          <TableHead className="text-right">Clocked</TableHead>
          <TableHead className="text-right">Breaks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((d) => (
          <TableRow key={d.day}>
            <TableCell>{formatDay(d.day, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</TableCell>
            {showPeople && <TableCell className="text-right tabular-nums">{d.people ?? 0}</TableCell>}
            <TableCell className="text-right font-medium tabular-nums">{formatDuration(d.hours)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {(d.breakHours ?? 0) > 0 ? formatDuration(d.breakHours!) : "—"}
            </TableCell>
          </TableRow>
        ))}
        {days.length === 0 && (
          <TableRow>
            <TableCell colSpan={showPeople ? 4 : 3} className="text-center text-muted-foreground">
              No time logged in this range.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {days.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">
              Total · {days.length} {days.length === 1 ? "day" : "days"}
            </TableCell>
            {showPeople && <TableCell />}
            <TableCell className="text-right font-medium tabular-nums">{formatDuration(total)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {totalBreak > 0 ? formatDuration(totalBreak) : "—"}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
