"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  Clock,
  Coffee,
  LogOut,
  MapPin,
  Phone,
  Play,
  Stethoscope,
} from "lucide-react";
import { clockOut, endBreak, endBreakForDay, startBreak } from "@/lib/actions/time-entries";
import { formatDuration } from "@/lib/time-entries";
import { mapsLinkForAddress } from "@/lib/geolocation";
import { formatShiftRange, SHIFT_STATUS_LABELS, type ShiftStatus } from "@/lib/visits";
import { cn } from "@/lib/utils";
import { useStartVisit, type StartableRecipient } from "@/components/visits/use-start-visit";
import { VisitChecklist } from "@/components/visits/visit-checklist";
import { EndVisitDialog } from "@/components/visits/end-visit-dialog";
import { ReportConcernDialog } from "@/components/visits/report-concern-dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Recipient = StartableRecipient & {
  address: string | null;
  careNotes: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  phone: string | null;
  client: { id: string; name: string } | null;
  instructions: { id: string; label: string }[];
};

export type TodayData = {
  timeZone: string;
  today: string;
  recipients: Recipient[];
  todayShifts: { id: string; careRecipientId: string; startMinute: number; endMinute: number; status: ShiftStatus; recipient: Recipient }[];
  currentVisit: { visitId: string; startedAt: Date; onBreak: boolean; recipient: Recipient; checkedIds: string[] } | null;
  officeClockIn: Date | null;
  breakStartedAt: Date | null;
  minutesToday: number;
};

const STATUS_STYLES: Record<ShiftStatus, string> = {
  upcoming: "bg-muted text-muted-foreground",
  late: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  missed: "bg-destructive/10 text-destructive",
  in_progress: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  done: "bg-green-500/15 text-green-800 dark:text-green-300",
};

/** Ticks every 30s — same cadence as the header clock. */
function useElapsedHours(since: Date | null) {
  const [hours, setHours] = useState(0);
  useEffect(() => {
    if (!since) return;
    const tick = () => setHours((Date.now() - new Date(since).getTime()) / 3_600_000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [since]);
  return hours;
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatToday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function CareNotes({ recipient }: { recipient: Recipient }) {
  const [open, setOpen] = useState(false);
  if (!recipient.careNotes) return null;
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <Stethoscope className="size-4 text-muted-foreground" />
        <span className="flex-1">Care needs & medical notes</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <p className="border-t px-3 py-2 text-sm whitespace-pre-wrap">{recipient.careNotes}</p>}
    </div>
  );
}

function ActiveVisitCard({ visit, timeZone }: { visit: NonNullable<TodayData["currentVisit"]>; timeZone: string }) {
  const router = useRouter();
  const { recipient } = visit;
  const elapsed = useElapsedHours(visit.onBreak ? null : visit.startedAt);
  const [endOpen, setEndOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch {
        toast.error("Something went wrong — check your connection and try again");
      }
    });
  }

  const startedLabel = new Date(visit.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });

  return (
    <Card className={cn("ring-2", visit.onBreak ? "ring-amber-500/40" : "ring-green-600/40")}>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <AvatarInitials name={recipient.name} className="size-11 text-base" />
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-medium tracking-wide uppercase", visit.onBreak ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400")}>
              {visit.onBreak ? "On a break" : "Visit in progress"}
            </p>
            <h2 className="truncate text-lg font-semibold">{recipient.name}</h2>
            <p className="text-sm text-muted-foreground">
              Started {startedLabel}
              {!visit.onBreak && ` · ${formatDuration(elapsed)}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {recipient.address && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={mapsLinkForAddress(recipient.address)} target="_blank" rel="noopener noreferrer" />}
            >
              <MapPin className="size-3.5" /> Directions
            </Button>
          )}
          {recipient.emergencyContactPhone && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${recipient.emergencyContactPhone}`} />}>
              <Phone className="size-3.5" /> Call {recipient.emergencyContactName?.split(" ")[0] ?? "emergency contact"}
              {recipient.emergencyContactRelationship && (
                <span className="text-muted-foreground">({recipient.emergencyContactRelationship.toLowerCase()})</span>
              )}
            </Button>
          )}
        </div>

        <VisitChecklist
          key={visit.visitId}
          instructions={recipient.instructions}
          checkedIds={visit.checkedIds}
          disabled={visit.onBreak}
        />
        <CareNotes recipient={recipient} />

        <div className="grid gap-2 sm:grid-cols-2">
          {visit.onBreak ? (
            <Button size="lg" className="h-12 text-base" onClick={() => run(endBreak, "Welcome back")} loading={isPending}>
              <Play className="size-4" /> Resume visit
            </Button>
          ) : (
            <Button size="lg" className="h-12 text-base" onClick={() => setEndOpen(true)} disabled={isPending}>
              <LogOut className="size-4" /> End visit
            </Button>
          )}
          {visit.onBreak ? (
            <Button variant="outline" size="lg" className="h-12 text-base" onClick={() => setEndOpen(true)} disabled={isPending}>
              <LogOut className="size-4" /> End visit
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="h-12 text-base" onClick={() => run(startBreak, "Break started")} loading={isPending}>
              <Coffee className="size-4" /> Take a break
            </Button>
          )}
        </div>
        <ReportConcernDialog recipient={recipient} />
      </CardContent>
      <EndVisitDialog open={endOpen} onOpenChange={setEndOpen} fromBreak={visit.onBreak} />
    </Card>
  );
}

