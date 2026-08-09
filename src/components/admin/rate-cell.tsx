"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setHourlyRate } from "@/lib/actions/users";
import { formatMoney } from "@/lib/time-entries";

export function RateCell({ userId, initialRate }: { userId: string; initialRate: number | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialRate != null ? String(initialRate) : "");
  const [rate, setRate] = useState(initialRate);
  const [isPending, startTransition] = useTransition();

  function save() {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Enter a valid rate");
      return;
    }
    startTransition(async () => {
      try {
        await setHourlyRate({ userId, hourlyRate: parsed });
        setRate(parsed);
        setEditing(false);
        toast.success("Rate updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update rate");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(rate != null ? String(rate) : "");
          setEditing(true);
        }}
        className="group flex items-center gap-1.5 text-sm hover:underline"
      >
        {rate != null ? `${formatMoney(rate)}/hr` : <span className="text-muted-foreground">Not set</span>}
        <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-24"
      />
      <Button size="icon-sm" variant="ghost" onClick={save} disabled={isPending}>
        <Check className="size-3.5" />
      </Button>
    </div>
  );
}
