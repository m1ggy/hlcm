"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "yyyy-MM-dd" for today, in local time (not UTC). */
function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:mm" for now, in local time. */
function nowLocalTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitValue(value: string) {
  const [date = "", time = ""] = value.split("T");
  return { date, time };
}

/**
 * A single `datetime-local` input crams a date and a time into one tiny
 * field with fiddly built-in spinners — hard to hit precisely. This splits
 * the same "yyyy-MM-ddTHH:mm" value into two full-size native pickers (each
 * gets the browser/OS's own, much larger, date or time UI) plus a "Now"
 * shortcut, while keeping the same string value/onChange shape as before so
 * callers don't need to change how they store it.
 */
export function DateTimeInput({
  value,
  onChange,
  disabled,
  className,
  clearable = true,
}: {
  value: string;
  onChange: (value: string) => void;
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
    onChange(`${nextDate}T${time || nowLocalTime()}`);
  }

  function setTime(nextTime: string) {
    if (!nextTime) {
      onChange("");
      return;
    }
    onChange(`${date || todayLocalDate()}T${nextTime}`);
  }

  function setNow() {
    onChange(`${todayLocalDate()}T${nowLocalTime()}`);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <InputGroup className="h-9 w-auto min-w-36">
        <InputGroupAddon>
          <CalendarDays />
        </InputGroupAddon>
        <InputGroupInput type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} />
      </InputGroup>
      <InputGroup className="h-9 w-auto min-w-28">
        <InputGroupAddon>
          <Clock3 />
        </InputGroupAddon>
        <InputGroupInput type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={disabled} />
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
