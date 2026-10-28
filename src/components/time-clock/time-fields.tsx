"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDatetimeLocalValue, zonedInputToISOString, timezoneLabel } from "@/lib/time-entries";

// Shared bits for the admin time dialogs: one date plus start/end times
// instead of two full date-time pickers. An end time earlier than the start
// means the next day, so an overnight shift needs no second date.

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "yyyy-mm-dd" + "HH:mm" in `timeZone` → instant. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  return new Date(zonedInputToISOString(`${date}T${time}`, timeZone));
}

/** `time` on `date`, or on the day after if that would land before
 * `notBefore` (wrapping past midnight). */
export function instantAtOrAfter(date: string, time: string, timeZone: string, notBefore: Date): Date {
  const sameDay = zonedInstant(date, time, timeZone);
  return sameDay >= notBefore ? sameDay : zonedInstant(nextDay(date), time, timeZone);
}

/** Start/end on a date; an end at or before the start rolls to the next day. */
export function resolveRange(date: string, start: string, end: string, timeZone: string) {
  if (!date || !start || !end) return null;
  const from = zonedInstant(date, start, timeZone);
  const to = instantAtOrAfter(date, end, timeZone, new Date(from.getTime() + 60_000));
  return { from, to };
}

/** Splits an instant into the date and time inputs' values in `timeZone`. */
export function splitInstant(value: Date, timeZone: string) {
  const [date, time] = toDatetimeLocalValue(value, timeZone).split("T");
  return { date, time };
}

export function formatClock(value: Date, timeZone: string) {
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });
}

export function TimeInput({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

export function DateInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Date</Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TimezoneNote({ timeZone }: { timeZone: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Times are in your timezone — {timezoneLabel(timeZone)}.{" "}
      <a href="/account" className="underline">
        Change it
      </a>
      .
    </p>
  );
}
