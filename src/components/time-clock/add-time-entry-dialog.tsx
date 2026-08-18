"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createManualTimeEntry } from "@/lib/actions/time-entries";

// Admin-only backfill for a session someone forgot to clock, or a
// correction for a missed punch — always a completed shift (both ends
// required up front), unlike the clock widget which starts an open entry.
export function AddTimeEntryDialog({
  users,
  onAdded,
}: {
  users: { id: string; name: string }[];
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [isPending, startTransition] = useTransition();

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
        await createManualTimeEntry({ userId, clockIn, clockOut });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a time entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>User</Label>
            <Select
              items={Object.fromEntries(users.map((u) => [u.id, u.name]))}
              value={userId}
              onValueChange={(v) => setUserId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="manual-clock-in">Clock in</Label>
              <Input
                id="manual-clock-in"
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-clock-out">Clock out</Label>
              <Input
                id="manual-clock-out"
                type="datetime-local"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </div>
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
