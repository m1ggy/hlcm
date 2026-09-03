"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePayment } from "@/lib/actions/invoices";
import { EditPaymentDialog } from "./edit-payment-dialog";

// Edit/delete for one row of the invoice detail page's Payments card —
// split into its own small client component so that page itself stays a
// server component, same reasoning SendReceiptDialog is already split out.
export function PaymentRowActions({
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
  const [isDeleting, startDeleting] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete this $${amount.toFixed(2)} payment? The invoice's totals will recalculate without it.`)) return;
    startDeleting(async () => {
      try {
        const { receiptAlreadySent } = await deletePayment(paymentId);
        toast.success("Payment deleted");
        if (receiptAlreadySent) {
          toast.warning("That payment's receipt had already been emailed — it's gone now, but the client may still have the old copy.");
        }
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete payment");
      }
    });
  }

  return (
    <div className="flex items-center gap-0.5">
      <EditPaymentDialog paymentId={paymentId} amount={amount} paidAt={paidAt} paymentMethod={paymentMethod} />
      <Button size="xs" variant="ghost" onClick={handleDelete} disabled={isDeleting}>
        <Trash2 className="size-3 text-destructive" />
      </Button>
    </div>
  );
}
