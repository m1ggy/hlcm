"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, CircleCheck } from "lucide-react";
import { clockOut, endBreakForDay } from "@/lib/actions/time-entries";
import { getMyVisitWrapUp } from "@/lib/actions/visits";
import { captureLocation } from "@/lib/geolocation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WrapUp = Awaited<ReturnType<typeof getMyVisitWrapUp>>;

/**
 * The one way a Caregiver ends a visit — from the Today page or the header
 * clock. Shows what's still unchecked (so nothing's forgotten on the way out)
 * and asks for a short visit note the office and the next caregiver read.
 * `fromBreak`: the visit is paused on a break, so ending it closes the break
 * for the day instead of clocking out.
 */
export function EndVisitDialog({
  open,
  onOpenChange,
  fromBreak = false,
  onEnded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromBreak?: boolean;
  onEnded?: () => void;
}) {
  const router = useRouter();
  const [wrapUp, setWrapUp] = useState<WrapUp | undefined>(undefined);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMyVisitWrapUp()
      .then((data) => !cancelled && setWrapUp(data))
      .catch(() => !cancelled && setWrapUp(null));
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!next) setWrapUp(undefined);
    onOpenChange(next);
  }

  function handleEnd() {
    startTransition(async () => {
      try {
        if (fromBreak) {
          await endBreakForDay({ visitNote: note });
        } else {
          const location = await captureLocation();
          await clockOut({ ...location, visitNote: note });
        }
        toast.success(wrapUp?.recipientName ? `Visit with ${wrapUp.recipientName} ended` : "Visit ended");
        setNote("");
        handleOpenChange(false);
        onEnded?.();
        router.refresh();
      } catch {
        toast.error("Couldn't end the visit — check your connection and try again");
      }
    });
  }

  const missed = wrapUp?.missed ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>End visit{wrapUp?.recipientName ? ` with ${wrapUp.recipientName}` : ""}?</DialogTitle>
          <DialogDescription>Your note goes to the office and whoever visits next.</DialogDescription>
        </DialogHeader>

        {wrapUp === undefined ? (
          <Skeleton className="h-10 w-full" />
        ) : wrapUp && wrapUp.total > 0 ? (
          missed.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              <CircleCheck className="size-4 shrink-0" />
              All {wrapUp.total} care tasks checked off
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-medium">
                <CircleAlert className="size-4 shrink-0" />
                {missed.length} of {wrapUp.total} not checked off
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-9 text-xs">
                {missed.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              <p className="mt-1.5 pl-6 text-xs">Close this to go back and check them, or say why in your note.</p>
            </div>
          )
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="visit-note">How did the visit go?</Label>
          <Textarea
            id="visit-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mood, appetite, anything the next caregiver should know…"
            maxLength={4000}
            className="text-base sm:text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Keep visiting
          </Button>
          <Button size="lg" onClick={handleEnd} loading={isPending}>
            {note.trim() ? "End visit" : "End without a note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
