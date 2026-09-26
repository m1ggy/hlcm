import { blockCaregiverRoute, isSuperuser, requireSession } from "@/lib/rbac";
import { listIntegrationsForAdmin } from "@/lib/actions/integrations";
import { IntegrationsManager } from "@/components/admin/integrations-manager";

export default async function IntegrationsPage() {
  await blockCaregiverRoute();
  const session = await requireSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect this workspace&apos;s own accounts. Keys and secrets are stored encrypted and never shown again after
          saving.
        </p>
      </div>
      {isSuperuser(session.user.role) ? (
        <IntegrationsManager integrations={await listIntegrationsForAdmin()} />
      ) : (
        <p className="text-sm text-muted-foreground">Only owners can manage integrations.</p>
      )}
    </div>
  );
}
