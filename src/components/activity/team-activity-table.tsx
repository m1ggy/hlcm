"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import type { TeamRow } from "@/lib/activity-data";
import { setRequireDesktopClock } from "@/lib/actions/activity";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activityTone, formatPct, formatSeconds, timeIn } from "@/components/activity/format";
import { cn } from "@/lib/utils";

function Status({ row, timeZone }: { row: TeamRow; timeZone: string }) {
  if (!row.open) return <span className="text-muted-foreground">Off</span>;
  if (row.open.onBreak) return <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">Break since {timeIn(row.open.since, timeZone)}</Badge>;
  const fromApp = row.open.source === "AGENT";
  const stale = row.open.stale;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={stale ? "bg-rose-600" : "bg-emerald-600"}>{stale ? "App not responding" : "Working"}</Badge>
      <span className="text-xs text-muted-foreground">
        since {timeIn(row.open.since, timeZone)} · {fromApp ? row.open.deviceName ?? "Desktop app" : "Web clock"}
      </span>
    </div>
  );
}

function RequireToggle({ row }: { row: TeamRow }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Checkbox
      checked={row.requireDesktopClock}
      disabled={isPending}
      aria-label={`Require the desktop app for ${row.name}`}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          try {
            await setRequireDesktopClock(row.id, checked === true);
            toast.success(checked ? `${row.name} must now clock in from the desktop app` : `${row.name} can clock in from the web again`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update");
          }
        })
      }
    />
  );
}

export function TeamActivityTable({ rows, date, timeZone }: { rows: TeamRow[]; date: string; timeZone: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Person</TableHead>
          <TableHead>Now</TableHead>
          <TableHead className="text-right">Worked</TableHead>
          <TableHead className="text-right">Productive</TableHead>
          <TableHead>Latest screenshot</TableHead>
          <TableHead title="Clock-in only works from the desktop app">App required</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/activity/${row.id}?date=${date}`} className="font-medium hover:underline">
                {row.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {row.role.toLowerCase()} · {row.devices ? `${row.devices} device${row.devices > 1 ? "s" : ""}` : "app not installed"}
              </div>
            </TableCell>
            <TableCell>
              <Status row={row} timeZone={timeZone} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.workedSec ? formatSeconds(row.workedSec) : "—"}</TableCell>
            <TableCell className="text-right">
              {row.score.productivityPct === null ? (
                "—"
              ) : (
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", activityTone(row.score.productivityPct))}>
                  {formatPct(row.score.productivityPct)}
                </span>
              )}
            </TableCell>
            <TableCell>
              {row.latestScreenshotId ? (
                <Link href={`/admin/activity/${row.id}?date=${date}`} className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */}
                  <img src={`/api/activity/screenshots/${row.latestScreenshotId}`} alt="" loading="lazy" className="h-9 w-16 rounded border bg-muted object-cover" />
                  <span className="text-xs text-muted-foreground">{timeIn(row.latestScreenshotAt!, timeZone)}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <RequireToggle row={row} />
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              No tracked users.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
