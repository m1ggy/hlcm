import Link from "next/link";
import { auth } from "@/auth";
import { getProject, archiveProject, restoreProject } from "@/lib/actions/projects";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
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
  const project = await getProject(id);
  const session = await auth();
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

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
        <NewClientDialog projectId={project.id} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {project.clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">
                <Link href={`/clients`} className="hover:underline">
                  {client.name}
                </Link>
              </TableCell>
              <TableCell>{client.contactInfo ?? "—"}</TableCell>
              <TableCell>{client.address ?? "—"}</TableCell>
            </TableRow>
          ))}
          {project.clients.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No clients in this project yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
