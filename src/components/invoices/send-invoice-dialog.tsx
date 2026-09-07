"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmailRecipientPicker } from "./email-recipient-picker";

// The online/Stripe-bound Send/Resend — unlike the manual PDF and receipt
// emails, Stripe sends to its Customer object's email, not a per-invoice
// address, so picking a different recipient here updates that Customer
// going forward (see sendInvoice in src/lib/actions/invoices.ts) rather
// than being a true one-off. Worth flagging in the copy below so that's
// not a surprise.
export function SendInvoiceDialog({
  invoiceId,
  isResend,
  businessEmail,
  ownerEmail,
}: {
  invoiceId: string;
  isResend: boolean;
  businessEmail: string | null;
  ownerEmail: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [recipientEmail, setRecipientEmail] = useState("");

  const verb = isResend ? "Resend" : "Send";

  function handleSend() {
    startTransition(async () => {
      try {
        await sendInvoice(invoiceId, recipientEmail);
        toast.success("Invoice sent");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send invoice");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Send className="size-3.5" /> {verb}</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{verb} invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Stripe emails this invoice to whoever&apos;s picked below. Choosing a different email updates this
            client&apos;s billing email in Stripe going forward, not just for this one send.
          </p>
          <EmailRecipientPicker businessEmail={businessEmail} ownerEmail={ownerEmail} onChange={setRecipientEmail} />
          <Button onClick={handleSend} className="w-full" disabled={isPending || !recipientEmail}>
            {isPending ? "Sending..." : `${verb} invoice`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
