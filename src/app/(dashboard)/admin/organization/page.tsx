import { blockCaregiverRoute, isSuperuser, requireSession } from "@/lib/rbac";
import { getOrganizationSettings } from "@/lib/actions/organization";
import { getAppUrl } from "@/lib/email";
import { PRODUCT_NAME } from "@/lib/branding";
import { listSupportActivity } from "@/lib/support-access";
import { OrganizationSettingsForm } from "@/components/admin/organization-settings-form";
import { PlatformAccessSection } from "@/components/admin/platform-access-section";

export default async function OrganizationPage() {
  await blockCaregiverRoute();
  const session = await requireSession();
  // Platform admins enter as an OWNER, so they can change these too.
  const isOwner = isSuperuser(session.user.role);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Organization</h1>
      {isOwner ? (
        <>
          <OrganizationSettingsForm
            initial={await getOrganizationSettings().then(({ name, timezone, replyToEmail }) => ({ name, timezone, replyToEmail }))}
            workspaceUrl={await getAppUrl()}
          />
          <PlatformAccessSection productName={PRODUCT_NAME} activity={await listSupportActivity()} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners can change organization settings.</p>
      )}
    </div>
  );
}
