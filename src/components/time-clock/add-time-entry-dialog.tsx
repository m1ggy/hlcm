"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createManualTimeEntry } from "@/lib/actions/time-entries";
import { browserTimezone, zonedInputToISOString, timezoneLabel } from "@/lib/time-entries";

// Admin-only backfill for a session someone forgot to clock, or a
// correction for a missed punch — always a completed shift (both ends
// required up front), unlike the clock widget which starts an open entry.
export function AddTimeEntryDialog({
  users,
  accountTimezone,
  onAdded,
}: {
  users: { id: string; name: string }[];
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [isPending, startTransition] = useTransition();
  // Falls back to the browser's own zone only when no Account setting is
  // saved — resolved after mount, since Intl would report the server's
  // timezone during SSR, mismatching the browser's on hydration.
  const [timezone, setTimezone] = useState(accountTimezone ?? "UTC");
  useEffect(() => {
    if (accountTimezone) return;
    const id = setTimeout(() => setTimezone(browserTimezone()), 0);
    return () => clearTimeout(id);
  }, [accountTimezone]);

  function reset() {
    setUserId("");
    setClockIn("");
    setClockOut("");
  }

  function handleSubmit() {
    if (!userId || !clockIn || !clockOut) {
      toast.error("Fill in user, clock in, and clock out");
      return;
    }
    startTransition(async () => {
      try {
        await createManualTimeEntry({
          userId,
          clockIn: zonedInputToISOString(clockIn, timezone),
          clockOut: zonedInputToISOString(clockOut, timezone),
        });
        toast.success("Time entry added");
        setOpen(false);
        reset();
        onAdded?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add time entry");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add time
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a time entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>User</Label>
            <SearchableSelect
              items={Object.fromEntries(users.map((u) => [u.id, u.name]))}
              value={userId || null}
              onValueChange={(v) => setUserId(v ?? "")}
              placeholder="Select a user"
              searchPlaceholder="Search users..."
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Clock in</Label>
              <DateTimeInput value={clockIn} onChange={setClockIn} timeZone={timezone} clearable={false} />
            </div>
            <div className="space-y-1">
              <Label>Clock out</Label>
              <DateTimeInput value={clockOut} onChange={setClockOut} timeZone={timezone} clearable={false} />
            </div>
            <p className="text-xs text-muted-foreground">
              Times are read in your timezone — {timezoneLabel(timezone)}.{" "}
              <a href="/account" className="underline">Change it</a>.
            </p>
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Add entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
