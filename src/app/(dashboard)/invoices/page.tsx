import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listInvoices } from "@/lib/actions/invoices";
import { listClients } from "@/lib/actions/clients";
import { listApplications } from "@/lib/actions/applications";
import { listCareRecipients, listCaregivers } from "@/lib/actions/care-recipients";
import { listInvoiceProfiles } from "@/lib/invoice-profiles";
import { outstandingBalance } from "@/lib/invoice-format";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { NewInvoiceMenu } from "@/components/invoices/new-invoice-menu";
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

  const [clients, applications, profiles, recipients, caregivers] = await Promise.all([
    listClients({ filter: "all" }),
    listApplications(),
    listInvoiceProfiles(),
    listCareRecipients(),
    listCaregivers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <PageInfoButton title="Invoices">
            <p>
              <strong>New invoice</strong> covers all three ways to bill:
            </p>
            <p>
              <strong>Online (Stripe)</strong> emails a PDF invoice with a &quot;Pay now&quot; link — payment is
              confirmed automatically once the client pays online, no need to mark it by hand unless they paid
              another way.
            </p>
            <p>
              <strong>Manual</strong> is for billing without an online payment link — no draft, no Send step. It
              creates the invoice awaiting payment; record what actually comes in (in full or partial) from the
              invoice&apos;s own page, whenever it arrives. A PDF is available to download or email the client any
              time. Recording a payment generates a receipt automatically and saves it here — emailing it to the
              client is a separate, deliberate step from the invoice&apos;s own page.
            </p>
            <p>
              <strong>Care Recipient</strong> bills a specific recipient rather than the licensing agency directly —
              priced from their logged visits or a day-rate range instead of a plain description/quantity line, and
              addressed to their own billing contact on the PDF.
            </p>
            <p>
              Someone created an invoice straight in the Stripe Dashboard? Use <strong>Import from Stripe</strong> to
              pull it in — payment/void updates from Stripe are silently ignored for any invoice that doesn&apos;t
              have a matching record here yet.
            </p>
          </PageInfoButton>
        </div>
        <div className="flex items-center gap-2">
          <NewInvoiceMenu
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            applications={applications.map((a) => ({ id: a.id, name: a.name, clientId: a.client.id }))}
            profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
            recipients={recipients
              // A recipient not tied to any licensing Client can't be
              // billed at all — createCareRecipientInvoice always bills
              // through the recipient's own Client (see its comment in
              // src/lib/actions/care-recipient-invoices.ts).
              .filter((r) => r.client)
              .map((r) => ({
                id: r.id,
                name: r.name,
                clientId: r.client!.id,
                clientName: r.client!.name,
                hourlyRate: r.hourlyRate,
                dailyRate: r.dailyRate,
                // Lets the recipient picker show who actually needs billing
                // instead of a bare name list — see NewCareRecipientInvoiceDialog.
                outstandingBalance: r.invoices.reduce((sum, inv) => sum + outstandingBalance(inv), 0),
              }))}
            caregivers={caregivers}
            isAdmin={isAdmin(session?.user?.role)}
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