/** Clocked in without a visit (office work) or on a plain break. */
function OfficeClockCard({ clockedInAt, breakStartedAt }: { clockedInAt: Date | null; breakStartedAt: Date | null }) {
  const router = useRouter();
  const elapsed = useElapsedHours(breakStartedAt ?? clockedInAt);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch {
        toast.error("Something went wrong — check your connection and try again");
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Clock className="size-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium">{breakStartedAt ? "On a break" : "Clocked in — not on a visit"}</p>
          <p className="text-sm text-muted-foreground">{formatDuration(elapsed)}</p>
        </div>
        {breakStartedAt ? (
          <>
            <Button variant="outline" onClick={() => run(endBreak, "Break ended")} loading={isPending}>
              End break
            </Button>
            <Button variant="ghost" onClick={() => run(() => endBreakForDay(), "Done for the day")} loading={isPending}>
              End day
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => run(() => clockOut(), "Clocked out")} loading={isPending}>
            Clock out
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StartButton({ recipient, busy, label = "Start visit" }: { recipient: Recipient; busy: boolean; label?: string }) {
  const { startVisit, isPending } = useStartVisit();
  return (
    <Button
      size="lg"
      className="h-11 shrink-0 px-4 text-base sm:h-9 sm:text-sm"
      onClick={() => startVisit(recipient)}
      loading={isPending}
      disabled={busy}
    >
      <Play className="size-4" /> {label}
    </Button>
  );
}

export function TodayView({ data, firstName }: { data: TodayData; firstName: string }) {
  const { currentVisit, todayShifts, recipients } = data;
  // Already on the clock (visit, office work, or break) — starting another
  // visit would fail, so every Start button waits.
  const busy = Boolean(currentVisit || data.officeClockIn || data.breakStartedAt);
  const scheduledIds = new Set(todayShifts.map((s) => s.careRecipientId));
  const unscheduled = recipients.filter((r) => !scheduledIds.has(r.id));
  const hourNow = Number(new Date().toLocaleTimeString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: data.timeZone }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting(hourNow)}, {firstName}
        </h1>
        <p className="text-muted-foreground">
          {formatToday(data.today)}
          {data.minutesToday > 0 && ` · ${formatDuration(data.minutesToday / 60)} on visits today`}
        </p>
      </div>

      {currentVisit && <ActiveVisitCard visit={currentVisit} timeZone={data.timeZone} />}
      {!currentVisit && (data.officeClockIn || data.breakStartedAt) && (
        <OfficeClockCard clockedInAt={data.officeClockIn} breakStartedAt={data.breakStartedAt} />
      )}

      {recipients.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-6 text-center">
            <p className="font-medium">No one assigned to you yet</p>
            <p className="text-sm text-muted-foreground">
              Once the office assigns you someone to care for, your visits show up here. Meanwhile, check{" "}
              <Link href="/tasks" className="font-medium text-primary hover:underline">
                My Tasks
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
              <CalendarClock className="size-4" /> Today&apos;s schedule
            </h2>
            {todayShifts.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                Nothing scheduled today. You can still start a visit below.
              </p>
            ) : (
              <ul className="space-y-2">
                {todayShifts.map((shift) => {
                  const isCurrent = currentVisit?.recipient.id === shift.careRecipientId;
                  const canStart = !isCurrent && shift.status !== "done";
                  return (
                    <li key={shift.id}>
                      <Card size="sm" className={cn(isCurrent && "opacity-60")}>
                        <CardContent className="flex flex-wrap items-center gap-3">
                          <AvatarInitials name={shift.recipient.name} className="size-9 text-sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium">{shift.recipient.name}</span>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[shift.status])}>
                                {SHIFT_STATUS_LABELS[shift.status]}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{formatShiftRange(shift.startMinute, shift.endMinute)}</p>
                            {shift.recipient.address && (
                              <a
                                href={mapsLinkForAddress(shift.recipient.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                              >
                                {shift.recipient.address}
                              </a>
                            )}
                          </div>
                          {canStart && <StartButton recipient={shift.recipient} busy={busy} />}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {unscheduled.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
                {todayShifts.length > 0 ? "Not scheduled today" : "Your recipients"}
              </h2>
              <ul className="divide-y rounded-xl border">
                {unscheduled.map((r) => {
                  const isCurrent = currentVisit?.recipient.id === r.id;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                      <AvatarInitials name={r.name} className="size-8 text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.name}</div>
                        {r.address && <div className="truncate text-xs text-muted-foreground">{r.address}</div>}
                      </div>
                      {!isCurrent && <StartButton recipient={r} busy={busy} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {busy && !currentVisit && (
            <p className="text-center text-xs text-muted-foreground">Clock out above before starting a visit.</p>
          )}
          {currentVisit && (
            <p className="text-center text-xs text-muted-foreground">End your current visit to start another.</p>
          )}
        </>
      )}
    </div>
  );
}
