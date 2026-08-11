import Link from "next/link";
import { auth } from "@/auth";
import { listClients, archiveClient, restoreClient } from "@/lib/actions/clients";
import { ArchiveButton } from "@/components/shared/archive-button";
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
        <h1 className="text-2xl font-semibold">{showArchived ? "Archived Clients" : "Clients"}</h1>
        <p className="text-muted-foreground">
          {showArchived ? (
            <Link href="/clients" className="underline">
              ← Back to active clients
            </Link>
          ) : (
            <>
              Clients are added from within a{" "}
              <Link href="/projects" className="underline">
                Project
              </Link>
              . <Link href="/clients?archived=1" className="underline">View archived clients</Link>
            </>
          )}
        </p>
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
