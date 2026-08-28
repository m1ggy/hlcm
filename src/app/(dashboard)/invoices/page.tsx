import { notFound } from "next/navigation";
import { listInvoices } from "@/lib/actions/invoices";
import { listClients } from "@/lib/actions/clients";
import { listApplications } from "@/lib/actions/applications";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ForbiddenError } from "@/lib/rbac";

export default async function InvoicesPage() {
  let invoices;
  try {
    invoices = await listInvoices();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const [clients, applications] = await Promise.all([
    listClients({ filter: "all" }),
    listApplications(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <PageInfoButton title="Invoices">
            <p>
              Bill a client and email them a PDF invoice with a &quot;Pay now&quot; link. Payment is confirmed
              automatically once the client pays online — no need to mark it by hand unless they paid another way.
            </p>
            <p>
              Billing without an online payment link? Use <strong>New Manual Invoice</strong> instead — no draft, no
              Send step. It creates the invoice awaiting payment; record what actually comes in (in full or
              partial) from the invoice&apos;s own page, whenever it arrives. A PDF is available to download or
              email the client any time, and a thank-you email with the invoice attached goes out automatically
              once it&apos;s paid in full.
            </p>
          </PageInfoButton>
        </div>
        <div className="flex items-center gap-2">
          <RecordPaymentDialog
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
          />
          <InvoiceFormDialog
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
          />
        </div>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <InvoicesTable invoices={invoices} />
      )}
    </div>
  );
}
