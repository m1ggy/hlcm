import { notFound } from "next/navigation";
import { getInvoiceSettingsForAdmin } from "@/lib/actions/invoice-settings";
import { InvoiceSettingsForm } from "@/components/admin/invoice-settings-form";
import { ForbiddenError } from "@/lib/rbac";

export default async function InvoiceSettingsPage() {
  let settings;
  try {
    settings = await getInvoiceSettingsForAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Settings</h1>
        <p className="text-sm text-muted-foreground">
          Applies to manually-recorded invoices only — the PDF, and the emails they go out in. Stripe-bound
          invoices are emailed by Stripe itself, with their own branding settings.
        </p>
      </div>
      <InvoiceSettingsForm
        hasLogo={Boolean(settings.logoStorageKey)}
        ccEmails={settings.ccEmails ?? ""}
        footerText={settings.footerText ?? ""}
      />
    </div>
  );
}
