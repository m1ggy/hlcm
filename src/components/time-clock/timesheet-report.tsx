"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileDown, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTimesheetTotals, listTimeEntries, deleteTimeEntry } from "@/lib/actions/time-entries";
import { payUserViaWise } from "@/lib/actions/wise";
import { formatDuration, formatMoney, hoursBetween, type TimesheetTotal } from "@/lib/time-entries";
import { AddTimeEntryDialog } from "@/components/time-clock/add-time-entry-dialog";
import { EditTimeEntryDialog } from "@/components/time-clock/edit-time-entry-dialog";

type TimeEntryRow = {
  id: string;
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  user: { id: string; name: string; hourlyRate: number | null };
};

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

// isAdmin gates both the Pay button and the entry-level management (add/
// delete) below — same population (role === "ADMIN") the caller already
// computes for pay, reused rather than adding a second identical prop.
export function TimesheetReport({ users, isAdmin = false }: { users: { id: string; name: string }[]; isAdmin?: boolean }) {
  const [userId, setUserId] = useState("all");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [totals, setTotals] = useState<TimesheetTotal[] | null>(null);
  const [entries, setEntries] = useState<TimeEntryRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payStatus, setPayStatus] = useState<Record<string, "paying" | "paid">>({});
  const [, startPaying] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handlePay(payUserId: string) {
    setPayStatus((s) => ({ ...s, [payUserId]: "paying" }));
    startPaying(async () => {
      try {
        const toEnd = new Date(`${to}T23:59:59.999`);
        await payUserViaWise({ userId: payUserId, from: new Date(`${from}T00:00:00`), to: toEnd });
        setPayStatus((s) => ({ ...s, [payUserId]: "paid" }));
        toast.success("Payout sent via Wise");
      } catch (error) {
        setPayStatus((s) => {
          const next = { ...s };
          delete next[payUserId];
          return next;
        });
        toast.error(error instanceof Error ? error.message : "Payout failed");
      }
    });
  }

  function pdfUrl() {
    const params = new URLSearchParams({ from, to });
    if (userId !== "all") params.set("userId", userId);
    return `/api/export/timesheet/pdf?${params.toString()}`;
  }

  function handlePreview() {
    if (!from || !to) {
      toast.error("Pick a date range");
      return;
    }
    startTransition(async () => {
      try {
        // "to" is a date-only input — extend to end of day so that day's sessions are included.
        const toEnd = new Date(`${to}T23:59:59.999`);
        const range = {
          userId: userId === "all" ? undefined : userId,
          from: new Date(`${from}T00:00:00`),
          to: toEnd,
        };
        const [rows, rawEntries] = await Promise.all([getTimesheetTotals(range), listTimeEntries(range)]);
        setTotals(rows);
        setEntries(rawEntries);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load totals");
      }
    });
  }

  function handleDelete(entryId: string) {
    if (!confirm("Delete this time entry? This can't be undone.")) return;
    setDeletingId(entryId);
    startTransition(async () => {
      try {
        await deleteTimeEntry(entryId);
        toast.success("Time entry deleted");
        handlePreview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete entry");
      } finally {
        setDeletingId(null);
      }
    });
  }

  const grandHours = totals?.reduce((sum, t) => sum + t.hours, 0) ?? 0;
  const grandPay = totals?.reduce((sum, t) => sum + (t.pay ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>User</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {(v: string) => (v === "all" ? "All users" : (users.find((u) => u.id === v)?.name ?? v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={handlePreview} disabled={isPending}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Preview
        </Button>
        <Button nativeButton={false} render={<a href={pdfUrl()} target="_blank" rel="noopener noreferrer" />}>
          <FileDown className="size-3.5" /> Download PDF
        </Button>
        {isAdmin && <AddTimeEntryDialog users={users} onAdded={handlePreview} />}
      </div>

      {totals && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Total pay</TableHead>
              {isAdmin && <TableHead>Payout</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((t) => (
              <TableRow key={t.userId}>
                <TableCell className="font-medium">
                  {t.userName}
                  {t.hasOpenEntry && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(on the clock)</span>
                  )}
                </TableCell>
                <TableCell>{t.hourlyRate != null ? `${formatMoney(t.hourlyRate)}/hr` : "—"}</TableCell>
                <TableCell>{formatDuration(t.hours)}</TableCell>
                <TableCell>{t.pay != null ? formatMoney(t.pay) : "—"}</TableCell>
                {isAdmin && (
                  <TableCell>
                    {payStatus[t.userId] === "paid" ? (
                      <span className="text-xs text-muted-foreground">Sent</span>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!t.pay || t.hours <= 0 || payStatus[t.userId] === "paying"}
                        onClick={() => handlePay(t.userId)}
                      >
                        {payStatus[t.userId] === "paying" ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Pay via Wise"
                        )}
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {totals.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">
                  No sessions in this range.
                </TableCell>
              </TableRow>
            )}
            {totals.length > 0 && (
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell />
                <TableCell className="font-medium">{formatDuration(grandHours)}</TableCell>
                <TableCell className="font-medium">{formatMoney(grandPay)}</TableCell>
                {isAdmin && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {entries && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Individual sessions</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Clock in</TableHead>
                <TableHead>Clock out</TableHead>
                <TableHead>Hours</TableHead>
                {isAdmin && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...entries]
                .sort((a, b) => b.clockIn.getTime() - a.clockIn.getTime())
                .map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.user.name}</TableCell>
                    <TableCell>{entry.clockIn.toLocaleDateString()}</TableCell>
                    <TableCell>{entry.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>
                      {entry.clockOut
                        ? entry.clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "In progress"}
                    </TableCell>
                    <TableCell>
                      {entry.clockOut ? formatDuration(hoursBetween(entry.clockIn, entry.clockOut)) : "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <EditTimeEntryDialog entry={entry} onUpdated={handlePreview} />
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={deletingId === entry.id}
                            onClick={() => handleDelete(entry.id)}
                          >
                            {deletingId === entry.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground">
                    No sessions in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
