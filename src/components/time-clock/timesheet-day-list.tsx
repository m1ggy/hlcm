"use client";

import { useMemo } from "react";
import { AlertTriangle, Coffee, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, hoursBetween, toDateInputValue, REQUIRED_BREAK_MINUTES } from "@/lib/time-entries";
import { mapsLinkForCoordinates, haversineMeters, formatDistance, NEAR_THRESHOLD_METERS } from "@/lib/geolocation";
import { formatClock, formatDay, splitInstant } from "@/components/time-clock/time-fields";
import { EditTimeEntryDialog } from "@/components/time-clock/edit-time-entry-dialog";
import { EditBreakEntryDialog } from "@/components/time-clock/edit-break-entry-dialog";
import { AddBreakDialog } from "@/components/time-clock/add-break-dialog";
import { cn } from "@/lib/utils";

export type DayListEntry = {
  id: string;
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  user: { id: string; name: string };
  careRecipient: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
};

export type DayListBreak = {
  id: string;
  userId: string;
  breakStart: Date;
  breakEnd: Date | null;
  user: { id: string; name: string };
};

const LONG_SHIFT_HOURS = 12;

type Item =
  | { kind: "work"; start: Date; end: Date | null; entry: DayListEntry }
  | { kind: "break"; start: Date; end: Date | null; brk: DayListBreak };

type Day = {
  key: string;
  day: string;
  userName: string;
  items: Item[];
  paidHours: number;
  breakMinutes: number;
  flags: string[];
};

