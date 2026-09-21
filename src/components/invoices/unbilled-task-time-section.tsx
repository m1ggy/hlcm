"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listUnbilledTaskTime } from "@/lib/actions/task-time-entries";
import { Checkbox } from "@/components/ui/checkbox";
import { type LineItem } from "@/components/invoices/invoice-line-items-editor";

type UnbilledEntry = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  user: { name: string; hourlyRate: number | null };
  task: { label: string } | null;
};

function hoursOf(entry: { startedAt: Date; endedAt: Date | null }) {
  // listUnbilledTaskTime only ever returns completed (endedAt set) entries —
  // the ?? fallback is just a type-safe no-op, same convention as
  // UnbilledVisitsSection's own hoursOf.
  return (new Date(entry.endedAt ?? entry.startedAt).getTime() - new Date(entry.startedAt).getTime()) / (1000 * 60 * 60);
}

function taskTimeLineItemsFor(entries: UnbilledEntry[]): LineItem[] {
  return entries.map((e) => ({
    description: `${new Date(e.startedAt).toLocaleDateString()} — ${e.task?.label ?? "Internal"} — ${e.user.name} (${hoursOf(e).toFixed(2)}h)`,
    quantity: Number(hoursOf(e).toFixed(2)),
    unitPrice: e.user.hourlyRate ?? 0,
  }));
}

/**
 * An Application's unbilled tracked task time — the "bill tracked time"
 * counterpart to UnbilledVisitsSection (which does the same for a Care
 * Recipient's logged visits). Each entry is priced at its own contributor's
 * hourlyRate (task time can have several different people's hours mixed
 * together, unlike a recipient's visits which all use one shared rate), so
 * there's no single "hourlyRate" prop here. Reports the derived line items +
 * billed entry ids up via `onSelectionChange`, same shape as
 * UnbilledVisitsSection's `onVisitsChange`.
 *
 * Render this with `key={applicationId}` at the call site — switching cases
 * remounts it for a clean reset, same convention as UnbilledVisitsSection.
 */
export function UnbilledTaskTimeSection({
  applicationId,
  onSelectionChange,
}: {
  applicationId: string;
  onSelectionChange: (data: { lineItems: LineItem[]; taskTimeEntryIds: string[] }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<UnbilledEntry[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listUnbilledTaskTime(applicationId)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Failed to load unbilled task time");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  function applySelection(nextIds: Set<string>) {
    setSelectedIds(nextIds);
    const selected = (entries ?? []).filter((e) => nextIds.has(e.id));
    onSelectionChange({ lineItems: taskTimeLineItemsFor(selected), taskTimeEntryIds: Array.from(nextIds) });
  }

  function toggle(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    applySelection(next);
  }

  function toggleAll(checked: boolean) {
    applySelection(checked ? new Set((entries ?? []).map((e) => e.id)) : new Set());
  }

  const selected = (entries ?? []).filter((e) => selectedIds.has(e.id));
  const subtotal = selected.reduce((sum, e) => sum + hoursOf(e) * (e.user.hourlyRate ?? 0), 0);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Unbilled tracked time</p>
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!loading && entries !== null && entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No logged, unbilled task time for this case.</p>
      )}
      {!loading && entries !== null && entries.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 border-b pb-1.5 text-xs text-muted-foreground">
            <Checkbox checked={selectedIds.size === entries.length} onCheckedChange={(c) => toggleAll(c === true)} />
            <span>Select all ({entries.length})</span>
          </div>
          {entries.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selectedIds.has(e.id)} onCheckedChange={(c) => toggle(e.id, c === true)} />
              <span>
                {new Date(e.startedAt).toLocaleDateString()} · {e.task?.label ?? "Internal"} · {e.user.name} · {hoursOf(e).toFixed(2)}h
              </span>
            </label>
          ))}
          {selected.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              {selected.length} selected — {selected.reduce((s, e) => s + hoursOf(e), 0).toFixed(2)}h · ${subtotal.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
