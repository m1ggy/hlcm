import Link from "next/link";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import { listApplications, listAssignableUsers } from "@/lib/actions/applications";
import { listClients } from "@/lib/actions/clients";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { listCaseTypes } from "@/lib/actions/case-types";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ApplicationsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [applications, clients, assignableUsers, licenseTypes, caseTypes] = await Promise.all([
    listApplications(),
    listClients(),
    listAssignableUsers(),
    listLicenseTypes(),
    listCaseTypes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/export/applications" />}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          <NewApplicationDialog
            clients={clients}
            assignableUsers={assignableUsers}
            licenseTypes={licenseTypes}
            caseTypes={caseTypes}
            currentUserId={session.user.id}
          />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id} className="relative cursor-pointer">
              <TableCell className="font-medium">
                <Link href={`/applications/${app.id}`} className="after:absolute after:inset-0 hover:underline">
                  {app.name}
                </Link>
              </TableCell>
              <TableCell>{app.client.name}</TableCell>
              <TableCell>{app.assignedUser.name}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                  {STATUS_LABELS[app.status as ApplicationStatus]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {applications.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No applications yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
