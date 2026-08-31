"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, CheckCircle2, Ban, Download, ExternalLink, Trash2, Mail } from "lucide-react";
import { sendInvoice, sendManualInvoicePdf, markInvoicePaid, voidInvoice, deleteInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { InvoiceFormDialog } from "./invoice-form-dialog";
import { AddManualPaymentDialog } from "./add-manual-payment-dialog";
import { EditManualInvoiceDialog } from "./edit-manual-invoice-dialog";
import { isManualInvoice } from "./invoice-status-badge";

type LineItem = { description: string; quantity: number; unitPrice: number };

export function InvoiceActions({
  invoice,
  clients,
  applications,
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
  };
  clients: { id: string; name: string }[];
  applications: { id: string; name: string; clientId: string }[];
}) {
  const router = useRouter();
  const [isSending, startSending] = useTransition();
  const [isSendingPdf, startSendingPdf] = useTransition();
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

  function handleSendPdf() {
    const verb = invoice.lastSentAt ? "Resend" : "Send";
    if (!confirm(`${verb} the invoice PDF by email now?`)) return;
    startSendingPdf(async () => {
      try {
        await sendManualInvoicePdf(invoice.id);
        toast.success("Invoice PDF sent");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send invoice PDF");
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
  const canMarkPaid = !isManual && invoice.status !== "PAID" && invoice.status !== "VOID";
  const canAddManualPayment = isManual && (invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID");
  // Line items + notes stay editable until the client's actually seen it
  // (lastSentAt set) or any money's been recorded — see
  // updateManualInvoiceDraft in src/lib/actions/invoices.ts.
  const canEditManual = isManual && invoice.status === "SENT" && !invoice.lastSentAt;
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
          <Button variant="outline" onClick={handleSendPdf} disabled={isSendingPdf}>
            <Mail className="size-3.5" /> {invoice.lastSentAt ? "Resend invoice PDF" : "Send invoice PDF"}
          </Button>
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
      {canEditManual && (
        <EditManualInvoiceDialog invoiceId={invoice.id} notes={invoice.notes} lineItems={invoice.lineItems} />
      )}
      {canVoid && (
        <Button variant="outline" onClick={handleVoid} disabled={isVoiding}>
          <Ban className="size-3.5" /> Void
        </Button>
      )}
      {canEdit && (
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isDeleting}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
    </div>
  );
}
