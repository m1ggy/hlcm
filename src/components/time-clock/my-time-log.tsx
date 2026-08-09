import { listMyTimeEntries } from "@/lib/actions/time-entries";
import { hoursBetween, formatDuration } from "@/lib/time-entries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function MyTimeLog({ limit = 25 }: { limit?: number }) {
  const entries = await listMyTimeEntries(limit);

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
            <TableCell>{entry.clockIn.toLocaleDateString()}</TableCell>
            <TableCell>{entry.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
            <TableCell>
              {entry.clockOut
                ? entry.clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "In progress"}
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
