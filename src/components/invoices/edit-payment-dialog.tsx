"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { updatePayment } from "@/lib/actions/invoices";
import { PaymentMethodSelect } from "./payment-method-select";

function toDateInputValue(date: Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Corrects a payment already recorded against a manual invoice — a
// typo'd amount, the wrong date, whatever. Mirrors AddManualPaymentDialog,
// just prefilled and calling updatePayment instead. The invoice's own
// totals (and, if it has one, this payment's receipt PDF) are recomputed
// server-side — see updatePayment in src/lib/actions/invoices.ts — never
// re-emailed automatically even if the old receipt had already gone out;
// that's still the separate "Send receipt" action.
export function EditPaymentDialog({
  paymentId,
  amount,
  paidAt,
  paymentMethod,
}: {
  paymentId: string;
  amount: number;
  paidAt: Date;
  paymentMethod: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [amountValue, setAmountValue] = useState(amount.toFixed(2));
  const [paidAtValue, setPaidAtValue] = useState(toDateInputValue(paidAt));
  const [methodValue, setMethodValue] = useState(paymentMethod);

  function handleSubmit() {
    const value = Number(amountValue);
    if (!(value > 0)) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (!methodValue.trim()) {
      toast.error("Pick or describe the payment method");
      return;
    }
    startTransition(async () => {
      try {
        const { receiptAlreadySent } = await updatePayment(paymentId, {
          amount: value,
          paidAt: paidAtValue,
          paymentMethod: methodValue.trim(),
        });
        toast.success("Payment updated");
        if (receiptAlreadySent) {
          toast.warning("This receipt was already emailed — resend it if the client needs the corrected copy.");
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update payment");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="ghost"><Pencil className="size-3" /></Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-amount">Amount received</Label>
            <Input id="edit-amount" type="number" min={0} step="0.01" value={amountValue} onChange={(e) => setAmountValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-paidAt">Payment date</Label>
            <Input id="edit-paidAt" type="date" value={paidAtValue} onChange={(e) => setPaidAtValue(e.target.value)} />
          </div>
          <PaymentMethodSelect value={methodValue} onChange={setMethodValue} />
          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
