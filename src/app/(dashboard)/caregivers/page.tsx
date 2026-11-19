import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { currentOrganization, db } from "@/lib/db";
import { hasCare, homePathForRole } from "@/lib/workspace-kind";
import { canManageCare } from "@/lib/care-access";
import { listCaregiverRoster } from "@/lib/actions/caregivers";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Button } from "@/components/ui/button";
import { AddCaregiverDialog, CaregiversRoster } from "./caregivers-roster";

// A care agency's caregivers (docs/client-care-plan.md): who they are, how
// they sign in, which clients they see and this week's hours. Adding one
// makes up their password here — no invite email.
export default async function CaregiversPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const session = await auth();
  const org = await currentOrganization();
  if (!hasCare(org) || !canManageCare(session?.user?.role)) redirect(homePathForRole(org, session?.user?.role));

  const tasksWorkspace = org.kind === "TASKS";
  const [roster, clients, { open }] = await Promise.all([
    listCaregiverRoster(),
    tasksWorkspace ? db.careRecipient.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Caregivers</h1>
          <PageInfoButton title="Caregivers">
            <p>
              Everyone who visits your clients. Add a caregiver and you&apos;ll get a password to pass on — they sign in with their
              email, or their phone number if they don&apos;t have one. Assign them to clients and set their visit times on the{" "}
              {tasksWorkspace ? (
                <Link href="/care-recipients" className="font-medium text-primary hover:underline">
                  Clients
                </Link>
              ) : (
                "client"
              )}{" "}
              page.
            </p>
          </PageInfoButton>
        </div>
        <div className="flex items-center gap-2">
          {tasksWorkspace && (
            <Button variant="outline" nativeButton={false} render={<Link href="/care-recipients" />}>
              Clients
            </Button>
          )}
          <AddCaregiverDialog />
        </div>
      </div>
      <CaregiversRoster roster={roster} tasksWorkspace={tasksWorkspace} clients={clients} openId={open} />
    </div>
  );
}