function LocationPin({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  if (latitude == null || longitude == null) return null;
  return (
    <a
      href={mapsLinkForCoordinates(latitude, longitude)}
      target="_blank"
      rel="noreferrer"
      title="View on map"
      className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
    >
      <MapPin className="size-3" />
    </a>
  );
}

function distanceFromVisit(entry: DayListEntry) {
  const r = entry.careRecipient;
  if (entry.clockInLatitude == null || entry.clockInLongitude == null || r?.latitude == null || r.longitude == null) return null;
  return haversineMeters(entry.clockInLatitude, entry.clockInLongitude, r.latitude, r.longitude);
}

/** Groups sessions and breaks into one row per person per day (by start
 * time in `timeZone`), in time order, with that day's warnings. */
function buildDays(entries: DayListEntry[], breaks: DayListBreak[], timeZone: string, from: string, to: string): Day[] {
  const days = new Map<string, Day>();
  const dayFor = (userId: string, userName: string, start: Date) => {
    const day = toDateInputValue(start, timeZone);
    const key = `${day}|${userId}`;
    let d = days.get(key);
    if (!d) {
      d = { key, day, userName, items: [], paidHours: 0, breakMinutes: 0, flags: [] };
      days.set(key, d);
    }
    return d;
  };
  for (const entry of entries) {
    dayFor(entry.userId, entry.user.name, entry.clockIn).items.push({ kind: "work", start: entry.clockIn, end: entry.clockOut, entry });
  }
  for (const brk of breaks) {
    dayFor(brk.userId, brk.user.name, brk.breakStart).items.push({ kind: "break", start: brk.breakStart, end: brk.breakEnd, brk });
  }

  for (const d of days.values()) {
    d.items.sort((a, b) => a.start.getTime() - b.start.getTime());
    let open = false;
    let overlap = false;
    let far = false;
    let lastWorkEnd: Date | null = null;
    for (const item of d.items) {
      if (item.kind === "work") {
        if (!item.end) open = true;
        else d.paidHours += hoursBetween(item.start, item.end);
        if (lastWorkEnd && item.start < lastWorkEnd) overlap = true;
        lastWorkEnd = item.end ?? new Date(8.64e15);
        const distance = distanceFromVisit(item.entry);
        if (distance != null && distance > NEAR_THRESHOLD_METERS) far = true;
      } else if (item.end) {
        d.breakMinutes += Math.round(hoursBetween(item.start, item.end) * 60);
      } else {
        open = true;
      }
    }
    if (open) d.flags.push("Still on the clock");
    if (overlap) d.flags.push("Overlapping time");
    if (d.paidHours > LONG_SHIFT_HOURS) d.flags.push(`Over ${LONG_SHIFT_HOURS} hours`);
    // Same rule as the timeline chart's break-policy check.
    if (d.paidHours > 0 && d.breakMinutes < REQUIRED_BREAK_MINUTES) d.flags.push(`No ${REQUIRED_BREAK_MINUTES}-min break`);
    if (far) d.flags.push("Clocked in far from the visit address");
  }

  return [...days.values()]
    .filter((d) => d.day >= from && d.day <= to)
    .sort((a, b) => (a.day === b.day ? a.userName.localeCompare(b.userName) : a.day < b.day ? 1 : -1));
}

/**
 * Admin view of the loaded range as one list: each person's day with its
 * work sessions and breaks in order, paid total, and warnings — replacing
 * the separate "Individual sessions" and "Individual breaks" tables, where
 * a break and the sessions around it were far apart.
 */
export function TimesheetDayList({
  entries,
  breaks,
  timeZone,
  accountTimezone,
  from,
  to,
  isAdmin,
  recipients,
  busyId,
  onChanged,
  onDeleteEntry,
  onDeleteBreak,
}: {
  entries: DayListEntry[];
  breaks: DayListBreak[];
  timeZone: string;
  accountTimezone: string | null;
  from: string;
  to: string;
  isAdmin: boolean;
  recipients: { id: string; name: string }[];
  busyId: string | null;
  onChanged: () => void;
  onDeleteEntry: (id: string) => void;
  onDeleteBreak: (id: string) => void;
}) {
  const days = useMemo(() => buildDays(entries, breaks, timeZone, from, to), [entries, breaks, timeZone, from, to]);

  if (days.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No time in this range.</p>;
  }

  return (
    <div className="space-y-3">
      {days.map((d) => (
        <div key={d.key} className="rounded-lg border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3 py-2">
            <span className="text-sm font-medium">
              {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
            </span>
            <span className="text-sm">{d.userName}</span>
            {d.flags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="size-3" /> {flag}
              </span>
            ))}
            <span className="ml-auto text-sm font-medium">
              {formatDuration(d.paidHours)} paid
              {d.breakMinutes > 0 && <span className="font-normal text-muted-foreground"> · {formatDuration(d.breakMinutes / 60)} break</span>}
            </span>
          </div>
          <ul className="divide-y">
            {d.items.map((item) => {
              const isBreak = item.kind === "break";
              const id = isBreak ? item.brk.id : item.entry.id;
              const distance = !isBreak ? distanceFromVisit(item.entry) : null;
              return (
                <li key={id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm", isBreak && "bg-amber-500/5")}>
                  <span className="w-48 shrink-0 tabular-nums">
                    {formatClock(item.start, timeZone)}
                    {!isBreak && <LocationPin latitude={item.entry.clockInLatitude} longitude={item.entry.clockInLongitude} />}
                    {" – "}
                    {item.end ? formatClock(item.end, timeZone) : <span className="text-muted-foreground">now</span>}
                    {item.end && splitInstant(item.end, timeZone).date !== splitInstant(item.start, timeZone).date && (
                      <span className="ml-1 text-xs font-medium text-amber-700 dark:text-amber-400" title={`Ends ${formatDay(item.end, timeZone)}`}>
                        +1 day
                      </span>
                    )}
                    {!isBreak && <LocationPin latitude={item.entry.clockOutLatitude} longitude={item.entry.clockOutLongitude} />}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {isBreak ? (
                      <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                        <Coffee className="size-3.5" /> Break
                      </span>
                    ) : item.entry.careRecipient ? (
                      <>
                        Visit · {item.entry.careRecipient.name}
                        {distance != null && (
                          <span
                            className={
                              distance <= NEAR_THRESHOLD_METERS ? "ml-1 text-xs text-muted-foreground" : "ml-1 text-xs text-amber-600 dark:text-amber-400"
                            }
                          >
                            ({formatDistance(distance)}
                            {distance <= NEAR_THRESHOLD_METERS ? "" : " away"})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Work</span>
                    )}
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                    {item.end ? formatDuration(hoursBetween(item.start, item.end)) : "—"}
                  </span>
                  {isAdmin && (
                    <span className="flex w-24 shrink-0 justify-end gap-0.5">
                      {isBreak ? (
                        <EditBreakEntryDialog entry={item.brk} accountTimezone={accountTimezone} onUpdated={onChanged} />
                      ) : (
                        <>
                          {item.entry.clockOut && (
                            <AddBreakDialog
                              entry={{ ...item.entry, clockOut: item.entry.clockOut }}
                              accountTimezone={accountTimezone}
                              onAdded={onChanged}
                            />
                          )}
                          <EditTimeEntryDialog
                            entry={item.entry}
                            recipients={recipients}
                            accountTimezone={accountTimezone}
                            onUpdated={onChanged}
                          />
                        </>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        title={isBreak ? "Delete break" : "Delete time"}
                        aria-label={isBreak ? "Delete break" : "Delete time"}
                        loading={busyId === id}
                        onClick={() => (isBreak ? onDeleteBreak(id) : onDeleteEntry(id))}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
