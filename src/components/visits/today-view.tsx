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
  MessageSquareText,
  Phone,
  Play,
  Stethoscope,
  Sunrise,
} from "lucide-react";
import { clockOut, endBreak, endBreakForDay, startBreak } from "@/lib/actions/time-entries";
import { formatDuration } from "@/lib/time-entries";
import { mapsLinkForAddress } from "@/lib/geolocation";
import { formatShiftRange, zonedClock, SHIFT_STATUS_LABELS, type ShiftStatus } from "@/lib/visits";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  /** This caregiver has never visited them — care notes open by default. */
  firstVisit: boolean;
  lastVisit: { at: Date; by: string; note: string | null; notDone: string[] } | null;
};

export type TodayData = {
  timeZone: string;
  today: string;
  recipients: Recipient[];
  todayShifts: { id: string; careRecipientId: string; startMinute: number; endMinute: number; status: ShiftStatus; recipient: Recipient }[];
  tomorrowShifts: { id: string; careRecipientId: string; startMinute: number; endMinute: number; recipient: Recipient }[];
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

/** Ticks every 30s with the current minute-of-day in the account timezone. */
function useNowMinute(timeZone: string) {
  const [minute, setMinute] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMinute(zonedClock(new Date(), timeZone).minute);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [timeZone]);
  return minute;
}

function formatStartsIn(minutes: number) {
  if (minutes <= 0) return "Starting now";
  if (minutes < 60) return `Starts in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Starts in ${h}h${m ? ` ${m}m` : ""}`;
}

// Medical notes used to start fully collapsed, so allergies and the like were
// easy to never see. Now the first lines always show; a first visit with
// someone opens them in full.
const CARE_NOTES_PREVIEW_CHARS = 180;

function CareNotes({ recipient }: { recipient: Recipient }) {
  const [open, setOpen] = useState(recipient.firstVisit);
  if (!recipient.careNotes) return null;
  const long = recipient.careNotes.length > CARE_NOTES_PREVIEW_CHARS || recipient.careNotes.split("\n").length > 3;
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 pt-2 text-sm font-medium">
        <Stethoscope className="size-4 text-muted-foreground" />
        <span className="flex-1">Care needs & medical notes</span>
        {recipient.firstVisit && (
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
            First visit
          </span>
        )}
      </div>
      <p className={cn("px-3 pt-1 pb-2 text-sm whitespace-pre-wrap break-words", !open && long && "line-clamp-3")}>
        {recipient.careNotes}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-10 w-full items-center justify-center gap-1 border-t text-xs font-medium text-primary"
        >
          {open ? "Show less" : "Show all"}
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

/** Handoff from whoever visited last — the note the End visit dialog promises
 * "goes to whoever visits next", shown where the next caregiver will see it. */
function LastVisit({ recipient, timeZone, compact = false }: { recipient: Recipient; timeZone: string; compact?: boolean }) {
  const last = recipient.lastVisit;
  if (!last || (!last.note && last.notDone.length === 0)) return null;
  const when = new Date(last.at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone });
  return (
    <div className={cn("rounded-lg bg-muted/50 px-3 py-2 text-sm", compact && "mt-1.5 py-1.5")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquareText className="size-3.5 shrink-0" />
        Last visit · {when} · {last.by}
      </p>
      {last.note && (
        <p className={cn("mt-0.5 whitespace-pre-wrap break-words", compact && "line-clamp-2")}>{last.note}</p>
      )}
      {last.notDone.length > 0 && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Not done last time: {last.notDone.join(", ")}</p>
      )}
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
          {recipient.phone && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${recipient.phone}`} />}>
              <Phone className="size-3.5" /> Call {recipient.name.split(" ")[0]}
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

        <LastVisit recipient={recipient} timeZone={timeZone} />

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

/**
 * `confirm`: ask first. Used for recipients not scheduled today, where a
 * stray tap in the list would otherwise clock the caregiver in by accident.
 * Scheduled visits stay one tap.
 */
function StartButton({
  recipient,
  busy,
  confirm = false,
  label = "Start visit",
}: {
  recipient: Recipient;
  busy: boolean;
  confirm?: boolean;
  label?: string;
}) {
  const { startVisit, isPending } = useStartVisit();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Button
        size="lg"
        className="h-11 shrink-0 px-4 text-base sm:h-9 sm:text-sm"
        onClick={() => (confirm ? setConfirmOpen(true) : startVisit(recipient))}
        loading={isPending}
        disabled={busy}
      >
        <Play className="size-4" /> {label}
      </Button>
      {confirm && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Start a visit with {recipient.name}?</DialogTitle>
              <DialogDescription>They&apos;re not on your schedule today. This clocks you in now.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="lg" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  setConfirmOpen(false);
                  startVisit(recipient);
                }}
              >
                <Play className="size-4" /> Start visit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
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
  const nowMinute = useNowMinute(data.timeZone);
  // The next visit to head to: the earliest one still upcoming.
  const nextShift = currentVisit
    ? undefined
    : todayShifts.find((s) => s.status === "upcoming" && (nowMinute === null || s.startMinute >= nowMinute - 15));

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
                  const isNext = nextShift?.id === shift.id;
                  return (
                    <li key={shift.id}>
                      <Card size="sm" className={cn(isCurrent && "opacity-60", isNext && "ring-2 ring-primary/40")}>
                        <CardContent className="flex flex-wrap items-center gap-3">
                          {isNext && (
                            <p className="w-full text-xs font-medium tracking-wide text-primary uppercase">
                              Next up{nowMinute !== null && ` · ${formatStartsIn(shift.startMinute - nowMinute)}`}
                            </p>
                          )}
                          <AvatarInitials name={shift.recipient.name} className="size-9 text-sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium break-words">{shift.recipient.name}</span>
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
                          {canStart && (
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {isNext && shift.recipient.address && (
                                <Button
                                  variant="outline"
                                  size="lg"
                                  className="h-11 px-3 text-base sm:h-9 sm:text-sm"
                                  nativeButton={false}
                                  render={<a href={mapsLinkForAddress(shift.recipient.address)} target="_blank" rel="noopener noreferrer" />}
                                >
                                  <MapPin className="size-4" /> Directions
                                </Button>
                              )}
                              <StartButton recipient={shift.recipient} busy={busy} />
                            </div>
                          )}
                          {canStart && (
                            <div className="w-full">
                              <LastVisit recipient={shift.recipient} timeZone={data.timeZone} compact />
                            </div>
                          )}
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
                      {!isCurrent && <StartButton recipient={r} busy={busy} confirm />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {data.tomorrowShifts.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                <Sunrise className="size-4" /> Tomorrow
              </h2>
              <ul className="divide-y rounded-xl border">
                {data.tomorrowShifts.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                    <AvatarInitials name={s.recipient.name} className="size-8 text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.recipient.name}</div>
                      {s.recipient.address && <div className="truncate text-xs text-muted-foreground">{s.recipient.address}</div>}
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">{formatShiftRange(s.startMinute, s.endMinute)}</span>
                  </li>
                ))}
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
