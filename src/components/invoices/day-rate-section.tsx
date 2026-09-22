"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RecipientLineItem } from "@/components/invoices/unbilled-visits-section";

function eachDay(startStr: string, endStr: string): Date[] {
  if (!startStr || !endStr) return [];
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function dayRateLineItemsFor(days: Date[], dailyRate: number): RecipientLineItem[] {
  return days.map((d) => ({
    description: `${d.toLocaleDateString()} — live-in day rate`,
    quantity: 1,
    unitPrice: dailyRate,
    kind: "VISIT_DAILY",
    visitDate: d.toISOString(),
  }));
}

/**
 * A flat per-day billing range — the "Live-in" counterpart to
 * UnbilledVisitsSection's hourly visits, for a recipient billed a daily
 * rate instead of (or alongside) hourly. Produces one VISIT_DAILY line
 * item per calendar day in the range, defaulted to the recipient's own
 * `dailyRate` but editable per invoice. Collapsed by default since not
 * every recipient invoice bills day-rate days.
 */
export function DayRateSection({
  dailyRate,
  onLineItemsChange,
}: {
  dailyRate: number | null;
  onLineItemsChange: (items: RecipientLineItem[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rate, setRate] = useState(dailyRate ?? 0);

  function emit(nextStart: string, nextEnd: string, nextRate: number) {
    onLineItemsChange(dayRateLineItemsFor(eachDay(nextStart, nextEnd), nextRate));
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0"
        onClick={() => setExpanded(true)}
      >
        <Plus className="size-3.5" /> Bill live-in / day-rate days
      </Button>
    );
  }

  const days = eachDay(startDate, endDate);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Live-in / day-rate days</p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setExpanded(false);
            setStartDate("");
            setEndDate("");
            onLineItemsChange([]);
          }}
        >
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              emit(e.target.value, endDate, rate);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              emit(startDate, e.target.value, rate);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Daily rate</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="h-8 text-xs"
            value={rate}
            onChange={(e) => {
              const next = Number(e.target.value) || 0;
              setRate(next);
              emit(startDate, endDate, next);
            }}
          />
        </div>
      </div>
      {days.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {days.length} day{days.length === 1 ? "" : "s"} — ${(days.length * rate).toFixed(2)} at ${rate.toFixed(2)}/day
        </p>
      )}
    </div>
  );
}
