"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, MapPin, Plus, TriangleAlert, X } from "lucide-react";
import { createVisitShifts, deleteVisitShift, resolveCareIncident } from "@/lib/actions/visits";
import { unexpectedErrorMessage, type ActionResult } from "@/lib/action-result";
import { formatDuration, hoursBetween } from "@/lib/time-entries";
import { formatDistance } from "@/lib/geolocation";
import {
  clockInDistance,
  formatShiftRange,
  INCIDENT_CATEGORY_LABELS,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_SHORT,
  type IncidentCategory,
} from "@/lib/visits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type VisitShiftRow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  caregiver: { id: string; name: string };
};

export type RecentVisitRow = {
  id: string;
  clockIn: Date;
  clockOut: Date | null;
  visitNote: string | null;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  user: { name: string };
  visitSegments: { clockIn: Date; clockOut: Date | null }[];
  visitChecks: { instructionId: string }[];
};

export type CareIncidentRow = {
  id: string;
  category: IncidentCategory;
  urgent: boolean;
  description: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  reportedBy: { name: string };
  resolvedBy: { name: string } | null;
};

function useAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<unknown>>, success: string, onDone?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        onDone?.();
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong"));
      }
    });
  }
  return { run, isPending };
}

function formatDay(date: Date) {
  return new Date(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- Schedule ---------------------------------------------------------------

function AddShiftForm({
  careRecipientId,
  caregivers,
  onDone,
}: {
  careRecipientId: string;
  caregivers: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [caregiverId, setCaregiverId] = useState(caregivers.length === 1 ? caregivers[0].id : "");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const { run, isPending } = useAction();

  function toggleDay(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  function handleAdd() {
    run(
      () => createVisitShifts({ careRecipientId, caregiverId, weekdays, start, end }),
      weekdays.length === 1 ? "Visit added to the schedule" : `${weekdays.length} visits added to the schedule`,
      onDone
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label>Caregiver</Label>
        <Select
          items={Object.fromEntries(caregivers.map((c) => [c.id, c.name]))}
          value={caregiverId || null}
          onValueChange={(v) => setCaregiverId(v ?? "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Who visits?" />
          </SelectTrigger>
          <SelectContent>
            {caregivers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Days</Label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Days of the week">
          {WEEKDAY_DISPLAY_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              aria-pressed={weekdays.includes(day)}
              className={cn(
                "h-8 min-w-11 rounded-md border px-2 text-xs font-medium transition-colors",
                weekdays.includes(day) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {WEEKDAY_SHORT[day]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`shift-start-${careRecipientId}`}>From</Label>
          <Input id={`shift-start-${careRecipientId}`} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`shift-end-${careRecipientId}`}>To</Label>
          <Input id={`shift-end-${careRecipientId}`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleAdd} disabled={!caregiverId || weekdays.length === 0} loading={isPending}>
          Add to schedule
        </Button>
      </div>
    </div>
  );
}

function DayChip({ shift }: { shift: VisitShiftRow }) {
  const { run, isPending } = useAction();
  return (
    <span className="inline-flex items-center rounded-md border bg-background py-0.5 pr-0.5 pl-2 text-xs font-medium">
      {WEEKDAY_SHORT[shift.weekday]}
      <button
        type="button"
        onClick={() => run(() => deleteVisitShift(shift.id), `${WEEKDAY_SHORT[shift.weekday]} visit removed`)}
        disabled={isPending}
        aria-label={`Remove ${WEEKDAY_SHORT[shift.weekday]} ${formatShiftRange(shift.startMinute, shift.endMinute)} visit`}
        className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Weekly visit schedule per caregiver — drives their Today page and the
 * late/missed flags on the dashboard. */
export function VisitScheduleEditor({
  careRecipientId,
  shifts,
  assignedCaregivers,
}: {
  careRecipientId: string;
  shifts: VisitShiftRow[];
  assignedCaregivers: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const byCaregiver = new Map<string, { name: string; shifts: VisitShiftRow[] }>();
  for (const s of shifts) {
    const entry = byCaregiver.get(s.caregiver.id) ?? { name: s.caregiver.name, shifts: [] };
    entry.shifts.push(s);
    byCaregiver.set(s.caregiver.id, entry);
  }
  const order = (d: number) => WEEKDAY_DISPLAY_ORDER.indexOf(d as (typeof WEEKDAY_DISPLAY_ORDER)[number]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Visit schedule</p>
        {!adding && assignedCaregivers.length > 0 && (
          <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
            <Plus className="size-3" /> Add visits
          </Button>
        )}
      </div>
      {byCaregiver.size === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          {assignedCaregivers.length === 0
            ? "Assign a caregiver first, then set when they visit."
            : "No set schedule. Add one so caregivers see their visits on Today and you're told when one's late or missed."}
        </p>
      )}
      {[...byCaregiver.entries()].map(([id, { name, shifts: caregiverShifts }]) => {
        // One row per time range, its days as removable chips — a daily
        // 9–1 reads as one line, not seven.
        const ranges = new Map<string, VisitShiftRow[]>();
        for (const s of caregiverShifts) {
          const key = `${s.startMinute}-${s.endMinute}`;
          ranges.set(key, [...(ranges.get(key) ?? []), s]);
        }
        return (
          <div key={id} className="space-y-1">
            <p className="text-sm font-medium">{name}</p>
            {[...ranges.values()]
              .sort((a, b) => a[0].startMinute - b[0].startMinute)
              .map((range) => (
                <div key={`${range[0].startMinute}-${range[0].endMinute}`} className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-sm text-muted-foreground">
                    {formatShiftRange(range[0].startMinute, range[0].endMinute)}
                  </span>
                  {[...range]
                    .sort((a, b) => order(a.weekday) - order(b.weekday))
                    .map((s) => (
                      <DayChip key={s.id} shift={s} />
                    ))}
                </div>
              ))}
          </div>
        );
      })}
      {adding && (
        <AddShiftForm careRecipientId={careRecipientId} caregivers={assignedCaregivers} onDone={() => setAdding(false)} />
      )}
    </div>
  );
}

// --- Recent visits ------------------------------------------------------------

/** First segment + continuation segments → one visit's span and hours. */
function visitSpan(visit: RecentVisitRow) {
  const segments = [{ clockIn: visit.clockIn, clockOut: visit.clockOut }, ...visit.visitSegments];
  const open = segments.some((s) => s.clockOut === null);
  const hours = segments.reduce((sum, s) => sum + (s.clockOut ? hoursBetween(new Date(s.clockIn), new Date(s.clockOut)) : 0), 0);
  const lastOut = open
    ? null
    : segments.reduce<Date | null>((latest, s) => (!latest || new Date(s.clockOut!) > latest ? new Date(s.clockOut!) : latest), null);
  return { open, hours, lastOut };
}

export function RecentVisits({
  visits,
  recipient,
  instructionCount,
}: {
  visits: RecentVisitRow[];
  recipient: { latitude: number | null; longitude: number | null };
  instructionCount: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent visits</p>
      {visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits logged yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visits.map((v) => {
            const span = visitSpan(v);
            const distance = clockInDistance(v, recipient);
            return (
              <li key={v.id} className="space-y-1 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{formatDay(v.clockIn)}</span>
                  <span className="text-muted-foreground">
                    {formatTime(v.clockIn)} – {span.lastOut ? formatTime(span.lastOut) : "now"}
                  </span>
                  <span className="text-muted-foreground">· {v.user.name}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                    {span.open ? (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 font-medium text-blue-800 dark:text-blue-300">
                        In progress
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{formatDuration(span.hours)}</span>
                    )}
                    {instructionCount > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-medium",
                          v.visitChecks.length >= instructionCount
                            ? "bg-green-500/15 text-green-800 dark:text-green-300"
                            : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                        )}
                      >
                        {Math.min(v.visitChecks.length, instructionCount)}/{instructionCount} tasks
                      </span>
                    )}
                    {distance && !distance.near && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
                        title="Clock-in location vs. the recipient's address"
                      >
                        <MapPin className="size-3" /> {formatDistance(distance.meters)} away
                      </span>
                    )}
                  </span>
                </div>
                {v.visitNote && <p className="text-sm whitespace-pre-wrap text-muted-foreground">“{v.visitNote}”</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- Concerns -----------------------------------------------------------------

function ResolveIncidentDialog({ incident }: { incident: CareIncidentRow }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, isPending } = useAction();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="xs">Resolve</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve concern</DialogTitle>
          <DialogDescription>
            {INCIDENT_CATEGORY_LABELS[incident.category]} reported by {incident.reportedBy.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`resolve-${incident.id}`}>What was done? (optional)</Label>
          <Textarea
            id={`resolve-${incident.id}`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Called the family, scheduled a doctor visit, …"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => run(() => resolveCareIncident(incident.id, note), "Concern resolved", () => setOpen(false))} loading={isPending}>
            Mark resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CareIncidents({ incidents }: { incidents: CareIncidentRow[] }) {
  const [showResolved, setShowResolved] = useState(false);
  const open = incidents.filter((i) => !i.resolvedAt);
  const resolved = incidents.filter((i) => i.resolvedAt);
  if (incidents.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Concerns from caregivers</p>
      {open.length === 0 && <p className="text-sm text-muted-foreground">No open concerns.</p>}
      {open.map((i) => (
        <div
          key={i.id}
          className={cn("space-y-1 rounded-lg border px-3 py-2", i.urgent ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5")}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TriangleAlert className={cn("size-4", i.urgent ? "text-destructive" : "text-amber-600")} />
            <span className="font-medium">{INCIDENT_CATEGORY_LABELS[i.category]}</span>
            {i.urgent && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-white">Urgent</span>}
            <span className="text-xs text-muted-foreground">
              {i.reportedBy.name} · {formatDay(i.createdAt)} {formatTime(i.createdAt)}
            </span>
            <span className="ml-auto">
              <ResolveIncidentDialog incident={i} />
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{i.description}</p>
        </div>
      ))}
      {resolved.length > 0 && (
        <>
          <Button variant="link" size="sm" className="px-0" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide resolved" : `Show ${resolved.length} resolved`}
          </Button>
          {showResolved &&
            resolved.map((i) => (
              <div key={i.id} className="space-y-0.5 rounded-lg border border-dashed px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <CircleCheck className="size-4 text-green-600" />
                  <span className="font-medium">{INCIDENT_CATEGORY_LABELS[i.category]}</span>
                  <span className="text-xs text-muted-foreground">
                    {i.reportedBy.name} · {formatDay(i.createdAt)} — resolved by {i.resolvedBy?.name ?? "someone"}
                  </span>
                </div>
                <p className="text-muted-foreground">{i.description}</p>
                {i.resolutionNote && <p className="text-xs">Resolution: {i.resolutionNote}</p>}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
