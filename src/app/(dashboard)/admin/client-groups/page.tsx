import { listClientGroups } from "@/lib/actions/client-groups";
import { ClientGroupsManager } from "@/components/admin/client-groups-manager";
import { PageInfoButton } from "@/components/shared/page-info-button";

export default async function ClientGroupsPage() {
  const groups = await listClientGroups();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Client Groups</h1>
        <PageInfoButton title="Client Groups">
          <p>
            Bundle a few separate Client records together — e.g. several locations of the same holding
            company — so they show as one section instead of several on the Invoices page&apos;s &quot;By
            client&quot; view. Assign a client to a group from the client&apos;s own page.
          </p>
        </PageInfoButton>
      </div>
      <ClientGroupsManager
        groups={groups.map((g) => ({ id: g.id, name: g.name, clientCount: g._count.clients }))}
      />
    </div>
  );
}
