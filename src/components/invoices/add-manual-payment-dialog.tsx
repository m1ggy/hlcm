"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addManualPayment } from "@/lib/actions/invoices";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PaymentMethodSelect } from "./payment-method-select";
import { PaymentLineItemSelect, type PaymentLineItemOption } from "./payment-line-item-select";
import { formatMoney } from "@/lib/money";

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Records a payment against a manual invoice — the first one (bringing it
// off Sent/unpaid) or another installment on a Partially Paid balance,
// same dialog either way. Flips to Paid on its own once the running total
// covers the invoice. A receipt is generated and saved automatically for
// every payment, partial or not — see addManualPayment in
// src/lib/actions/invoices.ts — but never emailed on its own; that's the
// separate "Send receipt" action on the invoice's own page.
export function AddManualPaymentDialog({
  invoiceId,
  remaining,
  defaultPayer = "",
  lineItems,
}: {
  invoiceId: string;
  remaining: number;
  /** The client's contact (invoiceContact), prefilled as "Paid by". */
  defaultPayer?: string;
  lineItems: PaymentLineItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reference, setReference] = useState("");
  const [payerName, setPayerName] = useState(defaultPayer);
  const [lineItemId, setLineItemId] = useState("");
  const value = Number(amount);
  const over = value > 0 ? Math.round((value - remaining) * 100) / 100 : 0;

  // Picking a line fills in what's still owed on it; back to the whole
  // invoice fills in the invoice's balance.
  function pickLine(id: string) {
    setLineItemId(id);
    const due = id ? lineItems.find((li) => li.id === id)?.due : remaining;
    if (due !== undefined && due > 0) setAmount(due.toFixed(2));
  }

  function handleSubmit() {
    if (!(value > 0)) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (!paymentMethod.trim()) {
      toast.error("Pick or describe the payment method");
      return;
    }
    startTransition(async () => {
      try {
        await addManualPayment(invoiceId, { amount: value, paidAt, paymentMethod: paymentMethod.trim(), reference, payerName, lineItemId });
        toast.success("Payment recorded");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to record payment");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline"><PlusCircle className="size-3.5" /> Record payment</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{formatMoney(remaining)} still owed on this invoice.</p>
          <div className="space-y-1">
            <Label htmlFor="add-amount">Amount received</Label>
            <Input id="add-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {over > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                That&apos;s {formatMoney(over)} more than what&apos;s owed. Check the amount — if it&apos;s a prepayment, the extra
                counts toward lines added later.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-paidAt">Payment date</Label>
            <Input id="add-paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
          <div className="space-y-1">
            <Label htmlFor="add-payer">Paid by (optional)</Label>
            <Input id="add-payer" placeholder="Name on the Zelle, check or card" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-reference">Reference (optional)</Label>
            <Input id="add-reference" placeholder="Check #, Zelle confirmation…" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          {lineItems.length > 0 && <PaymentLineItemSelect lineItems={lineItems} value={lineItemId} onChange={pickLine} />}
          <Button onClick={handleSubmit} className="w-full" loading={isPending}>
            {isPending ? "Recording..." : "Record payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
