import Link from "next/link";
import { auth } from "@/auth";
import { listClients, archiveClient, restoreClient } from "@/lib/actions/clients";
import { ArchiveButton } from "@/components/shared/archive-button";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
              Each client belongs to a Project, so they&apos;re added from there rather than from this page — open
              the Project and add the client to it.
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Address</TableHead>
            {canArchive && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
                {showArchived && (
                  <Badge variant="outline" className="ml-2">
                    Archived
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Link href={`/projects/${client.projectId}`} className="hover:underline">
                  {client.project.name}
                </Link>
              </TableCell>
              <TableCell>{client.contactInfo ?? "—"}</TableCell>
              <TableCell>{client.address ?? "—"}</TableCell>
              {canArchive && (
                <TableCell className="text-right">
                  <ArchiveButton
                    id={client.id}
                    label={client.name}
                    archived={showArchived}
                    archiveAction={archiveClient}
                    restoreAction={restoreClient}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {clients.length === 0 && (
            <TableRow>
              <TableCell colSpan={canArchive ? 5 : 4} className="text-center text-muted-foreground">
                {showArchived ? "No archived clients." : "No clients yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
