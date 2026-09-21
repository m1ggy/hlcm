"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listUnbilledVisits } from "@/lib/actions/care-recipients";
import { createManualTimeEntry } from "@/lib/actions/time-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type LineItem } from "@/components/invoices/invoice-line-items-editor";

// A Care Recipient invoice's line item, structured beyond the plain
// description/qty/unit-price shape so generateCareRecipientInvoicePdf can
// render real Date/Worker/Times/Rate columns instead of parsing them back
// out of `description` — see the `kind`/visit* fields on InvoiceLineItem
// in prisma/schema.prisma. `description` is still sent (some UI reads it
// generically) but the PDF prefers the structured fields when kind isn't
// MANUAL. Dates are ISO strings, matching how createCareRecipientInvoice's
// zod schema parses them.
export type RecipientLineItem = LineItem & {
  kind: "MANUAL" | "VISIT_HOURLY" | "VISIT_DAILY";
  visitDate?: string;
  visitStart?: string;
  visitEnd?: string;
  workerName?: string;
};

type CaregiverOption = { id: string; name: string };
type UnbilledVisit = {
  id: string;
  clockIn: Date;
  // Always non-null in practice — listUnbilledVisits only ever returns
  // completed (clocked-out) visits — but Prisma's static type keeps it
  // nullable since clockOut is optional on TimeEntry in general.
  clockOut: Date | null;
  user: { name: string };
};

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoursOf(entry: { clockIn: Date; clockOut: Date | null }) {
  // listUnbilledVisits only ever returns completed visits — clockOut ??
  // clockIn is just a type-safe no-op fallback, never expected to fire.
  return (new Date(entry.clockOut ?? entry.clockIn).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
}

function visitLineItemsFor(visits: UnbilledVisit[], hourlyRate: number | null): RecipientLineItem[] {
  return visits.map((v) => ({
    description: `${new Date(v.clockIn).toLocaleDateString()} visit — ${v.user.name} (${hoursOf(v).toFixed(2)}h)`,
    quantity: Number(hoursOf(v).toFixed(2)),
    unitPrice: hourlyRate ?? 0,
    kind: "VISIT_HOURLY",
    visitDate: new Date(v.clockIn).toISOString(),
    visitStart: new Date(v.clockIn).toISOString(),
    visitEnd: new Date(v.clockOut ?? v.clockIn).toISOString(),
    workerName: v.user.name,
  }));
}

/**
 * A Care Recipient's unbilled visits — pick which ones to bill (auto-priced
 * at `hourlyRate`) and optionally log a missed one on the spot. Shared by
 * CreateRecipientInvoiceDialog (Client page) and RecordPaymentDialog
 * (Invoices page) — both bill a recipient the same way, just reached from
 * different places. Reports the derived line items + billed time-entry ids
 * up via `onVisitsChange` any time the selection changes, so the parent can
 * merge them into its own line items and pass `timeEntryIds` through on
 * submit.
 *
 * Render this with `key={careRecipientId}` at the call site — switching
 * recipients remounts it for a clean reset instead of an effect resetting
 * state (which React's own lint rules steer away from; see
 * https://react.dev/learn/you-might-not-need-an-effect).
 */
export function UnbilledVisitsSection({
  careRecipientId,
  hourlyRate,
  caregivers,
  canLogVisit,
  onVisitsChange,
}: {
  careRecipientId: string;
  hourlyRate: number | null;
  caregivers: CaregiverOption[];
  canLogVisit: boolean;
  onVisitsChange: (data: { lineItems: RecipientLineItem[]; timeEntryIds: string[] }) => void;
}) {
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [visits, setVisits] = useState<UnbilledVisit[] | null>(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set());
  const [showLogVisit, setShowLogVisit] = useState(false);

  // "Log a missed visit" sub-form state
  const [logCaregiverId, setLogCaregiverId] = useState("");
  const [logDate, setLogDate] = useState(todayInputValue());
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listUnbilledVisits(careRecipientId)
      .then((rows) => {
        if (cancelled) return;
        setVisits(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Failed to load unbilled visits");
      })
      .finally(() => {
        if (!cancelled) setLoadingVisits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [careRecipientId]);

  function applySelection(nextVisits: UnbilledVisit[], nextSelectedIds: Set<string>) {
    setVisits(nextVisits);
    setSelectedVisitIds(nextSelectedIds);
    const selected = nextVisits.filter((v) => nextSelectedIds.has(v.id));
    onVisitsChange({ lineItems: visitLineItemsFor(selected, hourlyRate), timeEntryIds: Array.from(nextSelectedIds) });
  }

  function toggleVisit(id: string, checked: boolean) {
    const next = new Set(selectedVisitIds);
    if (checked) next.add(id);
    else next.delete(id);
    applySelection(visits ?? [], next);
  }

  function toggleAllVisits(checked: boolean) {
    applySelection(visits ?? [], checked ? new Set((visits ?? []).map((v) => v.id)) : new Set());
  }

  function handleLogVisit() {
    if (!logCaregiverId || !logDate || !logStart || !logEnd) {
      toast.error("Fill in the caregiver, date, and both times");
      return;
    }
    const clockIn = new Date(`${logDate}T${logStart}`);
    const clockOut = new Date(`${logDate}T${logEnd}`);
    setIsLogging(true);
    createManualTimeEntry({
      userId: logCaregiverId,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut.toISOString(),
      careRecipientId,
    })
      .then((entry) => {
        toast.success("Visit logged");
        setLogCaregiverId("");
        setLogStart("");
        setLogEnd("");
        setShowLogVisit(false);
        // Re-fetch so the new visit shows up, then pre-select it.
        return listUnbilledVisits(careRecipientId).then((rows) => {
          applySelection(rows, new Set(selectedVisitIds).add(entry.id));
        });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to log visit"))
      .finally(() => setIsLogging(false));
  }

  const selectedVisits = (visits ?? []).filter((v) => selectedVisitIds.has(v.id));
  const visitsSubtotal = selectedVisits.reduce((sum, v) => sum + hoursOf(v) * (hourlyRate ?? 0), 0);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Unbilled visits</p>
      {loadingVisits && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!loadingVisits && visits !== null && visits.length === 0 && (
        <p className="text-xs text-muted-foreground">No logged, unbilled visits for this recipient.</p>
      )}
      {!loadingVisits && visits !== null && visits.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 border-b pb-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={selectedVisitIds.size === visits.length}
              onCheckedChange={(c) => toggleAllVisits(c === true)}
            />
            <span>Select all ({visits.length})</span>
          </div>
          {visits.map((v) => (
            <label key={v.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedVisitIds.has(v.id)}
                onCheckedChange={(c) => toggleVisit(v.id, c === true)}
              />
              <span>
                {new Date(v.clockIn).toLocaleDateString()} · {v.user.name} · {hoursOf(v).toFixed(2)}h
              </span>
            </label>
          ))}
          {selectedVisits.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              {selectedVisits.length} selected — {selectedVisits.reduce((s, v) => s + hoursOf(v), 0).toFixed(2)}h
              {hourlyRate != null ? ` · $${visitsSubtotal.toFixed(2)} at $${hourlyRate}/hr` : " (set an hourly rate to auto-price)"}
            </p>
          )}
        </div>
      )}

      {canLogVisit && (
        <div className="border-t pt-2">
          {!showLogVisit ? (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setShowLogVisit(true)}>
              <Plus className="size-3.5" /> Log a missed visit
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg bg-muted/40 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Caregiver</Label>
                  <Select
                    items={Object.fromEntries(caregivers.map((c) => [c.id, c.name]))}
                    value={logCaregiverId || null}
                    onValueChange={(v) => setLogCaregiverId(v ?? "")}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="Pick a caregiver..." />
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
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" className="h-8 text-xs" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Input type="time" className="h-8 text-xs" value={logStart} onChange={(e) => setLogStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End</Label>
                  <Input type="time" className="h-8 text-xs" value={logEnd} onChange={(e) => setLogEnd(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="xs" onClick={() => setShowLogVisit(false)}>
                  Cancel
                </Button>
                <Button size="xs" onClick={handleLogVisit} loading={isLogging}>
                  Add visit
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
