"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutList, KanbanSquare, CalendarDays, Building2, FolderKanban, Users, ClipboardList, UserCog, CheckSquare, Clock, Timer, Receipt, Settings, Inbox, MapPin, CalendarCheck, BarChart3, Sun, Wallet, NotebookPen } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavLink = { href: string; label: string; icon: LucideIcon; tour: string };
type NavGroup = { label?: string; links: NavLink[] };

// The main workspace's menu, in sections so licensing work, the general
// projects-and-tasks tool and workspace settings don't run together.
const LICENSING: NavLink[] = [
  { href: "/projects", label: "Projects", icon: FolderKanban, tour: "nav-projects" },
  { href: "/applications", label: "Applications", icon: ClipboardList, tour: "nav-applications" },
  { href: "/clients", label: "Clients", icon: Users, tour: "nav-clients" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, tour: "nav-tasks" },
  { href: "/leads", label: "Leads", icon: CalendarCheck, tour: "nav-leads" },
];

// Not tied to licensing: forms serve intake, reports, applications and more
// (docs/forms-plan.md).
const GENERAL: NavLink[] = [{ href: "/intake", label: "Forms", icon: Inbox, tour: "nav-form-submissions" }];

// Caregiver-restricted set — no Projects/Applications/Time/Invoices/Admin,
// same scope the role is limited to everywhere else (see src/lib/rbac.ts,
// src/lib/actions/clients.ts, src/lib/actions/care-recipients.ts). Today
// first: it's their home screen. Clients only when they actually have any
// (it's derived from licensing tasks most hands-on caregivers never get).
const CAREGIVER_LINKS: NavLink[] = [
  { href: "/today", label: "Today", icon: Sun, tour: "nav-today" },
  { href: "/care-recipients", label: "My Recipients", icon: MapPin, tour: "nav-recipients" },
  { href: "/hours", label: "My Hours", icon: Clock, tour: "nav-hours" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, tour: "nav-tasks" },
  { href: "/clients", label: "Clients", icon: Users, tour: "nav-clients" },
  { href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" },
];

export function AppSidebarNav({
  isAdmin,
  canManageInvoices,
  canViewPayroll = false,
  isCaregiver,
  showCaregiverClients = true,
  showClientWorkspaces = false,
  isTasksWorkspace = false,
  isWorkTeam = false,
  showClientWork = false,
  newSubmissions = 0,
}: {
  isAdmin: boolean;
  canManageInvoices: boolean;
  canViewPayroll?: boolean;
  isCaregiver: boolean;
  showCaregiverClients?: boolean;
  /** A managing company's admins and account managers (src/lib/workspace-assignments.ts). */
  showClientWorkspaces?: boolean;
  /** A client company's tasks-only workspace: no licensing pages. */
  isTasksWorkspace?: boolean;
  /** On the team side of a tasks-only workspace (a managing company's assigned staff). */
  isWorkTeam?: boolean;
  /** Assigned to client workspaces: "Client work", my tasks in all of them (workspace tasks Phase 5). */
  showClientWork?: boolean;
  /** New form submissions waiting, shown on the Forms link. */
  newSubmissions?: number;
}) {
  const pathname = usePathname();

  let groups: NavGroup[];
  if (isTasksWorkspace) {
    const links: NavLink[] = [
      { href: "/work/summary", label: "This week", icon: CalendarDays, tour: "nav-work-summary" },
      { href: "/work", label: "Projects", icon: LayoutList, tour: "nav-work" },
      ...(isWorkTeam ? [{ href: "/work/my", label: "My tasks", icon: CheckSquare, tour: "nav-work-my" }] : []),
    ];
    const general: NavLink[] = [{ href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" }];
    if (isAdmin) general.push({ href: "/admin/users", label: "Users", icon: UserCog, tour: "nav-admin" });
    groups = [{ links }, { label: "Workspace", links: general }];
  } else if (isCaregiver) {
    groups = [{ links: showCaregiverClients ? CAREGIVER_LINKS : CAREGIVER_LINKS.filter((l) => l.href !== "/clients") }];
  } else {
    // Projects and tasks (docs/workspace-tasks-plan.md): general work, not licensing.
    const tasks: NavLink[] = [{ href: "/work", label: "Projects & tasks", icon: KanbanSquare, tour: "nav-work" }];
    if (showClientWork) tasks.push({ href: "/client-work", label: "Client work", icon: Building2, tour: "nav-client-work" });
    // End-of-day reports (docs/client-portal-eod-plan.md, Phase C).
    tasks.push({ href: "/eod", label: "End of day", icon: NotebookPen, tour: "nav-eod" });

    const money: NavLink[] = [
      { href: "/time", label: "Time", icon: Clock, tour: "nav-time" },
      { href: "/time-tracking", label: "Time Tracking", icon: Timer, tour: "nav-time-tracking" },
    ];
    if (canManageInvoices) money.push({ href: "/invoices", label: "Invoices", icon: Receipt, tour: "nav-invoices" });
    if (canViewPayroll) money.push({ href: "/payroll", label: "Payroll", icon: Wallet, tour: "nav-payroll" });
    money.push({ href: "/reports", label: "Reports", icon: BarChart3, tour: "nav-reports" });

    const general: NavLink[] = [];
    if (showClientWorkspaces) general.push({ href: "/client-workspaces", label: "Client workspaces", icon: Building2, tour: "nav-client-workspaces" });
    general.push({ href: "/account", label: "Settings", icon: Settings, tour: "nav-settings" });
    if (isAdmin) general.push({ href: "/admin", label: "Admin", icon: UserCog, tour: "nav-admin" });

    groups = [
      { label: "Licensing", links: LICENSING },
      { label: "Tasks", links: tasks },
      { label: "General", links: GENERAL },
      { label: "Time & billing", links: money },
      { label: "Workspace", links: general },
    ];
  }

  // The longest matching link is the active one, across every section.
  const all = groups.flatMap((g) => g.links);
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeHref = all.filter((l) => matches(l.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {groups.map((group, i) => (
        <SidebarGroup key={group.label ?? i} className="px-0 py-1">
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarMenu>
            {group.links.map((link) => (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton isActive={activeHref === link.href} render={<Link href={link.href} data-tour={link.tour} />}>
                  <link.icon />
                  <span>{link.label}</span>
                </SidebarMenuButton>
                {link.href === "/intake" && newSubmissions > 0 && <SidebarMenuBadge aria-label={`${newSubmissions} new`}>{newSubmissions}</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
