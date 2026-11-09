import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isAdmin, isManagement, canAccessInvoices } from "@/lib/rbac";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { caregiverHasClients } from "@/lib/actions/visits";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import { listSwitchTargets } from "@/lib/workspace-switch";
import { db } from "@/lib/db";
import { canManageAnyWorkspace } from "@/lib/workspace-assignments";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";

export async function AppSidebar() {
  const session = await auth();
  if (!session?.user) return null;
  const org = await getHostOrg();
  const isCaregiver = session.user.role === "CAREGIVER";
  const showCaregiverClients = isCaregiver ? await caregiverHasClients() : true;
  const actor = { id: session.user.id, organizationId: session.user.organizationId };
  const seesForms = !isCaregiver && org?.kind !== "TASKS" && ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "DEVELOPER"].includes(session.user.role);
  const [switchTargets, managesWorkspaces, newSubmissions] = await Promise.all([
    listSwitchTargets(actor),
    canManageAnyWorkspace({ userId: actor.id, orgId: actor.organizationId, role: session.user.role }),
    seesForms ? db.formSubmission.count({ where: { status: "PENDING" } }).catch(() => 0) : Promise.resolve(0),
  ]);

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <WorkspaceSwitcher currentName={org?.name ?? PRODUCT_NAME} targets={switchTargets} />
      </SidebarHeader>
      <SidebarContent className="px-2">
        <AppSidebarNav
          isAdmin={isAdmin(session.user.role)}
          canManageInvoices={canAccessInvoices(session.user.role)}
          canViewPayroll={isManagement(session.user.role)}
          isCaregiver={isCaregiver}
          showCaregiverClients={showCaregiverClients}
          showClientWorkspaces={managesWorkspaces}
          isTasksWorkspace={org?.kind === "TASKS"}
          isWorkTeam={Boolean(session.user.isAssigned) || session.user.role === "DEVELOPER"}
          showClientWork={switchTargets.some((t) => t.home && t.current)}
          newSubmissions={newSubmissions}
        />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link href="/account" className="block truncate text-sm hover:underline">
              {session.user.email}
            </Link>
            <p className="text-xs text-muted-foreground">{session.user.role}</p>
          </div>
          <ThemeToggle />
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
