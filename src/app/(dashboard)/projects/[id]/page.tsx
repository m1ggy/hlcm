import Link from "next/link";
import { auth } from "@/auth";
import { getProject, archiveProject, restoreProject } from "@/lib/actions/projects";
import { listClients } from "@/lib/actions/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ImportClientDialog } from "@/components/clients/import-client-dialog";
import { RemoveFromProjectButton } from "@/components/clients/remove-from-project-button";
import { ArchiveButton } from "@/components/shared/archive-button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, allClients, session] = await Promise.all([getProject(id), listClients(), auth()]);
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const importableClients = allClients.map((client) => ({
    id: client.id,
    name: client.name,
    projectIds: client.projects.map((p) => p.id),
  }));

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/projects" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {project.name}
            {!project.active && (
              <Badge variant="outline" className="ml-2 align-middle">
                Archived
              </Badge>
            )}
          </h1>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
        </div>
        {canArchive && (
          <ArchiveButton
            id={project.id}
            label={project.name}
            archived={!project.active}
            archiveAction={archiveProject}
            restoreAction={restoreProject}
            variant="full"
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Clients</h2>
        <div className="flex items-center gap-2">
          <ImportClientDialog projectId={project.id} clients={importableClients} />
          <NewClientDialog projectId={project.id} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Address</TableHead>
            {canArchive && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {project.clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              </TableCell>
              <TableCell>{client.contactInfo ?? "—"}</TableCell>
              <TableCell>{client.address ?? "—"}</TableCell>
              {canArchive && (
                <TableCell className="text-right">
                  <RemoveFromProjectButton clientId={client.id} clientName={client.name} projectId={project.id} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {project.clients.length === 0 && (
            <TableRow>
              <TableCell colSpan={canArchive ? 4 : 3} className="text-center text-muted-foreground">
                No clients in this project yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
