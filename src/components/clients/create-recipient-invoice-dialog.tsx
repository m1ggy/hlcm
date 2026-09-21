"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { createCareRecipientInvoice } from "@/lib/actions/care-recipient-invoices";
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
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "@/components/invoices/invoice-line-items-editor";
import { UnbilledVisitsSection, type RecipientLineItem } from "@/components/invoices/unbilled-visits-section";
import { DayRateSection } from "@/components/invoices/day-rate-section";

type ProfileOption = { id: string; name: string };
type CaregiverOption = { id: string; name: string };
type VisitBilling = { lineItems: RecipientLineItem[]; timeEntryIds: string[] };

const EMPTY_VISIT_BILLING: VisitBilling = { lineItems: [], timeEntryIds: [] };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  dailyRate,
  profiles,
  caregivers,
  isAdmin,
}: {
  clientId: string;
  careRecipientId: string;
  careRecipientName: string;
  hourlyRate: number | null;
  dailyRate: number | null;
  profiles: ProfileOption[];
  caregivers: CaregiverOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [visitBilling, setVisitBilling] = useState<VisitBilling>(EMPTY_VISIT_BILLING);
  const [dayRateLineItems, setDayRateLineItems] = useState<RecipientLineItem[]>([]);

  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue());
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);
  const [notes, setNotes] = useState("");
  const [internalTag, setInternalTag] = useState("");

  function reset() {
    setVisitBilling(EMPTY_VISIT_BILLING);
    setDayRateLineItems([]);
    setProfileId(profiles[0]?.id ?? "");
    setInvoiceNumber("");
    setIssueDate(todayInputValue());
    setDueDate("");
    setLineItems([emptyLineItem()]);
    setNotes("");
    setInternalTag("");
  }

  const visitsSubtotal = visitBilling.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const dayRateSubtotal = dayRateLineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const manualSubtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const subtotal = visitsSubtotal + dayRateSubtotal + manualSubtotal;

  function handleSubmit() {
    const manualItems: RecipientLineItem[] = lineItems
      .filter((li) => li.description.trim().length > 0)
      .map((li) => ({ ...li, kind: "MANUAL" as const }));
    const allItems = [...visitBilling.lineItems, ...dayRateLineItems, ...manualItems];
    if (allItems.length === 0) {
      toast.error("Select a visit, bill live-in days, or add a line item");
      return;
    }

    startTransition(async () => {
      try {
        await createCareRecipientInvoice({
          clientId,
          careRecipientId,
          timeEntryIds: visitBilling.timeEntryIds.length ? visitBilling.timeEntryIds : undefined,
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

          <UnbilledVisitsSection
            key={careRecipientId}
            careRecipientId={careRecipientId}
            hourlyRate={hourlyRate}
            caregivers={caregivers}
            canLogVisit={isAdmin}
            onVisitsChange={setVisitBilling}
          />

          <DayRateSection key={`${careRecipientId}-daily`} dailyRate={dailyRate} onLineItemsChange={setDayRateLineItems} />

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
            <InvoiceLineItemsEditor lineItems={lineItems} onChange={setLineItems} rateLabel="Hourly rate" />
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
