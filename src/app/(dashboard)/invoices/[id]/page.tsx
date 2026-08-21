import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoice, getInvoiceAuditLog, displayInvoiceNumber } from "@/lib/actions/invoices";
import { listClients } from "@/lib/actions/clients";
import { listApplications } from "@/lib/actions/applications";
import { InvoiceStatusBadge, isInvoiceOverdue } from "@/components/invoices/invoice-status-badge";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        </div>
        <InvoiceActions
          invoice={invoice}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-normal">Description</th>
                    <th className="pb-2 font-normal">Qty</th>
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
            </CardContent>
          </Card>

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
              {invoice.application && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Case</span>
                  <Link href={`/applications/${invoice.application.id}`} className="hover:underline">
                    {invoice.application.name}
                  </Link>
                </div>
              )}
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
                  <span className="text-muted-foreground">Paid</span>
                  <span>{invoice.paidAt.toLocaleDateString()}</span>
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
