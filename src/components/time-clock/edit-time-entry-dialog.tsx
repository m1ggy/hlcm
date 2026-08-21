"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateTimeEntry } from "@/lib/actions/time-entries";
import { toDatetimeLocalValue } from "@/lib/time-entries";

// Admin-only correction for an existing entry (wrong clock in/out time on
// someone else's session). Leaving "Clock out" blank re-opens the entry —
// the server checks that doesn't create a second open session for the user.
export function EditTimeEntryDialog({
  entry,
  onUpdated,
}: {
  entry: { id: string; clockIn: Date; clockOut: Date | null };
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setClockIn(toDatetimeLocalValue(entry.clockIn));
      setClockOut(entry.clockOut ? toDatetimeLocalValue(entry.clockOut) : "");
    }
  }

  function handleSubmit() {
    if (!clockIn) {
      toast.error("Clock in is required");
      return;
    }
    startTransition(async () => {
      try {
        await updateTimeEntry(entry.id, { clockIn, clockOut: clockOut || null });
        toast.success("Time entry updated");
        setOpen(false);
        onUpdated?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update time entry");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="xs" variant="ghost" title="Edit">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit time entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-clock-in">Clock in</Label>
              <Input
                id="edit-clock-in"
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-clock-out">Clock out</Label>
              <Input
                id="edit-clock-out"
                type="datetime-local"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to re-open this session.</p>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
