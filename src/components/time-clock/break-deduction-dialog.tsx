"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CoffeeIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createBreakDeduction } from "@/lib/actions/time-entries";

// Admin-only: adds a retroactive unpaid-break deduction for a date range
// (usually "this pay period") — subtracted per calendar day at report/PDF/
// payout time, not once across the whole range (see summarizeByUser in
// src/lib/time-entries.ts). Prefilled from whatever range/user the report
// is currently showing, since that's almost always what "this pay period"
// means when someone reaches for this.
export function BreakDeductionDialog({
  users,
  defaultUserId,
  defaultFrom,
  defaultTo,
  onAdded,
}: {
  users: { id: string; name: string }[];
  defaultUserId: string; // "all" or a user id, mirroring the report's own filter
  defaultFrom: string;
  defaultTo: string;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(defaultUserId);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setUserId(defaultUserId);
    setFromDate(defaultFrom);
    setToDate(defaultTo);
    setMinutes("30");
    setNote("");
  }

  function handleSubmit() {
    const parsedMinutes = Number(minutes);
    if (!fromDate || !toDate) {
      toast.error("Pick a date range");
      return;
    }
    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 1) {
      toast.error("Minutes per day must be a whole number, at least 1");
      return;
    }
    startTransition(async () => {
      try {
        await createBreakDeduction({
          userId: userId === "all" ? undefined : userId,
          fromDate,
          toDate,
          minutesPerDay: parsedMinutes,
          note: note || undefined,
        });
        toast.success("Break deduction added");
        setOpen(false);
        reset();
        onAdded?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add break deduction");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Re-sync to whatever the report is showing right now each time
          // it's reopened — the report's own from/to may have changed
          // since the last time this was used.
          setUserId(defaultUserId);
          setFromDate(defaultFrom);
          setToDate(defaultTo);
        } else {
          reset();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CoffeeIcon className="size-3.5" /> Add break deduction
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a break deduction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Applies to</Label>
            <SearchableSelect
              items={{ all: "All users", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
              value={userId}
              onValueChange={(v) => setUserId(v ?? "all")}
              searchPlaceholder="Search users..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="breakFrom">From</Label>
              <Input id="breakFrom" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="breakTo">To</Label>
              <Input id="breakTo" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="breakMinutes">Minutes per day</Label>
            <Input
              id="breakMinutes"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              Deducted from every day in range that has worked hours — not once for the whole period.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="breakNote">Note (optional)</Label>
            <Textarea id="breakNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Unpaid lunch, added retroactively" />
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Add deduction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
