import { blockCaregiverRoute, isSuperuser, requireSession } from "@/lib/rbac";
import { getOrganizationSettings } from "@/lib/actions/organization";
import { currentOrganization } from "@/lib/db";
import { getAppUrl } from "@/lib/email";
import { PRODUCT_NAME } from "@/lib/branding";
import { listSupportActivity } from "@/lib/support-access";
import { OrganizationSettingsForm } from "@/components/admin/organization-settings-form";
import { SupportAccessSection } from "@/components/admin/support-access-section";

export default async function OrganizationPage() {
  await blockCaregiverRoute();
  const session = await requireSession();
  const isOwner = isSuperuser(session.user.role) && !session.user.isSupport;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Organization</h1>
      {isOwner ? (
        <>
          <OrganizationSettingsForm
            initial={await getOrganizationSettings().then(({ name, timezone, replyToEmail }) => ({ name, timezone, replyToEmail }))}
            workspaceUrl={await getAppUrl()}
          />
          <SupportAccessSection
            until={(await currentOrganization()).supportAccessUntil}
            productName={PRODUCT_NAME}
            activity={await listSupportActivity()}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners can change organization settings.</p>
      )}
    </div>
  );
}
