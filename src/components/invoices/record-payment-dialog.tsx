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
import { InvoiceLineItemsEditor, emptyLineItem } from "./invoice-line-items-editor";

// One combobox covers both "just a client, no case" and "this specific
// case" — prefixing the key is simpler than a parallel id/type pair to
// carry through state, and keeps the two kinds of option unambiguous even
// though a client id and an application id could otherwise collide.
const CLIENT_PREFIX = "client:";
const CASE_PREFIX = "case:";

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };
type ProfileOption = { id: string; name: string };

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
  profiles,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState(clients[0] ? `${CLIENT_PREFIX}${clients[0].id}` : "");
  // profiles[0] is always the default — see listInvoiceProfiles' ordering
  // (isDefault desc) in src/lib/invoice-profiles.ts.
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue());
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [notes, setNotes] = useState("");

  const selectedCase = selection.startsWith(CASE_PREFIX)
    ? applications.find((a) => a.id === selection.slice(CASE_PREFIX.length))
    : undefined;
  const clientId = selectedCase ? selectedCase.clientId : selection.slice(CLIENT_PREFIX.length);
  const applicationId = selectedCase?.id;

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const selectionItems: Record<string, string> = {
    ...Object.fromEntries(clients.map((c) => [`${CLIENT_PREFIX}${c.id}`, c.name])),
    ...Object.fromEntries(
      applications.map((a) => [`${CASE_PREFIX}${a.id}`, `${a.name} — ${clientNameById.get(a.clientId) ?? "Unknown client"}`])
    ),
  };

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  function reset() {
    setSelection(clients[0] ? `${CLIENT_PREFIX}${clients[0].id}` : "");
    setProfileId(profiles[0]?.id ?? "");
    setInvoiceNumber("");
    setIssueDate(todayInputValue());
    setDueDate("");
    setLineItems([emptyLineItem()]);
    setNotes("");
  }

  function handleSubmit() {
    if (!clientId) {
      toast.error("Pick a client or case");
      return;
    }
    const cleanItems = lineItems.filter((li) => li.description.trim().length > 0);
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    startTransition(async () => {
      try {
        await createManualInvoice({
          clientId,
          applicationId,
          invoiceProfileId: profileId || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          lineItems: cleanItems,
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            For billing without an online payment link — no draft, no Send step. Created as awaiting payment;
            record what the client actually pays from the invoice&apos;s own page, whenever it comes in.
          </p>

          <div className="space-y-1">
            <Label>Client / case</Label>
            <SearchableSelect
              items={selectionItems}
              value={selection || null}
              onValueChange={(v) => setSelection(v ?? selection)}
              searchPlaceholder="Search clients or cases..."
            />
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

          <div className="grid grid-cols-3 gap-4">
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

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Subtotal (tax not calculated)</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
