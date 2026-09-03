import { notFound } from "next/navigation";
import Link from "next/link";
import { TriangleAlert, PenLine, Download } from "lucide-react";
import { getInvoice, getInvoiceAuditLog } from "@/lib/actions/invoices";
import { displayInvoiceNumber, displayReceiptNumber } from "@/lib/invoice-format";
import { listClients } from "@/lib/actions/clients";
import { listApplications } from "@/lib/actions/applications";
import { InvoiceStatusBadge, isInvoiceOverdue, isManualInvoice } from "@/components/invoices/invoice-status-badge";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { ManualInvoiceEditor } from "@/components/invoices/manual-invoice-editor";
import { SendReceiptDialog } from "@/components/invoices/send-receipt-dialog";
import { PaymentRowActions } from "@/components/invoices/payment-row-actions";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ForbiddenError } from "@/lib/rbac";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let invoice;
  try {
    invoice = await getInvoice(id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const [auditLog, clients, applications] = await Promise.all([
    getInvoiceAuditLog(id),
    listClients({ filter: "all" }),
    listApplications(),
  ]);

  const number = displayInvoiceNumber(invoice);
  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  // Line items, notes, and dates stay editable inline right on this page
  // through SENT and PARTIALLY_PAID — including after the client's
  // already been emailed a copy — and lock once PAID or VOID. See
  // updateManualInvoiceDraft in src/lib/actions/invoices.ts.
  const canEditManual = isManualInvoice(invoice) && (invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID");
  // Once VOID (whether from the plain Void or voidInvoiceWithPayments —
  // see invoice-actions.tsx), a payment is history, not something left to
  // correct — updatePayment/deletePayment both refuse it server-side too.
  const canEditPayments = invoice.status !== "VOID";

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/invoices" />}>Invoices</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{number}</h1>
          <InvoiceStatusBadge status={isInvoiceOverdue(invoice) ? "OVERDUE" : invoice.status} />
          {isManualInvoice(invoice) && (
            <span className="text-xs text-muted-foreground" title="Recorded manually — not billed through an online payment link">
              Recorded manually{invoice.invoiceProfile ? ` — billed as ${invoice.invoiceProfile.name}` : ""}
            </span>
          )}
          {invoice.importedAt && (
            <span className="text-xs text-muted-foreground" title="Created directly in Stripe, then imported into this app">
              Imported from Stripe — {invoice.importedAt.toLocaleDateString()}
            </span>
          )}
        </div>
        <InvoiceActions
          invoice={invoice}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
          paymentsCount={invoice.payments.length}
        />
      </div>

      {invoice.editedAfterSendAt && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-400">
          <PenLine className="size-4 shrink-0" />
          <span>
            Edited after sending — {invoice.editedAfterSendAt.toLocaleString()}. The client&apos;s last copy may not
            match; use &quot;Send invoice PDF&quot; to send them the current version.
          </span>
        </div>
      )}

      {!invoice.client.businessEmail && !invoice.client.ownerEmail && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            This client has no email on file — sending this invoice will fail.{" "}
            <Link href={`/clients/${invoice.client.id}`} className="underline">
              Add one on the client&apos;s page
            </Link>
            .
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent>
              {canEditManual ? (
                <ManualInvoiceEditor
                  invoiceId={invoice.id}
                  notes={invoice.notes}
                  issueDate={invoice.issueDate}
                  dueDate={invoice.dueDate}
                  lineItems={invoice.lineItems}
                />
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-normal">Description</th>
                        <th className="pb-2 font-normal">Quantity</th>
                        <th className="pb-2 text-right font-normal">Unit Price</th>
                        <th className="pb-2 text-right font-normal">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((li) => (
                        <tr key={li.id} className="border-b last:border-0">
                          <td className="py-2">{li.description}</td>
                          <td className="py-2">{li.quantity}</td>
                          <td className="py-2 text-right tabular-nums">${li.unitPrice.toFixed(2)}</td>
                          <td className="py-2 text-right tabular-nums">${(li.quantity * li.unitPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                    <div className="flex w-48 justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                    </div>
                    {invoice.taxAmount != null && (
                      <div className="flex w-48 justify-between text-muted-foreground">
                        <span>Tax</span>
                        <span className="tabular-nums">${invoice.taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex w-48 justify-between font-medium">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {invoice.total != null ? `$${invoice.total.toFixed(2)}` : `~$${subtotal.toFixed(2)} (tax not yet calculated)`}
                      </span>
                    </div>
                  </div>
                  {invoice.notes && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Notes: </span>
                      {invoice.notes}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {isManualInvoice(invoice) && invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-normal">Date</th>
                      <th className="pb-2 font-normal">Method</th>
                      <th className="pb-2 text-right font-normal">Amount</th>
                      <th className="pb-2 text-right font-normal">Receipt</th>
                      {canEditPayments && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0">
                        <td className="py-2">{payment.paidAt.toLocaleDateString()}</td>
                        <td className="py-2 text-muted-foreground">{payment.paymentMethod}</td>
                        <td className="py-2 text-right tabular-nums">${payment.amount.toFixed(2)}</td>
                        <td className="py-2">
                          {payment.receipt && !payment.receipt.storageKey ? (
                            <span className="text-xs text-destructive" title="The receipt PDF failed to generate — record the payment again">
                              Receipt failed
                            </span>
                          ) : payment.receipt ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  nativeButton={false}
                                  render={<a href={`/api/receipts/${payment.receipt.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
                                >
                                  <Download className="size-3" /> {displayReceiptNumber(payment.receipt)}
                                </Button>
                                <SendReceiptDialog receiptId={payment.receipt.id} alreadySent={!!payment.receipt.sentAt} />
                              </div>
                              {payment.receipt.sentAt && (
                                <span className="text-xs text-muted-foreground">
                                  Sent to {payment.receipt.sentTo} on {payment.receipt.sentAt.toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No receipt</span>
                          )}
                        </td>
                        {canEditPayments && (
                          <td className="py-2 text-right">
                            <PaymentRowActions
                              paymentId={payment.id}
                              amount={payment.amount}
                              paidAt={payment.paidAt}
                              paymentMethod={payment.paymentMethod}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditLogPanel auditLog={auditLog} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <Link href={`/clients/${invoice.client.id}`} className="hover:underline">
                  {invoice.client.businessName ?? invoice.client.name}
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issued</span>
                <span>{invoice.issueDate.toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span>{invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "—"}</span>
              </div>
              {invoice.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span>{invoice.sentAt.toLocaleDateString()}</span>
                </div>
              )}
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{invoice.status === "PARTIALLY_PAID" ? "Last payment" : "Paid"}</span>
                  <span>{invoice.paidAt.toLocaleDateString()}</span>
                </div>
              )}
              {invoice.paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment method</span>
                  <span>{invoice.paymentMethod}</span>
                </div>
              )}
              {isManualInvoice(invoice) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount received</span>
                  <span>
                    ${(invoice.amountPaid ?? 0).toFixed(2)}
                    {invoice.status !== "PAID" && ` of $${(invoice.total ?? 0).toFixed(2)}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by</span>
                <span>{invoice.createdBy.name}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
