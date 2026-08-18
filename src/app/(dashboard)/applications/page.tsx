import Link from "next/link";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import { listApplications, listAssignableUsers, archiveApplication, restoreApplication } from "@/lib/actions/applications";
import { listClients } from "@/lib/actions/clients";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { listCaseTypes } from "@/lib/actions/case-types";
import { listPipelineStages } from "@/lib/actions/stage";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";
import { ApplicationsViewSwitcher } from "@/components/applications/applications-view-switcher";
import { ArchiveButton } from "@/components/shared/archive-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const canArchive = session.user.role === "ADMIN" || session.user.role === "MANAGER";

  const [
    applications,
    clients,
    assignableUsers,
    licenseTypes,
    caseTypes,
    homeCareStages,
    cilaStages,
    mcoStages,
    homeCareStagesFull,
    cilaStagesFull,
    mcoStagesFull,
  ] = await Promise.all([
    listApplications({ archived: showArchived }),
    listClients(),
    listAssignableUsers(),
    listLicenseTypes(),
    listCaseTypes(),
    listPipelineStages("HOME_CARE"),
    listPipelineStages("CILA_GROUP_HOME"),
    listPipelineStages("MCO"),
    listPipelineStages("HOME_CARE", { includeExit: true }),
    listPipelineStages("CILA_GROUP_HOME", { includeExit: true }),
    listPipelineStages("MCO", { includeExit: true }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{showArchived ? "Archived Applications" : "Applications"}</h1>
          <Link
            href={showArchived ? "/applications" : "/applications?archived=1"}
            className="text-sm text-muted-foreground hover:underline"
          >
            {showArchived ? "← Back to active applications" : "View archived applications"}
          </Link>
        </div>
        {!showArchived && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export/applications" />}>
              <Download className="size-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export/applications/pdf" />}>
              <Download className="size-3.5" /> Export PDF
            </Button>
            <NewApplicationDialog
              clients={clients}
              assignableUsers={assignableUsers}
              licenseTypes={licenseTypes}
              caseTypes={caseTypes}
              currentUserId={session.user.id}
            />
          </div>
        )}
      </div>
      {showArchived ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              {canArchive && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  <Link href={`/applications/${app.id}`} className="hover:underline">
                    {app.name}
                  </Link>
                </TableCell>
                <TableCell>{app.client.name}</TableCell>
                <TableCell className="text-muted-foreground">{app.status}</TableCell>
                {canArchive && (
                  <TableCell className="text-right">
                    <ArchiveButton
                      id={app.id}
                      label={app.name}
                      archived
                      archiveAction={archiveApplication}
                      restoreAction={restoreApplication}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {applications.length === 0 && (
              <TableRow>
                <TableCell colSpan={canArchive ? 4 : 3} className="text-center text-muted-foreground">
                  No archived applications.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <ApplicationsViewSwitcher
          applications={applications}
          assignableUsers={assignableUsers}
          currentUserId={session.user.id}
          pipelineStages={{ HOME_CARE: homeCareStages, CILA_GROUP_HOME: cilaStages, MCO: mcoStages }}
          pipelineStagesFull={{ HOME_CARE: homeCareStagesFull, CILA_GROUP_HOME: cilaStagesFull, MCO: mcoStagesFull }}
        />
      )}
    </div>
  );
}
