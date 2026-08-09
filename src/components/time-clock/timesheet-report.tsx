"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
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
import { getTimesheetTotals } from "@/lib/actions/time-entries";
import { formatDuration, formatMoney, type TimesheetTotal } from "@/lib/time-entries";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TimesheetReport({ users }: { users: { id: string; name: string }[] }) {
  const [userId, setUserId] = useState("all");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [totals, setTotals] = useState<TimesheetTotal[] | null>(null);
  const [isPending, startTransition] = useTransition();

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
        const rows = await getTimesheetTotals({
          userId: userId === "all" ? undefined : userId,
          from: new Date(`${from}T00:00:00`),
          to: toEnd,
        });
        setTotals(rows);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load totals");
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
      </div>

      {totals && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Total pay</TableHead>
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
              </TableRow>
            ))}
            {totals.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
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
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
