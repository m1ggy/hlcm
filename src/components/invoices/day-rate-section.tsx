"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type RecipientLineItem } from "@/components/invoices/unbilled-visits-section";

type CaregiverOption = { id: string; name: string };

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

function dayRateLineItemsFor(days: Date[], dailyRate: number, workerName: string | undefined): RecipientLineItem[] {
  return days.map((d) => ({
    description: `${d.toLocaleDateString()} — live-in day rate`,
    quantity: 1,
    unitPrice: dailyRate,
    kind: "VISIT_DAILY",
    visitDate: d.toISOString(),
    workerName,
  }));
}

/**
 * A flat per-day billing range — the "Live-in" counterpart to
 * UnbilledVisitsSection's hourly visits, for a recipient billed a daily
 * rate. Produces one VISIT_DAILY line item per calendar day in the range,
 * defaulted to the recipient's own `dailyRate` but editable per invoice.
 * Which caregiver provided the care is optional — leaving it blank keeps
 * generateCareRecipientInvoicePdf's existing weekday-name fallback in the
 * Worker column (see its own comment) rather than a picked name.
 *
 * The caller (CareRecipientInvoiceForm) decides whether this even mounts —
 * it's shown only while its own hourly/day-rate toggle is on Day rate, so
 * this component has no collapse state of its own.
 */
export function DayRateSection({
  dailyRate,
  caregivers,
  onLineItemsChange,
}: {
  dailyRate: number | null;
  caregivers: CaregiverOption[];
  onLineItemsChange: (items: RecipientLineItem[]) => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rate, setRate] = useState(dailyRate ?? 0);
  const [caregiverId, setCaregiverId] = useState("");

  function emit(nextStart: string, nextEnd: string, nextRate: number, nextCaregiverId: string) {
    const workerName = caregivers.find((c) => c.id === nextCaregiverId)?.name;
    onLineItemsChange(dayRateLineItemsFor(eachDay(nextStart, nextEnd), nextRate, workerName));
  }

  function clear() {
    setStartDate("");
    setEndDate("");
    setRate(dailyRate ?? 0);
    setCaregiverId("");
    onLineItemsChange([]);
  }

  const days = eachDay(startDate, endDate);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Live-in / day-rate days</p>
        {(startDate || endDate) && (
          <Button type="button" variant="ghost" size="xs" onClick={clear}>
            Clear
          </Button>
        )}
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
              emit(e.target.value, endDate, rate, caregiverId);
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
              emit(startDate, e.target.value, rate, caregiverId);
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
              emit(startDate, endDate, next, caregiverId);
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Caregiver (optional)</Label>
        <Select
          items={Object.fromEntries(caregivers.map((c) => [c.id, c.name]))}
          value={caregiverId || null}
          onValueChange={(v) => {
            const next = v ?? "";
            setCaregiverId(next);
            emit(startDate, endDate, rate, next);
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Not attributed to a specific caregiver" />
          </SelectTrigger>
          <SelectContent>
            {caregivers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {days.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {days.length} day{days.length === 1 ? "" : "s"} — ${(days.length * rate).toFixed(2)} at ${rate.toFixed(2)}/day
        </p>
      )}
    </div>
  );
}
