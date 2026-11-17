import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/rbac";
import { listCareRecipients, listCaregivers } from "@/lib/actions/care-recipients";
import { getCareVisitAlerts } from "@/lib/actions/visits";
import { currentOrganization } from "@/lib/db";
import { workScope } from "@/lib/work";
import { listOpenTasksByCareRecipient } from "@/lib/work-data";
import { CareRecipientsCard } from "@/components/clients/care-recipients-card";
import { CareVisitsTodayCard } from "@/components/visits/care-visits-today-card";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Button } from "@/components/ui/button";

// The office side of a care agency's clients in its tasks-only workspace
// (docs/client-care-plan.md): the same card the full CRM shows on an agency's
// client page, with no agency to file them under and no billing. Our
// assigned staff and the company's own office people both work here.
export async function CareClientsOffice({ openId }: { openId?: string }) {
  const session = await auth();
  const org = await currentOrganization();
  const scope = workScope({ userId: session?.user?.id ?? "", role: session?.user?.role ?? "", isAssigned: Boolean(session?.user?.isAssigned), orgKind: org.kind });
  const [recipients, caregivers, alerts, tasksByRecipient] = await Promise.all([
    listCareRecipients(),
    listCaregivers(),
    getCareVisitAlerts(),
    listOpenTasksByCareRecipient(scope),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <PageInfoButton title="Clients">
            <p>
              The people your caregivers visit. Open someone to assign caregivers, set their weekly visit schedule, keep the
              checklist caregivers tick off at each visit, and see recent visits and concerns.
            </p>
          </PageInfoButton>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/caregivers" />}>
          Caregivers
        </Button>
      </div>
      {(alerts.scheduledToday > 0 || alerts.openIncidents.length > 0) && <CareVisitsTodayCard alerts={alerts} tasksWorkspace />}
      <CareRecipientsCard
        clientId={null}
        variant="workspace"
        recipients={recipients}
        caregivers={caregivers}
        profiles={[]}
        canManageInvoices={false}
        isAdmin={isAdmin(session?.user?.role)}
        openId={openId}
        tasksByRecipient={tasksByRecipient}
        canMakeTasks={scope.canEditTasks}
      />
    </div>
  );
}
