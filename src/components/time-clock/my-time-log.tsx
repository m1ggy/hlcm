import { listMyTimeEntries } from "@/lib/actions/time-entries";
import { getAccount } from "@/lib/actions/account";
import { hoursBetween, formatDuration } from "@/lib/time-entries";
import { LocalDate, LocalTime } from "@/components/time-clock/local-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function MyTimeLog({ limit = 25 }: { limit?: number }) {
  const [entries, account] = await Promise.all([listMyTimeEntries(limit), getAccount()]);
  const timeZone = account.timezone;

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
  );
}
