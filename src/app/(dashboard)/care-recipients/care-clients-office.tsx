import Link from "next/link";
import { auth } from "@/auth";
import { listCareRecipients, listCaregivers } from "@/lib/actions/care-recipients";
import { getCareVisitAlerts } from "@/lib/actions/visits";
import { currentOrganization, currentWorkspaceTimezone } from "@/lib/db";
import { zonedClock } from "@/lib/visits";
import { workScope } from "@/lib/work";
import { listOpenTasksByCareRecipient } from "@/lib/work-data";
import { CareClientsWorkspace } from "@/components/clients/care-clients-workspace";
import { NewCareRecipientDialog } from "@/components/clients/care-recipients-card";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Button } from "@/components/ui/button";

// The office side of a care agency's clients in its tasks-only workspace
// (docs/client-care-plan.md): a client list beside the chosen client's page
// (CareClientsWorkspace), with no agency to file them under and no billing. Our
// assigned staff and the company's own office people both work here.
export async function CareClientsOffice({ openId }: { openId?: string }) {
  const session = await auth();
  const org = await currentOrganization();
  const scope = workScope({ userId: session?.user?.id ?? "", role: session?.user?.role ?? "", isAssigned: Boolean(session?.user?.isAssigned), orgKind: org.kind });
  const [recipients, caregivers, alerts, tasksByRecipient, timeZone] = await Promise.all([
    listCareRecipients(),
    listCaregivers(),
    getCareVisitAlerts(),
    listOpenTasksByCareRecipient(scope),
    currentWorkspaceTimezone(),
  ]);
  const now = zonedClock(new Date(), timeZone);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/caregivers" />}>
            Caregivers
          </Button>
          {recipients.length > 0 && <NewCareRecipientDialog clientId={null} variant="workspace" primary />}
        </div>
      </div>
      <CareClientsWorkspace
        recipients={recipients}
        caregivers={caregivers}
        openId={openId}
        now={{ weekday: now.weekday, minute: now.minute }}
        tasksByRecipient={tasksByRecipient}
        canMakeTasks={scope.canEditTasks}
        today={{ scheduledToday: alerts.scheduledToday, problems: alerts.problems }}
      />
    </div>
  );
}
