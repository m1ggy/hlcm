"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, CheckCircle2, Ban, Download, ExternalLink, Trash2 } from "lucide-react";
import { sendInvoice, markInvoicePaid, voidInvoice, voidInvoiceWithPayments, deleteInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { InvoiceFormDialog } from "./invoice-form-dialog";
import { AddManualPaymentDialog } from "./add-manual-payment-dialog";
import { SendInvoicePdfDialog } from "./send-invoice-pdf-dialog";
import { isManualInvoice } from "./invoice-status-badge";

type LineItem = { description: string; quantity: number; unitPrice: number };

export function InvoiceActions({
  invoice,
  clients,
  applications,
  paymentsCount = 0,
}: {
  invoice: {
    id: string;
    status: string;
    stripeInvoiceId: string | null;
    hostedInvoiceUrl: string | null;
    invoicePdfUrl: string | null;
    lastSentAt: Date | null;
    clientId: string;
    applicationId: string | null;
    dueDate: Date | null;
    notes: string | null;
    total: number | null;
    amountPaid: number | null;
    lineItems: LineItem[];
    importedAt: Date | null;
  };
  clients: { id: string; name: string }[];
  applications: { id: string; name: string; clientId: string }[];
  /** How many Payment rows exist for this invoice — just for the "Void"
   * confirmation's wording on a PAID/PARTIALLY_PAID manual invoice. */
  paymentsCount?: number;
}) {
  const router = useRouter();
  const [isSending, startSending] = useTransition();
  const [isMarking, startMarking] = useTransition();
  const [isVoiding, startVoiding] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleSend() {
    const verb = invoice.status === "DRAFT" ? "Send" : "Resend";
    if (!confirm(`${verb} this invoice by email now?`)) return;
    startSending(async () => {
      try {
        await sendInvoice(invoice.id);
        toast.success("Invoice sent");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send invoice");
      }
    });
  }

  function handleMarkPaid() {
    if (!confirm("Mark this invoice paid? Use this only if the client paid outside Stripe.")) return;
    startMarking(async () => {
      try {
        await markInvoicePaid(invoice.id);
        toast.success("Marked paid");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update");
      }
    });
  }

  function handleVoid() {
    if (!confirm("Void this invoice? It'll stop accepting payment.")) return;
    startVoiding(async () => {
      try {
        await voidInvoice(invoice.id);
        toast.success("Invoice voided");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to void invoice");
      }
    });
  }

  function handleVoidWithPayments() {
    const amount = (invoice.amountPaid ?? 0).toFixed(2);
    const paymentWord = paymentsCount === 1 ? "payment" : "payments";
    if (
      !confirm(
        `Void this invoice? It's recorded $${amount} across ${paymentsCount} ${paymentWord} — those payment records ` +
          `are kept for history, but this invoice will stop counting them (status Void, balance reset to $0).`
      )
    ) {
      return;
    }
    startVoiding(async () => {
      try {
        await voidInvoiceWithPayments(invoice.id);
        toast.success("Invoice voided");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to void invoice");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this draft invoice? This can't be undone.")) return;
    startDeleting(async () => {
      try {
        await deleteInvoice(invoice.id);
        toast.success("Invoice deleted");
        router.push("/invoices");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete invoice");
      }
    });
  }

  const isManual = isManualInvoice(invoice);
  const canEdit = invoice.status === "DRAFT";
  // An imported row (see importStripeInvoice) is a local mirror of an
  // invoice that already fully exists in Stripe — deletable at any status,
  // same reasoning as deleteInvoice's own guard.
  const canDelete = canEdit || !!invoice.importedAt;
  // A manual invoice never had (or ever will have) a Stripe invoice to
  // send — "Send"/"Resend" would otherwise silently create one for a
  // payment that either already happened outside Stripe, or was never
  // meant to route through Stripe at all.
  const canSend = !isManual && invoice.status !== "VOID";
  const canSendPdf = isManual && invoice.status !== "PAID" && invoice.status !== "VOID";
  // Voiding a manual invoice is fine right up until money's actually been
  // recorded against it — same rule as the Stripe-bound flow, just no
  // longer excluding manual invoices outright (an unpaid one can be
  // cancelled same as any other).
  const canVoid = invoice.status !== "PAID" && invoice.status !== "PARTIALLY_PAID" && invoice.status !== "VOID";
  // The counterpart to canVoid above, for exactly the statuses it excludes
  // (PAID/PARTIALLY_PAID) — only for a manual invoice, since a Stripe-paid
  // one needs an actual refund rather than a status flip. See
  // voidInvoiceWithPayments in src/lib/actions/invoices.ts: this preserves
  // the Payment/Receipt rows rather than deleting them.
  const canVoidWithPayments = isManual && (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID");
  const canMarkPaid = !isManual && invoice.status !== "PAID" && invoice.status !== "VOID";
  const canAddManualPayment = isManual && (invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID");
  const remaining = (invoice.total ?? 0) - (invoice.amountPaid ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend && (
        <Button onClick={handleSend} disabled={isSending}>
          <Send className="size-3.5" /> {invoice.status === "DRAFT" ? "Send" : "Resend"}
        </Button>
      )}
      {canAddManualPayment && <AddManualPaymentDialog invoiceId={invoice.id} remaining={remaining} />}
      {canSendPdf && (
        <div className="flex items-center gap-1.5">
          <SendInvoicePdfDialog invoiceId={invoice.id} alreadySent={!!invoice.lastSentAt} />
          {invoice.lastSentAt && (
            <span className="text-xs text-muted-foreground">Last sent {invoice.lastSentAt.toLocaleDateString()}</span>
          )}
        </div>
      )}
      {isManual && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
        >
          <Download className="size-3.5" /> Download PDF
        </Button>
      )}
      {invoice.hostedInvoiceUrl && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLink className="size-3.5" /> Hosted invoice page
        </Button>
      )}
      {invoice.invoicePdfUrl && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={invoice.invoicePdfUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <Download className="size-3.5" /> Download PDF
        </Button>
      )}
      {canMarkPaid && (
        <Button variant="outline" onClick={handleMarkPaid} disabled={isMarking}>
          <CheckCircle2 className="size-3.5" /> Mark Paid
        </Button>
      )}
      {canEdit && (
        <InvoiceFormDialog
          clients={clients}
          applications={applications}
          invoice={invoice}
          trigger={<Button variant="outline">Edit</Button>}
        />
      )}
      {canVoid && (
        <Button variant="outline" onClick={handleVoid} disabled={isVoiding}>
          <Ban className="size-3.5" /> Void
        </Button>
      )}
      {canVoidWithPayments && (
        <Button variant="outline" onClick={handleVoidWithPayments} disabled={isVoiding}>
          <Ban className="size-3.5" /> Void
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isDeleting}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
    </div>
  );
}
