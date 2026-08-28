"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { addManualPayment } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PaymentMethodSelect } from "./payment-method-select";

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Records a payment against a manual invoice — the first one (bringing it
// off Sent/unpaid) or another installment on a Partially Paid balance,
// same dialog either way. Flips to Paid on its own once the running total
// covers the invoice (which fires the thank-you email — see
// addManualPayment in src/lib/actions/invoices.ts).
export function AddManualPaymentDialog({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("");

  function handleSubmit() {
    const value = Number(amount);
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
        await addManualPayment(invoiceId, { amount: value, paidAt, paymentMethod: paymentMethod.trim() });
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
          <p className="text-xs text-muted-foreground">${remaining.toFixed(2)} still owed on this invoice.</p>
          <div className="space-y-1">
            <Label htmlFor="add-amount">Amount received</Label>
            <Input id="add-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-paidAt">Payment date</Label>
            <Input id="add-paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Recording..." : "Record payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
