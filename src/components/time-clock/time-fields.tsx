"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDatetimeLocalValue, zonedInputToISOString, timezoneLabel } from "@/lib/time-entries";

// Shared bits for the admin time dialogs: one date plus start/end times
// instead of two full date-time pickers. An end time earlier than the start
// means the next day, so an overnight shift needs no second date.

/** "yyyy-mm-dd" moved by `days`. */
export function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function nextDay(date: string) {
  return shiftDate(date, 1);
}

/** Whole days from `a` to `b` ("yyyy-mm-dd"). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
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

/** Short day label, e.g. "Thu, Oct 30". */
export function formatDay(value: Date, timeZone: string) {
  return value.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone });
}

/** Label bits for a time field: the day `instant` falls on, and whether
 * that's after `date` (an overnight end rolled to the next day). */
export function dayOf(date: string, instant: Date | null | undefined, timeZone: string) {
  if (!date || !instant) return undefined;
  return { label: formatDay(instant, timeZone), nextDay: splitInstant(instant, timeZone).date > date };
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
  day,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The day this time lands on (from dayOf), shown in the label. */
  day?: { label: string; nextDay: boolean };
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id} className="flex-wrap gap-x-1">
        {label}
        {day && (
          <span className={day.nextDay ? "font-medium text-amber-700 dark:text-amber-400" : "font-normal text-muted-foreground"}>
            · {day.label}
            {day.nextDay && " (next day)"}
          </span>
        )}
      </Label>
      <Input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

export function DateInput({
  id,
  value,
  onChange,
  label = "Date",
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

/** Start and end, each with its own date and time, for the edit dialogs.
 * Moving the start date carries the end date along by the same days. */
export function useStartEnd(timeZone: string, stillOpen: boolean) {
  const [startDate, setStartDateRaw] = useState("");
  const [start, setStart] = useState("");
  const [endDate, setEndDate] = useState("");
  const [end, setEnd] = useState("");

  function reset(from: Date, to: Date | null) {
    const s = splitInstant(from, timeZone);
    const e = to ? splitInstant(to, timeZone) : null;
    setStartDateRaw(s.date);
    setStart(s.time);
    setEndDate(e?.date ?? s.date);
    setEnd(e?.time ?? "");
  }

  /** Same-day start/end on `date`, e.g. a 9–5 default. */
  function resetTo(date: string, startTime: string, endTime: string) {
    setStartDateRaw(date);
    setStart(startTime);
    setEndDate(date);
    setEnd(endTime);
  }

  function setStartDate(next: string) {
    if (next && startDate && endDate) setEndDate(shiftDate(endDate, daysBetween(startDate, next)));
    setStartDateRaw(next);
  }

  const from = startDate && start ? zonedInstant(startDate, start, timeZone) : null;
  const to = !stillOpen && endDate && end ? zonedInstant(endDate, end, timeZone) : null;
  const endBeforeStart = Boolean(from && to && to <= from);
  const range = from && to && !endBeforeStart ? { from, to } : null;

  return {
    startDate, setStartDate, start, setStart, endDate, setEndDate, end, setEnd,
    reset, resetTo, from, range, endBeforeStart, timeZone,
    /** Fixes the common slip: an overnight end left on the start date. */
    moveEndToNextDay: () => setEndDate(shiftDate(startDate, 1)),
  };
}

export function StartEndFields({
  idPrefix,
  startLabel,
  endLabel,
  fields,
  endDisabled,
}: {
  idPrefix: string;
  startLabel: string;
  endLabel: string;
  fields: ReturnType<typeof useStartEnd>;
  endDisabled?: boolean;
}) {
  const f = fields;
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <DateInput id={`${idPrefix}-start-date`} label={`${startLabel} date`} value={f.startDate} onChange={f.setStartDate} />
        <TimeInput id={`${idPrefix}-start`} label={`${startLabel} time`} value={f.start} onChange={f.setStart} />
      </div>
      <div className="flex gap-3">
        <DateInput id={`${idPrefix}-end-date`} label={`${endLabel} date`} value={f.endDate} onChange={f.setEndDate} disabled={endDisabled} />
        <TimeInput id={`${idPrefix}-end`} label={`${endLabel} time`} value={f.end} onChange={f.setEnd} disabled={endDisabled} />
      </div>
      {!endDisabled && f.range && f.endDate !== f.startDate && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Crosses midnight — ends {formatDay(f.range.to, f.timeZone)}
        </p>
      )}
      {!endDisabled && f.endBeforeStart && (
        <p className="text-sm text-destructive">
          {endLabel} is before {startLabel.toLowerCase()}.{" "}
          {f.endDate === f.startDate && (
            <button type="button" className="underline" onClick={f.moveEndToNextDay}>
              Make it the next day
            </button>
          )}
        </p>
      )}
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
