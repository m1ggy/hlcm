"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { ActivityDay } from "@/lib/activity-data";
import { deleteScreenshot } from "@/lib/actions/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABEL, CATEGORY_TONE, activityTone, formatPct, formatSeconds, timeIn } from "@/components/activity/format";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = { WEB: "Web", AGENT: "Desktop app", MANUAL: "Added by admin" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ActivityDayView({ day, canDelete }: { day: ActivityDay; canDelete: boolean }) {
  const tz = day.timeZone;
  const [open, setOpen] = useState<ActivityDay["screenshots"][number] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("Delete this screenshot for good? This is logged.")) return;
    startTransition(async () => {
      try {
        await deleteScreenshot(id);
        toast.success("Screenshot deleted");
        setOpen((g) => (g && g.ids.length > 1 ? { ...g, ids: g.ids.filter((x) => x !== id) } : null));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete");
      }
    });
  }

  const hasTracking = day.blocks.length > 0 || day.screenshots.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Worked" value={formatSeconds(day.workedSec)} />
        <Stat label="Tracked by app" value={formatSeconds(day.score.trackedSec)} />
        <Stat label="Productive" value={formatPct(day.score.productivityPct)} hint={day.score.unproductivePct ? `${day.score.unproductivePct}% unproductive` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {day.entries.length === 0 && <p className="text-muted-foreground">No time on this day.</p>}
          {day.entries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">
                {timeIn(e.clockIn, tz)} – {e.clockOut ? timeIn(e.clockOut, tz) : "now"}
              </span>
              <Badge variant="outline">{SOURCE_LABEL[e.source] ?? e.source}</Badge>
              {e.deviceName && <span className="text-muted-foreground">{e.deviceName}</span>}
              {e.autoClosed && (
                <Badge
                  variant="destructive"
                  title="Clocked out automatically: no keyboard or mouse input for 2 hours, or the app stopped responding for 15 minutes"
                >
                  Auto clocked out
                </Badge>
              )}
            </div>
          ))}
          {day.breaks.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-muted-foreground">
              <span className="tabular-nums">
                {timeIn(b.breakStart, tz)} – {b.breakEnd ? timeIn(b.breakEnd, tz) : "now"}
              </span>
              <span>Break</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {!hasTracking ? (
        <p className="text-sm text-muted-foreground">No desktop app activity on this day.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Productive time by block</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {day.blocks.map((b) => (
                  <div key={b.id} className="rounded-md border p-2 text-xs">
                    <div className="tabular-nums text-muted-foreground">
                      {timeIn(b.start, tz)} – {timeIn(b.end, tz)}
                    </div>
                    <div
                      className={cn("mt-1 rounded px-1.5 py-0.5 text-center font-semibold tabular-nums", activityTone(b.score.productivityPct))}
                      title="Share of this block in apps marked Productive"
                    >
                      {formatPct(b.score.productivityPct)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Screenshots</CardTitle>
            </CardHeader>
            <CardContent>
              {day.screenshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">None on this day.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {day.screenshots.map((g) => (
                    <button
                      key={`${g.takenAt}-${g.ids[0]}`}
                      type="button"
                      onClick={() => setOpen(g)}
                      className="overflow-hidden rounded-md border text-left transition-colors hover:border-primary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */}
                      <img src={`/api/activity/screenshots/${g.ids[0]}`} alt={`Screenshot at ${timeIn(g.takenAt, tz)}`} loading="lazy" className="aspect-video w-full bg-muted object-cover" />
                      <div className="flex justify-between px-2 py-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">{timeIn(g.takenAt, tz)}</span>
                        <span>{g.ids.length > 1 ? `${g.ids.length} screens` : g.deviceName}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Apps and sites</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App or site</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.apps.slice(0, 40).map((a) => (
                    <TableRow key={`${a.label}-${a.app}`}>
                      <TableCell className="max-w-md">
                        <div className="font-medium">{a.label}</div>
                        {a.titles.length > 0 && (
                          <div className="truncate text-xs text-muted-foreground" title={a.titles.map((t) => t.title).join("\n")}>
                            {a.titles.map((t) => t.title).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded px-1.5 py-0.5 text-xs", CATEGORY_TONE[a.category])}>{CATEGORY_LABEL[a.category]}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatSeconds(a.seconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {open && `${timeIn(open.takenAt, tz)} · ${open.deviceName}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] space-y-3 overflow-y-auto">
            {open?.ids.map((id, i) => (
              <div key={id} className="space-y-1">
                {open.ids.length > 1 && <div className="text-xs text-muted-foreground">Screen {i + 1}</div>}
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */}
                <img src={`/api/activity/screenshots/${id}?size=full`} alt={`Screen ${i + 1}`} className="w-full rounded border" />
                {canDelete && (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(id)} loading={isPending} className="text-destructive">
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
