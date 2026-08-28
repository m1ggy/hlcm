"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { recordManualPayment } from "@/lib/actions/invoices";
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
import { PaymentMethodSelect } from "./payment-method-select";

const NONE = "__none__";

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// For a transaction that was already paid before any invoice existed —
// cash handed over, a check already cashed, a wire that landed — logged
// straight into Paid (or Partially Paid, if less than the full amount came
// in) with no Stripe involvement at all. Separate entry point from New
// Invoice so there's no ambiguity about which flow you're in: this one
// never drafts, never sends, never emails the client.
export function RecordPaymentDialog({
  clients,
  applications,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [applicationId, setApplicationId] = useState(NONE);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  // null = "not yet touched" — follows the line-item subtotal (paid in
  // full, the common case) until the amount field is edited by hand, at
  // which point it stops following so a deliberately-partial amount isn't
  // silently overwritten as line items change.
  const [amountOverride, setAmountOverride] = useState<string | null>(null);

  const clientApplications = applications.filter((a) => a.clientId === clientId);
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const amountPaid = amountOverride ?? subtotal.toFixed(2);

  function reset() {
    setClientId(clients[0]?.id ?? "");
    setApplicationId(NONE);
    setInvoiceNumber("");
    setLineItems([emptyLineItem()]);
    setPaidAt(todayInputValue());
    setPaymentMethod("");
    setNotes("");
    setAmountOverride(null);
  }

  function handleSubmit() {
    if (!clientId) {
      toast.error("Pick a client");
      return;
    }
    const cleanItems = lineItems.filter((li) => li.description.trim().length > 0);
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (!paymentMethod.trim()) {
      toast.error("Pick or describe the payment method");
      return;
    }
    const amount = Number(amountPaid);
    if (!(amount > 0)) {
      toast.error("Amount received must be greater than 0");
      return;
    }

    startTransition(async () => {
      try {
        await recordManualPayment({
          clientId,
          applicationId: applicationId === NONE ? undefined : applicationId,
          invoiceNumber: invoiceNumber.trim() || undefined,
          paidAt,
          paymentMethod: paymentMethod.trim(),
          amountPaid: amount,
          notes: notes || undefined,
          lineItems: cleanItems,
        });
        toast.success("Payment recorded");
        setOpen(false);
        reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to record payment");
      }
    });
  }

  const remaining = subtotal - (Number(amountPaid) || 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline"><HandCoins className="size-3.5" /> Record Payment</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            For a transaction already paid outside Stripe — cash, check, wire. This never drafts or emails
            anything — it&apos;s logged straight in as paid.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Client</Label>
              <SearchableSelect
                items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                value={clientId || null}
                onValueChange={(v) => {
                  setClientId(v ?? clientId);
                  setApplicationId(NONE);
                }}
                searchPlaceholder="Search clients..."
              />
            </div>
            <div className="space-y-1">
              <Label>Case (optional)</Label>
              <SearchableSelect
                items={{ [NONE]: "None", ...Object.fromEntries(clientApplications.map((a) => [a.id, a.name])) }}
                value={applicationId}
                onValueChange={(v) => setApplicationId(v ?? NONE)}
                searchPlaceholder="Search cases..."
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="invoiceNumber">Invoice number (optional)</Label>
            <Input
              id="invoiceNumber"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Leave blank to show a placeholder like DRAFT-00007"
              className="max-w-56"
            />
          </div>

          <InvoiceLineItemsEditor lineItems={lineItems} onChange={setLineItems} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="paidAt">Payment date</Label>
              <Input id="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="amountPaid">Amount received</Label>
            <Input
              id="amountPaid"
              type="number"
              min={0}
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountOverride(e.target.value)}
              className="max-w-32"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — reference number, context, etc." />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Subtotal ${subtotal.toFixed(2)} — no tax, no Stripe.{" "}
              {remaining > 0.004
                ? `$${remaining.toFixed(2)} still owed — records as Partially Paid.`
                : "Fully covered — records as Paid."}
            </span>
            <span className="font-medium">${(Number(amountPaid) || 0).toFixed(2)}</span>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Recording..." : "Record payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
