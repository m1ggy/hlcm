"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { sendReceiptEmail } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Generation (addManualPayment) and sending are deliberately separate
// steps — a receipt always exists the moment a payment is recorded, but
// nothing gets emailed until this dialog's button is clicked. Mirrors
// SendInvoicePdfDialog, minus the extra-attachments picker (a receipt is
// a fixed, already-generated PDF — there's nothing to attach it to).
export function SendReceiptDialog({ receiptId, alreadySent }: { receiptId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const verb = alreadySent ? "Resend" : "Send";

  function handleSend() {
    startTransition(async () => {
      try {
        await sendReceiptEmail(receiptId);
        toast.success("Receipt sent");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send receipt");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline"><Mail className="size-3" /> {verb} receipt</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{verb} receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The receipt PDF will be emailed to the client on file for this invoice.
          </p>
          <Button onClick={handleSend} className="w-full" disabled={isPending}>
            {isPending ? "Sending..." : `${verb} email`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
