"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { zonedNowParts } from "@/lib/time-entries";
import { cn } from "@/lib/utils";

const TIME_FORMAT_STORAGE_KEY = "hclm-time-format"; // "24" | "12"

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function splitValue(value: string) {
  const [date = "", time = ""] = value.split("T");
  return { date, time };
}

function to12Hour(h: number): { h12: number; ampm: "AM" | "PM" } {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, ampm };
}

function to24Hour(h12: number, ampm: "AM" | "PM") {
  const base = h12 % 12; // 12 -> 0
  return ampm === "PM" ? base + 12 : base;
}

function loadStoredFormat(): "24" | "12" {
  if (typeof window === "undefined") return "24";
  try {
    return window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === "12" ? "12" : "24";
  } catch {
    return "24";
  }
}

/**
 * Plain digit entry for "HH:mm" instead of the native `<input type="time">`
 * — that control's 12h/24h display is dictated by the browser/OS locale
 * (a `lang="en-GB"` attribute nudges some Chromium versions toward 24h, but
 * not reliably, and not Firefox at all), so it can't be trusted to show a
 * consistent format. Rendering the digits ourselves sidesteps that, and lets
 * the user flip between 24h and 12h+AM/PM with a real toggle instead of
 * hoping the browser picks the same one they expect. The underlying value
 * is always 24-hour "HH:mm" — the toggle only changes how it's displayed,
 * and the choice is remembered (localStorage) across dialogs.
 */
function TimeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [format, setFormat] = useState<"24" | "12">(() => loadStoredFormat());
  const [hourFocused, setHourFocused] = useState(false);
  const [minuteFocused, setMinuteFocused] = useState(false);

  const [hh, mm] = value ? value.split(":") : ["", ""];
  const hour24 = hh === "" ? null : Number(hh);
  const { h12, ampm } = hour24 === null ? { h12: null, ampm: "AM" as const } : to12Hour(hour24);

  const displayHour = format === "12" ? (h12 === null ? "" : String(h12)) : hh;
  const [hourDraft, setHourDraft] = useState(displayHour);
  const [minuteDraft, setMinuteDraft] = useState(mm ?? "");

  // Reflect external value changes (e.g. the "Now" button) — but don't
  // stomp on what the user is actively typing in that field. Deferred via
  // setTimeout (same idiom as theme-toggle.tsx) since a direct setState
  // call in an effect body is flagged as a cascading-render risk.
  useEffect(() => {
    if (hourFocused) return;
    const id = setTimeout(() => setHourDraft(displayHour), 0);
    return () => clearTimeout(id);
  }, [displayHour, hourFocused]);
  useEffect(() => {
    if (minuteFocused) return;
    const id = setTimeout(() => setMinuteDraft(mm ?? ""), 0);
    return () => clearTimeout(id);
  }, [mm, minuteFocused]);

  function commit(nextHourDraft: string, nextMinuteDraft: string, nextAmpm: "AM" | "PM") {
    if (nextHourDraft === "" && nextMinuteDraft === "") {
      onChange("");
      return;
    }
    const m = clamp(Number(nextMinuteDraft) || 0, 0, 59);
    let h: number;
    if (format === "12") {
      const raw = clamp(Number(nextHourDraft) || 12, 1, 12);
      h = to24Hour(raw, nextAmpm);
    } else {
      h = clamp(Number(nextHourDraft) || 0, 0, 23);
    }
    onChange(`${pad(h)}:${pad(m)}`);
  }

  function toggleFormat() {
    const next = format === "24" ? "12" : "24";
    setFormat(next);
    try {
      window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, next);
    } catch {
      // ignore — just won't persist across sessions
    }
  }

  function toggleAmPm() {
    if (hour24 === null) return;
    const next = ampm === "AM" ? "PM" : "AM";
    const { h12: currentH12 } = to12Hour(hour24);
    onChange(`${pad(to24Hour(currentH12, next))}:${mm || "00"}`);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 tabular-nums">
        <input
          type="text"
          inputMode="numeric"
          placeholder={format === "12" ? "H" : "HH"}
          maxLength={2}
          value={hourDraft}
          disabled={disabled}
          onFocus={() => setHourFocused(true)}
          onChange={(e) => setHourDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => {
            setHourFocused(false);
            commit(hourDraft, minuteDraft, ampm);
          }}
          className="w-7 border-0 bg-transparent p-0 text-center outline-none"
        />
        <span className="text-muted-foreground">:</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="MM"
          maxLength={2}
          value={minuteDraft}
          disabled={disabled}
          onFocus={() => setMinuteFocused(true)}
          onChange={(e) => setMinuteDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => {
            setMinuteFocused(false);
            commit(hourDraft, minuteDraft, ampm);
          }}
          className="w-7 border-0 bg-transparent p-0 text-center outline-none"
        />
      </div>
      {format === "12" && (
        <button
          type="button"
          disabled={disabled || hour24 === null}
          onClick={toggleAmPm}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          title="Toggle AM/PM"
        >
          {ampm}
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleFormat}
        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        title="Switch between 24-hour and 12-hour display"
      >
        {format === "24" ? "24h" : "12h"}
      </button>
    </div>
  );
}

/**
 * A single `datetime-local` input crams a date and a time into one tiny
 * field with fiddly built-in spinners — hard to hit precisely. This splits
 * the same "yyyy-MM-ddTHH:mm" value into a full-size native date picker
 * (the browser/OS's own, much larger, date UI) plus a plain HH:MM time
 * field (with a 24h/12h toggle — see TimeInput above) plus a "Now"
 * shortcut, while keeping the same string value/onChange shape as before
 * so callers don't need to change how they store it.
 */
export function DateTimeInput({
  value,
  onChange,
  timeZone,
  disabled,
  className,
  clearable = true,
}: {
  value: string;
  onChange: (value: string) => void;
  /** IANA zone "now"/defaults are read against — the account's effective timezone (see effectiveTimezone). */
  timeZone: string;
  disabled?: boolean;
  className?: string;
  /** Show a button to clear back to "" (used for the open-ended "clock out" field). */
  clearable?: boolean;
}) {
  const { date, time } = splitValue(value);

  function setDate(nextDate: string) {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${time || zonedNowParts(timeZone).time}`);
  }

  function setTime(nextTime: string) {
    if (!nextTime) {
      onChange("");
      return;
    }
    onChange(`${date || zonedNowParts(timeZone).date}T${nextTime}`);
  }

  function setNow() {
    const now = zonedNowParts(timeZone);
    onChange(`${now.date}T${now.time}`);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <InputGroup className="h-9 w-auto min-w-36">
        <InputGroupAddon>
          <CalendarDays />
        </InputGroupAddon>
        <InputGroupInput type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} />
      </InputGroup>
      <InputGroup className="h-9 w-auto min-w-44">
        <InputGroupAddon>
          <Clock3 />
        </InputGroupAddon>
        <div className="flex flex-1 items-center px-2">
          <TimeInput value={time} onChange={setTime} disabled={disabled} />
        </div>
      </InputGroup>
      <Button type="button" variant="outline" size="sm" onClick={setNow} disabled={disabled}>
        Now
      </Button>
      {clearable && value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>
          Clear
        </Button>
      )}
    </div>
  );
}
