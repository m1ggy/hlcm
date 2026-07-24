import { Download } from "lucide-react";
import { auth } from "@/auth";
import { listApplications, listAssignableUsers } from "@/lib/actions/applications";
import { listClients } from "@/lib/actions/clients";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { listCaseTypes } from "@/lib/actions/case-types";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";
import { ApplicationsViewSwitcher } from "@/components/applications/applications-view-switcher";
import { Button } from "@/components/ui/button";

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
      </div>
      <ApplicationsViewSwitcher
        applications={applications}
        assignableUsers={assignableUsers}
        currentUserId={session.user.id}
      />
    </div>
  );
}
