import Link from "next/link";
import { auth } from "@/auth";
import { listClients, archiveClient, restoreClient } from "@/lib/actions/clients";
import { listProjects } from "@/lib/actions/projects";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ClientsTable } from "@/components/clients/clients-table";
import { NewClientDialog } from "@/components/clients/new-client-dialog";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const session = await auth();
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const [clients, projects] = await Promise.all([
    listClients({ filter: showArchived ? "archived" : "active" }),
    listProjects(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-semibold">{showArchived ? "Archived Clients" : "Clients"}</h1>
            <PageInfoButton title="Clients">
              <p>
                A client is the facility or business you&apos;re helping get licensed — its contact info, business
                details, and every case you&apos;ve filed for them.
              </p>
              <p>
                Every client belongs to at least one Project — pick which one when you create it. A client can
                belong to more than one; if the same client comes back for another project, import it there
                instead of re-entering it.
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
        {!showArchived && <NewClientDialog projects={projects.map((p) => ({ id: p.id, name: p.name }))} />}
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
