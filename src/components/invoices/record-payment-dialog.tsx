"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { createManualInvoice } from "@/lib/actions/invoices";
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
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "./invoice-line-items-editor";
import { UnbilledVisitsSection } from "./unbilled-visits-section";

// One combobox covers "just a client, no case", "this specific case", and
// "this specific care recipient" — prefixing the key is simpler than a
// parallel id/type pair to carry through state, and keeps the three kinds
// of option unambiguous even though their ids could otherwise collide.
const CLIENT_PREFIX = "client:";
const CASE_PREFIX = "case:";
const RECIPIENT_PREFIX = "recipient:";

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };
type ProfileOption = { id: string; name: string };
type CareRecipientOption = { id: string; name: string; clientId: string; clientName: string; hourlyRate: number | null };
type CaregiverOption = { id: string; name: string };
type VisitBilling = { lineItems: LineItem[]; timeEntryIds: string[] };

const EMPTY_VISIT_BILLING: VisitBilling = { lineItems: [], timeEntryIds: [] };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The main way to bill a client without an online payment link — no draft,
// no Send step. Creates the invoice unpaid (awaiting
// payment); recording money against it is a separate step from the
// invoice's own page (Record payment / Record additional payment), same
// action whether that happens today or weeks from now.
export function RecordPaymentDialog({
  clients,
  applications,
  careRecipients,
  caregivers,
  profiles,
  isAdmin,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
  careRecipients: CareRecipientOption[];
  caregivers: CaregiverOption[];
  profiles: ProfileOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState(clients[0] ? `${CLIENT_PREFIX}${clients[0].id}` : "");
  const [visitBilling, setVisitBilling] = useState<VisitBilling>(EMPTY_VISIT_BILLING);
  // profiles[0] is always the default — see listInvoiceProfiles' ordering
  // (isDefault desc) in src/lib/invoice-profiles.ts.
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue());
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [notes, setNotes] = useState("");
  const [internalTag, setInternalTag] = useState("");

  const selectedCase = selection.startsWith(CASE_PREFIX)
    ? applications.find((a) => a.id === selection.slice(CASE_PREFIX.length))
    : undefined;
  const selectedRecipient = selection.startsWith(RECIPIENT_PREFIX)
    ? careRecipients.find((r) => r.id === selection.slice(RECIPIENT_PREFIX.length))
    : undefined;
  const clientId = selectedRecipient
    ? selectedRecipient.clientId
    : selectedCase
      ? selectedCase.clientId
      : selection.slice(CLIENT_PREFIX.length);
  const applicationId = selectedCase?.id;
  const careRecipientId = selectedRecipient?.id;

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const selectionItems: Record<string, string> = {
    ...Object.fromEntries(clients.map((c) => [`${CLIENT_PREFIX}${c.id}`, c.name])),
    ...Object.fromEntries(
      applications.map((a) => [`${CASE_PREFIX}${a.id}`, `${a.name} — ${clientNameById.get(a.clientId) ?? "Unknown client"}`])
    ),
    ...Object.fromEntries(
      careRecipients.map((r) => [`${RECIPIENT_PREFIX}${r.id}`, `${r.name} — ${r.clientName}`])
    ),
  };

  const visitsSubtotal = visitBilling.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const manualSubtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const subtotal = visitsSubtotal + manualSubtotal;

  function reset() {
    setSelection(clients[0] ? `${CLIENT_PREFIX}${clients[0].id}` : "");
    setVisitBilling(EMPTY_VISIT_BILLING);
    setProfileId(profiles[0]?.id ?? "");
    setInvoiceNumber("");
    setIssueDate(todayInputValue());
    setDueDate("");
    setLineItems([emptyLineItem()]);
    setNotes("");
    setInternalTag("");
  }

  function handleSubmit() {
    if (!clientId) {
      toast.error("Pick a client, case, or care recipient");
      return;
    }
    const manualItems = lineItems.filter((li) => li.description.trim().length > 0);
    const allItems = [...visitBilling.lineItems, ...manualItems];
    if (allItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    startTransition(async () => {
      try {
        await createManualInvoice({
          clientId,
          applicationId,
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
      <DialogTrigger render={<Button variant="outline"><HandCoins className="size-3.5" /> New Manual Invoice</Button>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            For billing without an online payment link — no draft, no Send step. Created as awaiting payment;
            record what the client actually pays from the invoice&apos;s own page, whenever it comes in.
          </p>

          <div className="space-y-1">
            <Label>Client / case / care recipient</Label>
            <SearchableSelect
              items={selectionItems}
              value={selection || null}
              onValueChange={(v) => setSelection(v ?? selection)}
              searchPlaceholder="Search clients, cases, or care recipients..."
            />
          </div>

          {selectedRecipient && (
            <UnbilledVisitsSection
              key={selectedRecipient.id}
              careRecipientId={selectedRecipient.id}
              hourlyRate={selectedRecipient.hourlyRate}
              caregivers={caregivers}
              canLogVisit={isAdmin}
              onVisitsChange={setVisitBilling}
            />
          )}

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
              <Label htmlFor="invoiceNumber">Invoice number (optional)</Label>
              <Input
                id="invoiceNumber"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Leave blank for DRAFT-00007"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="issueDate">Issue date</Label>
              <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <InvoiceLineItemsEditor lineItems={lineItems} onChange={setLineItems} />

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note printed on the invoice" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="internalTag">Internal Tag <span className="font-normal text-muted-foreground">(staff only — never shown to the client)</span></Label>
            <Input
              id="internalTag"
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
