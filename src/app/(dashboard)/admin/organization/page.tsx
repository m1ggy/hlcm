import { blockCaregiverRoute, isSuperuser, requireSession } from "@/lib/rbac";
import { getOrganizationSettings } from "@/lib/actions/organization";
import { getAppUrl } from "@/lib/email";
import { OrganizationSettingsForm } from "@/components/admin/organization-settings-form";

export default async function OrganizationPage() {
  await blockCaregiverRoute();
  const session = await requireSession();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Organization</h1>
      {isSuperuser(session.user.role) ? (
        <OrganizationSettingsForm
          initial={await getOrganizationSettings().then(({ name, timezone }) => ({ name, timezone }))}
          workspaceUrl={await getAppUrl()}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Only owners can change organization settings.</p>
      )}
    </div>
  );
}
