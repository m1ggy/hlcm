"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, TriangleAlert } from "lucide-react";
import { reportCareIncident } from "@/lib/actions/visits";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_LABELS, type IncidentCategory } from "@/lib/visits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Flag something for the office — a fall, a medication problem, a change
 * in condition. Not an emergency channel: the dialog says so up front and
 * points at 911 for that.
 */
export function ReportConcernDialog({
  recipient,
  size = "lg",
}: {
  recipient: { id: string; name: string };
  /** "lg": full-width button on the Today visit card; "sm": compact, for a
   * card header. Built here rather than passed in as an element — a Button
   * element handed down from a server page hydrates with mismatched props. */
  size?: "lg" | "sm";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCategory(null);
    setUrgent(false);
    setDescription("");
  }

  function handleSubmit() {
    if (!category || !description.trim()) return;
    startTransition(async () => {
      try {
        const result = await reportCareIncident({ careRecipientId: recipient.id, category, urgent, description });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Sent to the office", { description: "A manager will follow up." });
        reset();
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't send — check your connection and try again"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            className={cn("text-destructive hover:bg-destructive/10 hover:text-destructive", size === "lg" && "h-11 w-full")}
          />
        }
      >
        <TriangleAlert className={size === "lg" ? "size-4" : "size-3.5"} /> Report a concern
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a concern about {recipient.name}</DialogTitle>
          <DialogDescription>Goes straight to your managers.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Phone className="mt-0.5 size-4 shrink-0" />
          <span>
            Emergency? <strong>Call 911 first</strong>, then report it here.
          </span>
        </div>

        <div className="space-y-1.5">
          <Label>What kind of concern?</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {INCIDENT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  category === c ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/60"
                )}
              >
                {INCIDENT_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="concern-description">What happened?</Label>
          <Textarea
            id="concern-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you saw, when, and anything you already did about it"
            maxLength={4000}
            className="text-base sm:text-sm"
          />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2">
          <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />
          <span className="text-sm">
            <span className="font-medium">Needs attention today</span>
            <span className="block text-xs text-muted-foreground">Flags it as urgent for your managers</span>
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={!category || !description.trim()} loading={isPending}>
            <TriangleAlert className="size-4" /> Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
