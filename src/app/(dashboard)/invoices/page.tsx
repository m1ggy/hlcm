import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listInvoices } from "@/lib/actions/invoices";
import { listClients } from "@/lib/actions/clients";
import { listApplications } from "@/lib/actions/applications";
import { listCareRecipients, listCaregivers } from "@/lib/actions/care-recipients";
import { listInvoiceProfiles } from "@/lib/invoice-profiles";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { ImportStripeInvoiceDialog } from "@/components/invoices/import-stripe-invoice-dialog";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ForbiddenError, blockCaregiverRoute, isAdmin } from "@/lib/rbac";

export default async function InvoicesPage() {
  await blockCaregiverRoute();
  const session = await auth();
  let invoices;
  try {
    invoices = await listInvoices();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const [clients, applications, careRecipients, caregivers, profiles] = await Promise.all([
    listClients({ filter: "all" }),
    listApplications(),
    listCareRecipients({ filter: "active" }),
    listCaregivers(),
    listInvoiceProfiles(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
              email the client any time. Recording a payment generates a receipt automatically and saves it here —
              emailing it to the client is a separate, deliberate step from the invoice&apos;s own page.
            </p>
            <p>
              Someone created an invoice straight in the Stripe Dashboard? Use <strong>Import from Stripe</strong> to
              pull it in — payment/void updates from Stripe are silently ignored for any invoice that doesn&apos;t
              have a matching record here yet.
            </p>
          </PageInfoButton>
        </div>
        <div className="flex items-center gap-2">
          <RecordPaymentDialog
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
            // A recipient not yet attached to a Client can't be billed —
            // Invoice.clientId is a hard requirement (see CareRecipient's
            // comment in prisma/schema.prisma) and there's nothing to bill
            // it under.
            careRecipients={careRecipients
              .filter((r) => r.client != null)
              .map((r) => ({
                id: r.id,
                name: r.name,
                clientId: r.client!.id,
                clientName: r.client!.name,
                hourlyRate: r.hourlyRate,
              }))}
            caregivers={caregivers}
            profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
            isAdmin={isAdmin(session?.user?.role)}
          />
          <InvoiceFormDialog
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
          />
          <ImportStripeInvoiceDialog
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
