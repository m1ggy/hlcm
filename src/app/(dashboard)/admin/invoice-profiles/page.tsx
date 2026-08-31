import { notFound } from "next/navigation";
import { listInvoiceProfilesForAdmin } from "@/lib/actions/invoice-profiles";
import { InvoiceProfilesManager } from "@/components/admin/invoice-profiles-manager";
import { ForbiddenError } from "@/lib/rbac";

export default async function InvoiceProfilesPage() {
  let profiles;
  try {
    profiles = await listInvoiceProfilesForAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Billing identities for manually-recorded invoices — logo, CC recipients, and footer text. Picked per
          invoice in the New Manual Invoice dialog. Stripe-bound invoices are emailed by Stripe itself, with their
          own branding settings.
        </p>
      </div>
      <InvoiceProfilesManager
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          isDefault: p.isDefault,
          hasLogo: Boolean(p.logoStorageKey),
          ccEmails: p.ccEmails ?? "",
          footerText: p.footerText ?? "",
        }))}
      />
    </div>
  );
}
