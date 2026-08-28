"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, CheckCircle2, Ban, Download, ExternalLink, Trash2 } from "lucide-react";
import { sendInvoice, markInvoicePaid, voidInvoice, deleteInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { InvoiceFormDialog } from "./invoice-form-dialog";
import { AddManualPaymentDialog } from "./add-manual-payment-dialog";
import { isManualPayment } from "./invoice-status-badge";

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

  const isManual = isManualPayment(invoice);
  const canEdit = invoice.status === "DRAFT";
  // A manual record never had (or ever will have) a Stripe invoice to send —
  // "Send"/"Resend" would otherwise silently create one for money already
  // collected outside Stripe.
  const canSend = !isManual && invoice.status !== "VOID";
  const canVoid = !isManual && invoice.status !== "PAID" && invoice.status !== "VOID";
  const canMarkPaid = !isManual && invoice.status !== "PAID" && invoice.status !== "VOID";
  const canAddManualPayment = isManual && invoice.status === "PARTIALLY_PAID";
  const remaining = (invoice.total ?? 0) - (invoice.amountPaid ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend && (
        <Button onClick={handleSend} disabled={isSending}>
          <Send className="size-3.5" /> {invoice.status === "DRAFT" ? "Send" : "Resend"}
        </Button>
      )}
      {canAddManualPayment && <AddManualPaymentDialog invoiceId={invoice.id} remaining={remaining} />}
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
      {canEdit && (
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isDeleting}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
    </div>
  );
}
