import Link from "next/link";
import { auth } from "@/auth";
import { listClients, archiveClient, restoreClient } from "@/lib/actions/clients";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ClientsTable } from "@/components/clients/clients-table";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const session = await auth();
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const clients = await listClients({ filter: showArchived ? "archived" : "active" });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">{showArchived ? "Archived Clients" : "Clients"}</h1>
          <PageInfoButton title="Clients">
            <p>
              A client is the facility or business you&apos;re helping get licensed — its contact info, business
              details, and every case you&apos;ve filed for them.
            </p>
            <p>
              A client is added from inside a Project, and can belong to more than one — if the same client comes
              back for another project, import it there instead of re-entering it.
            </p>
          </PageInfoButton>
        </div>
        <Link
          href={showArchived ? "/clients" : "/clients?archived=1"}
          className="text-sm text-muted-foreground hover:underline"
        >
          {showArchived ? "← Back to active clients" : "View archived clients"}
        </Link>
      </div>
      <ClientsTable
        clients={clients}
        canArchive={canArchive}
        showArchived={showArchived}
        archiveAction={archiveClient}
        restoreAction={restoreClient}
      />
    </div>
  );
}
