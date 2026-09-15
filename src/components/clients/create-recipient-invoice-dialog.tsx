"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins, Plus } from "lucide-react";
import { createManualInvoice } from "@/lib/actions/invoices";
import { listUnbilledVisits } from "@/lib/actions/care-recipients";
import { createManualTimeEntry } from "@/lib/actions/time-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "@/components/invoices/invoice-line-items-editor";

type ProfileOption = { id: string; name: string };
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

// A recipient's care recipient invoice, billed under the Client this
// recipient already belongs to — same createManualInvoice this Client's
// generic "New Manual Invoice" dialog (RecordPaymentDialog) uses, just
// without the client/case picker, since clientId/careRecipientId are
// already fixed by which recipient row this was opened from.
export function CreateRecipientInvoiceDialog({
  clientId,
  careRecipientId,
  careRecipientName,
  hourlyRate,
  profiles,
  caregivers,
  isAdmin,
}: {
  clientId: string;
  careRecipientId: string;
  careRecipientName: string;
  hourlyRate: number | null;
  profiles: ProfileOption[];
  caregivers: CaregiverOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visits, setVisits] = useState<UnbilledVisit[] | null>(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set());
  const [showLogVisit, setShowLogVisit] = useState(false);

  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue());
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);
  const [notes, setNotes] = useState("");
  const [internalTag, setInternalTag] = useState("");

  // "Log a missed visit" sub-form state
  const [logCaregiverId, setLogCaregiverId] = useState("");
  const [logDate, setLogDate] = useState(todayInputValue());
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  function loadVisits() {
    setLoadingVisits(true);
    listUnbilledVisits(careRecipientId)
      .then((rows) => setVisits(rows))
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load unbilled visits"))
      .finally(() => setLoadingVisits(false));
  }

  function reset() {
    setVisits(null);
    setSelectedVisitIds(new Set());
    setShowLogVisit(false);
    setProfileId(profiles[0]?.id ?? "");
    setInvoiceNumber("");
    setIssueDate(todayInputValue());
    setDueDate("");
    setLineItems([emptyLineItem()]);
    setNotes("");
    setInternalTag("");
    setLogCaregiverId("");
    setLogDate(todayInputValue());
    setLogStart("");
    setLogEnd("");
  }

  function toggleVisit(id: string, checked: boolean) {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisits(checked: boolean) {
    setSelectedVisitIds(checked ? new Set((visits ?? []).map((v) => v.id)) : new Set());
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
          setVisits(rows);
          setSelectedVisitIds((prev) => new Set(prev).add(entry.id));
        });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to log visit"))
      .finally(() => setIsLogging(false));
  }

  const selectedVisits = (visits ?? []).filter((v) => selectedVisitIds.has(v.id));
  const visitsSubtotal = selectedVisits.reduce((sum, v) => sum + hoursOf(v) * (hourlyRate ?? 0), 0);
  const manualSubtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const subtotal = visitsSubtotal + manualSubtotal;

  function handleSubmit() {
    const visitLineItems: LineItem[] = selectedVisits.map((v) => ({
      description: `${new Date(v.clockIn).toLocaleDateString()} visit — ${v.user.name} (${hoursOf(v).toFixed(2)}h)`,
      quantity: Number(hoursOf(v).toFixed(2)),
      unitPrice: hourlyRate ?? 0,
    }));
    const manualItems = lineItems.filter((li) => li.description.trim().length > 0);
    const allItems = [...visitLineItems, ...manualItems];
    if (allItems.length === 0) {
      toast.error("Select a visit or add a line item");
      return;
    }

    startTransition(async () => {
      try {
        await createManualInvoice({
          clientId,
          careRecipientId,
          timeEntryIds: selectedVisits.length ? Array.from(selectedVisitIds) : undefined,
          invoiceProfileId: profileId || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          internalTag: internalTag || undefined,
          lineItems: allItems,
        });
        toast.success("Invoice created");
        setOpen(false);
        reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create invoice");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && visits === null) loadVisits();
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <HandCoins className="size-3.5" /> New invoice
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice — for {careRecipientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Billed under this recipient&apos;s client, same as any manual invoice — no draft, no Send step. Created
            as awaiting payment; record what actually comes in from the invoice&apos;s own page.
          </p>

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

            {isAdmin && (
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

          {profiles.length > 1 && (
            <div className="space-y-1">
              <Label>Bill as</Label>
              <SearchableSelect
                items={Object.fromEntries(profiles.map((p) => [p.id, p.name]))}
                value={profileId || null}
                onValueChange={(v) => setProfileId(v ?? profileId)}
                searchPlaceholder="Search profiles..."
              />
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="recipientInvoiceNumber">Invoice number (optional)</Label>
              <Input
                id="recipientInvoiceNumber"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Leave blank for DRAFT-00007"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recipientIssueDate">Issue date</Label>
              <Input id="recipientIssueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recipientDueDate">Due date (optional)</Label>
              <Input id="recipientDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Other line items</Label>
            <InvoiceLineItemsEditor lineItems={lineItems} onChange={setLineItems} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="recipientNotes">Notes</Label>
            <Textarea id="recipientNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note printed on the invoice" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="recipientInternalTag">
              Internal Tag <span className="font-normal text-muted-foreground">(staff only — never shown to the client)</span>
            </Label>
            <Input
              id="recipientInternalTag"
              value={internalTag}
              onChange={(e) => setInternalTag(e.target.value)}
              placeholder="e.g. referred by Sarah, rush job"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Subtotal (tax not calculated)</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>

          <Button onClick={handleSubmit} className="w-full" loading={isPending}>
            {isPending ? "Creating..." : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
