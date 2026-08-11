import Link from "next/link";
import { auth } from "@/auth";
import { listProjects, archiveProject, restoreProject } from "@/lib/actions/projects";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const session = await auth();
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const projects = await listProjects({ archived: showArchived });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{showArchived ? "Archived Projects" : "Projects"}</h1>
          <Link href={showArchived ? "/projects" : "/projects?archived=1"} className="text-sm text-muted-foreground hover:underline">
            {showArchived ? "← Back to active projects" : "View archived projects"}
          </Link>
        </div>
        {!showArchived && <NewProjectDialog />}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Clients</TableHead>
            {canArchive && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="font-medium">
                <Link href={`/projects/${project.id}`} className="hover:underline">
                  {project.name}
                </Link>
                {showArchived && (
                  <Badge variant="outline" className="ml-2">
                    Archived
                  </Badge>
                )}
              </TableCell>
              <TableCell>{project.description ?? "—"}</TableCell>
              <TableCell>{project._count.clients}</TableCell>
              {canArchive && (
                <TableCell className="text-right">
                  <ArchiveButton
                    id={project.id}
                    label={project.name}
                    archived={showArchived}
                    archiveAction={archiveProject}
                    restoreAction={restoreProject}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={canArchive ? 4 : 3} className="text-center text-muted-foreground">
                {showArchived ? "No archived projects." : "No projects yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
